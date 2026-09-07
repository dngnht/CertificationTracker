import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { isAIEnabled } from "@/features/ai/provider";
import { runAgent } from "@/features/ai/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAIEnabled()) {
    return NextResponse.json({ error: "AI Assist is not configured (set AI_API_KEY)." }, { status: 503 });
  }

  let body: { conversationId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const userId = session.user.id;
  const role = session.user.role;

  // Resolve or create the conversation (owned by the caller).
  let conversationId = body.conversationId;
  if (conversationId) {
    const conv = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conv || (conv.userId !== userId && role !== "ADMIN")) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  } else {
    const conv = await prisma.aiConversation.create({
      data: { userId, title: message.slice(0, 60) },
    });
    conversationId = conv.id;
  }

  // Persist the user message (best-effort).
  if (config.aiConversationPersist) {
    await prisma.aiMessage.create({
      data: { conversationId, role: "USER", content: message },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let assistantText = "";
      try {
        const gen = await runAgent({ userId, role, conversationId, userMessage: message });
        for await (const ev of gen) {
          if (ev.type === "delta") {
            assistantText += ev.text;
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "proposal") {
            send({
              type: "proposal",
              proposalId: ev.proposalId,
              confirmToken: ev.confirmToken,
              summary: ev.summary,
            });
          } else if (ev.type === "error") {
            send({ type: "error", message: ev.message });
          } else if (ev.type === "done") {
            if (config.aiConversationPersist && assistantText.trim()) {
              await prisma.aiMessage.create({
                data: { conversationId, role: "ASSISTANT", content: assistantText.trim() },
              });
            }
            send({ type: "done", conversationId });
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "AI request failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}