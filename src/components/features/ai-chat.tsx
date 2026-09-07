"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { confirmAiProposal, cancelAiProposal } from "@/features/ai/conversations";

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  proposal?: { proposalId: string; confirmToken: string; summary: string };
  confirmed?: boolean;
}

interface ProposalEvent {
  type: "proposal";
  proposalId: string;
  confirmToken: string;
  summary: string;
}

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);

    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "" }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Request failed");
      }
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantBuf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          let ev: any;
          try {
            ev = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev.type === "delta") {
            assistantBuf += ev.text;
            setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, text: assistantBuf } : msg)));
          } else if (ev.type === "proposal") {
            const p = ev as ProposalEvent;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, proposal: { proposalId: p.proposalId, confirmToken: p.confirmToken, summary: p.summary } }
                  : msg
              )
            );
          } else if (ev.type === "error") {
            setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, role: "error", text: ev.message } : msg)));
          }
        }
      }
    } catch (err) {
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantId ? { ...msg, role: "error", text: err instanceof Error ? err.message : "Request failed" } : msg))
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(msg: UiMessage) {
    if (!msg.proposal) return;
    const { proposalId, confirmToken } = msg.proposal;
    const result = await confirmAiProposal(proposalId, confirmToken);
    if (result.ok) {
      toast.success("Change applied");
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, confirmed: true, proposal: undefined } : x)));
    } else {
      toast.error(result.error);
    }
  }

  async function cancel(msg: UiMessage) {
    if (!msg.proposal) return;
    await cancelAiProposal(msg.proposal.proposalId);
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, confirmed: true, proposal: undefined } : x)));
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[560px] w-[380px] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="font-semibold">AI Assist</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask about your certifications, deadlines, compliance, recommended certs and gold.
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-1">
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "ml-8 bg-primary text-primary-foreground"
                      : msg.role === "error"
                        ? "mr-8 bg-red-50 text-red-700"
                        : "mr-8 bg-muted"
                  )}
                >
                  {msg.text || (msg.role === "assistant" ? "…" : "")}
                </div>
                {msg.proposal && !msg.confirmed && (
                  <div className="mr-8 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-medium">Proposed change</p>
                    <p className="mb-3 text-sm">{msg.proposal.summary}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => confirm(msg)}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => cancel(msg)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about certifications..."
                className="min-h-[40px] resize-none"
                rows={1}
              />
              <Button size="icon" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle AI Assist"
      >
        <Bot className="h-5 w-5" />
      </Button>
    </>
  );
}