import { config } from "@/features/config";

/**
 * Minimal provider-agnostic chat + tool-calling abstraction.
 * The app depends on this interface, never on a specific vendor.
 */

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
  /**
   * Vendor-specific continuation payload (e.g. Gemini's `extra_content`
   * thought_signature) that must be echoed back on the next assistant turn
   * for multi-step tool loops.
   */
  extraContent?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** Required by Gemini's OpenAI-compat endpoint for `role: "tool"` messages. */
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AIProvider {
  streamChat(input: {
    messages: ChatMessage[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent>;
}

/**
 * Serialize messages for the wire. Echoes vendor-specific `extra_content`
 * back on assistant tool calls (required by Gemini for continued tool loops);
 * harmless/absent for plain OpenAI.
 */
function serializeMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.tool_calls && m.tool_calls.length > 0) {
      return {
        ...m,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
          ...(tc.extraContent ? { extra_content: tc.extraContent } : {}),
        })),
      };
    }
    if (m.role === "tool") {
      return {
        ...m,
        ...(m.name ? { name: m.name } : {}),
      };
    }
    return m;
  });
}

/** Build the request body for a chat completions call. */
function buildBody(messages: ChatMessage[], tools: ToolDefinition[]) {
  return {
    model: config.aiModel,
    messages: serializeMessages(messages),
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    stream: true,
  };
}

/**
 * OpenAI-compatible provider (OpenAI, OpenRouter, Azure OpenAI via compatible
 * endpoint, and most function-calling vendors).
 */
export class OpenAICompatibleProvider implements AIProvider {
  private url: string;
  private headers: Record<string, string>;

  constructor() {
    if (config.aiProvider === "azure-openai") {
      const endpoint = config.azureOpenaiEndpoint.replace(/\/$/, "");
      this.url = `${endpoint}/openai/deployments/${config.azureOpenaiDeployment}/chat/completions?api-version=${config.azureOpenaiApiVersion}`;
      this.headers = {
        "Content-Type": "application/json",
        "api-key": config.aiApiKey,
      };
    } else {
      this.url = `${config.aiBaseUrl.replace(/\/$/, "")}/chat/completions`;
      this.headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.aiApiKey}`,
      };
    }
  }

  async *streamChat(input: {
    messages: ChatMessage[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(buildBody(input.messages, input.tools)),
      signal: input.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI provider error (${response.status}): ${body.slice(0, 300)}`);
    }
    if (!response.body) throw new Error("AI provider returned no stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Accumulators for tool-call deltas.
    // Keyed by index, but id is used to detect when a new tool call starts at the same index.
    const toolAccum: { id: string; name: string; args: string; extra?: Record<string, unknown> }[] = [];
    const slotByCallId: Record<string, number> = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIndex: number;
        while ((nlIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nlIndex).trim();
          buffer = buffer.slice(nlIndex + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") break;

          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }

          const choice = chunk?.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};

          if (delta.content) {
            yield { type: "delta", text: delta.content };
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              let slot: number;
              if (tc.id) {
                if (slotByCallId[tc.id] !== undefined) {
                  // Continuation of an already-started call with this id.
                  slot = slotByCallId[tc.id];
                } else {
                  // New call id — find a free slot, checking preferred index first.
                  const preferred = tc.index ?? toolAccum.length;
                  const existing = toolAccum[preferred];
                  slot = (existing !== undefined && existing.id !== "" && existing.id !== tc.id)
                    ? toolAccum.length
                    : preferred;
                  slotByCallId[tc.id] = slot;
                }
              } else {
                slot = tc.index ?? 0;
              }
              toolAccum[slot] ??= { id: "", name: "", args: "" };
              if (tc.id) toolAccum[slot].id += tc.id;
              if (tc.function?.name) toolAccum[slot].name += tc.function.name;
              if (tc.function?.arguments) toolAccum[slot].args += tc.function.arguments;
              if (tc.extra_content) toolAccum[slot].extra = tc.extra_content;
            }
          }
        }
      }

      for (const acc of toolAccum) {
        if (acc.name) {
          yield {
            type: "tool_call",
            toolCall: {
              id: acc.id || acc.name,
              name: acc.name,
              arguments: acc.args,
              ...(acc.extra ? { extraContent: acc.extra } : {}),
            },
          };
        }
      }

      yield { type: "done" };
    } finally {
      reader.releaseLock();
    }
  }
}

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  cached = new OpenAICompatibleProvider();
  return cached;
}

export function isAIEnabled(): boolean {
  return Boolean(config.aiApiKey);
}