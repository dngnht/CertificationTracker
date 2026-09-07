import type { z } from "zod";

export type ToolScope = "MEMBER" | "ADMIN";
export type ToolKind = "read" | "write";

export interface AiToolContext {
  userId: string;
  role: "MEMBER" | "ADMIN";
  /** Original user utterance that triggered the tool call (for audit). */
  utterance?: string;
}

export interface AiTool<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: TSchema;
  scope: ToolScope;
  kind: ToolKind;
  execute(args: z.infer<TSchema>, ctx: AiToolContext): Promise<unknown>;
}

export interface ResolvedMember {
  id: string;
  displayName: string;
  email: string;
}