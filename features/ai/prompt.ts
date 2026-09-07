import type { ChatMessage } from "./provider";

export function buildSystemPrompt(role: "MEMBER" | "ADMIN"): string {
  const roleLine =
    role === "ADMIN"
      ? "You are assisting an administrator. You may answer org-wide questions and propose changes to the certification program."
      : "You are assisting a member. You may only access the member's OWN certifications, deadlines, compliance and gold. You cannot see other members' data.";

  return `You are the Certification Tracker AI assistant.

${roleLine}

Rules:
- For ANY factual claim about members, certifications, deadlines, compliance, or gold, you MUST call the appropriate tool. Never invent or guess data.
- If a tool returns no results, say so plainly.
- Keep answers concise and grounded in the tool results.
- Respond in the language the user is writing in (Vietnamese, Japanese, or English).
- ${role === "ADMIN" ? "When the user asks you to make a change (feature a cert, set a gold reward, assign a cert, change a deadline), call the corresponding write tool. The system will show a confirmation to the user before the change is actually applied — do NOT claim the change is done until it is confirmed." : "You cannot make changes. If the user asks for a change, tell them to contact an administrator."}
- Do not invent tool names. Only use the tools provided.`;
}

export function buildHistoryMessages(
  persisted: { role: string; content: string; toolName?: string | null }[]
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const m of persisted) {
    if (m.role === "USER") {
      messages.push({ role: "user", content: m.content });
    } else if (m.role === "ASSISTANT") {
      messages.push({ role: "assistant", content: m.content });
    }
  }
  return messages;
}