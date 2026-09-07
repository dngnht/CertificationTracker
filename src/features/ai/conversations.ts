"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { wrapAction, type ActionResult } from "@/lib/server-action";
import { confirmProposal, cancelProposal } from "@/features/ai/engine";

export async function listAiConversations(): Promise<
  ActionResult<{ id: string; title: string | null; updatedAt: string }[]>
> {
  return wrapAction(async () => {
    const user = await requireSession();
    const convs = await prisma.aiConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
  });
}

export async function getAiConversation(
  id: string
): Promise<
  ActionResult<{
    id: string;
    title: string | null;
    messages: { id: string; role: string; content: string; toolName?: string | null; toolStatus?: string | null }[];
  }>
> {
  return wrapAction(async () => {
    const user = await requireSession();
    const conv = await prisma.aiConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conv) throw new Error("Conversation not found");
    if (conv.userId !== user.id && user.role !== "ADMIN") {
      throw new Error("Forbidden");
    }
    return {
      id: conv.id,
      title: conv.title,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        toolStatus: m.toolStatus,
      })),
    };
  });
}

export async function deleteAiConversation(id: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    const conv = await prisma.aiConversation.findUnique({ where: { id } });
    if (!conv) throw new Error("Conversation not found");
    if (conv.userId !== user.id && user.role !== "ADMIN") {
      throw new Error("Forbidden");
    }
    await prisma.aiConversation.delete({ where: { id } });
  });
}

export async function confirmAiProposal(
  proposalId: string,
  confirmToken: string
): Promise<ActionResult<unknown>> {
  return wrapAction(async () => {
    const user = await requireSession();
    const result = await confirmProposal({
      proposalId,
      confirmToken,
      userId: user.id,
      role: user.role,
    });
    if (!result.ok) throw new Error(result.error);
    return result.result;
  });
}

export async function cancelAiProposal(proposalId: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const user = await requireSession();
    const result = await cancelProposal(proposalId, user.id, user.role);
    if (!result.ok) throw new Error(result.error);
  });
}