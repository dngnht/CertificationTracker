import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { getAIProvider, type ChatMessage, type ToolCall } from "./provider";
import { getToolByName, getToolsForRole, toToolDefinitions } from "./tools/registry";
import type { AiToolContext } from "./tools/types";
import { buildSystemPrompt } from "./prompt";

export type EngineEvent =
  | { type: "delta"; text: string }
  | { type: "proposal"; proposalId: string; confirmToken: string; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

const MAX_ITERATIONS = 6;
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

interface ProposalPayload {
  toolName: string;
  args: Record<string, unknown>;
  confirmToken: string;
  summary: string;
}

/**
 * Run the AI chat agent loop. Reads are executed inline; writes are turned
 * into proposals awaiting explicit user confirmation.
 */
export async function runAgent(input: {
  userId: string;
  role: "MEMBER" | "ADMIN";
  conversationId: string;
  userMessage: string;
  signal?: AbortSignal;
}): Promise<AsyncGenerator<EngineEvent>> {
  const provider = getAIProvider();
  const tools = getToolsForRole(input.role);
  const toolDefs = toToolDefinitions(tools);
  const ctx: AiToolContext = { userId: input.userId, role: input.role, utterance: input.userMessage };

  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(input.role) }];
  messages.push({ role: "user", content: input.userMessage });

  async function* gen(): AsyncGenerator<EngineEvent> {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const toolCalls: ToolCall[] = [];
      let assistantText = "";

      try {
        for await (const ev of provider.streamChat({ messages, tools: toolDefs, signal: input.signal })) {
          if (ev.type === "delta") {
            assistantText += ev.text;
            yield { type: "delta", text: ev.text };
          } else if (ev.type === "tool_call") {
            toolCalls.push(ev.toolCall);
          } else if (ev.type === "error") {
            yield { type: "error", message: ev.message };
            return;
          }
        }
      } catch (err) {
        yield { type: "error", message: err instanceof Error ? err.message : "AI request failed" };
        return;
      }

      if (assistantText || toolCalls.length > 0) {
        messages.push({ role: "assistant", content: assistantText || null, tool_calls: toolCalls.length ? toolCalls : undefined });
      }

      if (toolCalls.length === 0) {
        break;
      }

      for (const tc of toolCalls) {
        const tool = getToolByName(tc.name);
        if (!tool) {
          messages.push({ role: "tool", name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }) });
          continue;
        }
        if (tool.scope === "ADMIN" && input.role !== "ADMIN") {
          messages.push({ role: "tool", name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: "Forbidden: you do not have permission to use this tool." }) });
          continue;
        }

        let args: Record<string, unknown> = {};
        try {
          args = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch {
          messages.push({ role: "tool", name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: "Invalid tool arguments" }) });
          continue;
        }

        if (tool.kind === "write") {
          const proposal = await createProposal(input.conversationId, tool.name, args);
          yield { type: "proposal", proposalId: proposal.id, confirmToken: proposal.confirmToken, summary: proposal.summary };
          messages.push({
            role: "tool",
            name: tc.name,
            tool_call_id: tc.id,
            content: JSON.stringify({
              status: "PROPOSED",
              summary: proposal.summary,
              confirmToken: proposal.confirmToken,
              message: "Present this proposed change to the user and ask them to confirm or cancel.",
            }),
          });
        } else {
          try {
            const result = await tool.execute(args, ctx);
            messages.push({ role: "tool", name: tc.name, tool_call_id: tc.id, content: JSON.stringify(result) });
          } catch (err) {
            messages.push({ role: "tool", name: tc.name, tool_call_id: tc.id, content: JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed" }) });
          }
        }
      }
    }

    yield { type: "done" };
  }

  return gen();
}

async function createProposal(conversationId: string, toolName: string, args: Record<string, unknown>) {
  const confirmToken = randomBytes(24).toString("hex");
  const summary = summarizeProposal(toolName, args);
  const payload: ProposalPayload = { toolName, args, confirmToken, summary };

  const message = await prisma.aiMessage.create({
    data: {
      conversationId,
      role: "TOOL",
      toolName,
      toolStatus: "PROPOSED",
      content: JSON.stringify(payload),
    },
  });

  return { id: message.id, confirmToken, summary };
}

function summarizeProposal(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "addRecommendedCertification":
      return `Feature ${args.certCode} as recommended${args.goldReward !== undefined ? ` with ${args.goldReward} gold` : ""}.`;
    case "setCertificationGoldReward":
      return `Set gold reward for ${args.certCode} to ${args.goldReward}.`;
    case "assignRecommendedToMembers":
      return `Assign ${args.certCode} as Recommended to ${Array.isArray(args.memberQuery) ? args.memberQuery.length : "?"} member(s).`;
    case "updateAssignmentDeadline":
      return `Change deadline for ${args.memberQuery} on ${args.certCode} to ${args.deadline}.`;
    default:
      return `Apply ${toolName}.`;
  }
}

/**
 * Execute a previously proposed mutation after explicit user confirmation.
 */
export async function confirmProposal(input: {
  proposalId: string;
  confirmToken: string;
  userId: string;
  role: "MEMBER" | "ADMIN";
}): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const message = await prisma.aiMessage.findUnique({ where: { id: input.proposalId } });
  if (!message || message.role !== "TOOL" || message.toolStatus !== "PROPOSED") {
    return { ok: false, error: "Proposal not found or already processed" };
  }
  if (Date.now() - message.createdAt.getTime() > PROPOSAL_TTL_MS) {
    await prisma.aiMessage.update({ where: { id: message.id }, data: { toolStatus: "REJECTED" } });
    return { ok: false, error: "Proposal expired" };
  }

  let payload: ProposalPayload;
  try {
    payload = JSON.parse(message.content) as ProposalPayload;
  } catch {
    return { ok: false, error: "Invalid proposal payload" };
  }
  if (payload.confirmToken !== input.confirmToken) {
    return { ok: false, error: "Invalid confirmation token" };
  }

  const tool = getToolByName(payload.toolName);
  if (!tool) return { ok: false, error: "Unknown tool" };
  if (tool.scope === "ADMIN" && input.role !== "ADMIN") {
    await prisma.aiMessage.update({ where: { id: message.id }, data: { toolStatus: "REJECTED" } });
    return { ok: false, error: "Forbidden" };
  }

  const ctx: AiToolContext = { userId: input.userId, role: input.role, utterance: payload.args.utterance as string | undefined };
  try {
    const result = await tool.execute(payload.args, ctx);
    await prisma.aiMessage.update({ where: { id: message.id }, data: { toolStatus: "EXECUTED" } });
    return { ok: true, result };
  } catch (err) {
    await prisma.aiMessage.update({ where: { id: message.id }, data: { toolStatus: "ERROR" } });
    return { ok: false, error: err instanceof Error ? err.message : "Execution failed" };
  }
}

export async function cancelProposal(proposalId: string, userId: string, role: "MEMBER" | "ADMIN") {
  const message = await prisma.aiMessage.findUnique({ where: { id: proposalId } });
  if (!message || message.role !== "TOOL" || message.toolStatus !== "PROPOSED") {
    return { ok: false, error: "Proposal not found or already processed" };
  }
  const conv = await prisma.aiConversation.findUnique({ where: { id: message.conversationId } });
  if (!conv || (conv.userId !== userId && role !== "ADMIN")) {
    return { ok: false, error: "Forbidden" };
  }
  await prisma.aiMessage.update({ where: { id: message.id }, data: { toolStatus: "REJECTED" } });
  return { ok: true };
}

export { config };