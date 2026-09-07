import { zodToJsonSchema } from "zod-to-json-schema";

import { memberReadTools, adminReadTools } from "./read-tools";
import { writeTools } from "./write-tools";
import type { AiTool } from "./types";
import type { ToolDefinition } from "../provider";

const ALL_TOOLS: AiTool[] = [...memberReadTools, ...adminReadTools, ...writeTools];

/**
 * Return the tools available to a role. Members only ever see member-scoped
 * tools; admin tools (read + write) are not even registered for members.
 */
export function getToolsForRole(role: "MEMBER" | "ADMIN"): AiTool[] {
  return ALL_TOOLS.filter((t) => role === "ADMIN" || t.scope === "MEMBER");
}

export function getToolByName(name: string): AiTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function toToolDefinitions(tools: AiTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.schema, { $refStrategy: "none" }) as Record<string, unknown>,
    },
  }));
}