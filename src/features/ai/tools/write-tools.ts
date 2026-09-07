import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/features/audit/log";
import { resolveMember, resolveMembers } from "./resolve";
import type { AiTool, AiToolContext } from "./types";

/**
 * Audit an AI-initiated mutation.
 */
async function auditAiMutation(
  actorId: string,
  toolName: string,
  entityType: string,
  entityId: string | null,
  utterance: string | undefined,
  details: Record<string, unknown>
) {
  await logAudit({
    actorId,
    action: "AI_TOOL_MUTATION",
    entityType,
    entityId,
    details: {
      source: "AI_ASSIST",
      tool: toolName,
      utterance: utterance ? utterance.slice(0, 500) : null,
      ...details,
    },
  });
}

export const addRecommendedCertification: AiTool = {
  name: "addRecommendedCertification",
  description:
    "Mark an existing catalog certification as company-recommended (featured) and optionally set its gold reward and note.",
  scope: "ADMIN",
  kind: "write",
  schema: z.object({
    certCode: z.string().trim().min(1),
    goldReward: z.number().int().min(0).max(1_000_000).optional(),
    note: z.string().trim().max(500).optional(),
  }),
  async execute(args, ctx: AiToolContext) {
    const cert = await prisma.certification.findUnique({ where: { code: args.certCode } });
    if (!cert) throw new Error(`Certification "${args.certCode}" not found in catalog`);
    await prisma.certification.update({
      where: { id: cert.id },
      data: {
        isRecommendedFeatured: true,
        recommendedNote: args.note ?? cert.recommendedNote,
        featuredAt: new Date(),
        featuredById: ctx.userId,
        ...(args.goldReward !== undefined ? { goldReward: args.goldReward } : {}),
      },
    });
    await auditAiMutation(ctx.userId, "addRecommendedCertification", "Certification", cert.id, ctx.utterance, {
      certCode: args.certCode,
      goldReward: args.goldReward,
      note: args.note,
    });
    return { ok: true, certCode: args.certCode, featured: true, goldReward: args.goldReward ?? cert.goldReward };
  },
};

export const setCertificationGoldReward: AiTool = {
  name: "setCertificationGoldReward",
  description: "Set or update the gold reward bounty for a certification.",
  scope: "ADMIN",
  kind: "write",
  schema: z.object({ certCode: z.string().trim().min(1), goldReward: z.number().int().min(0).max(1_000_000) }),
  async execute(args, ctx: AiToolContext) {
    const cert = await prisma.certification.findUnique({ where: { code: args.certCode } });
    if (!cert) throw new Error(`Certification "${args.certCode}" not found in catalog`);
    await prisma.certification.update({
      where: { id: cert.id },
      data: { goldReward: args.goldReward },
    });
    await auditAiMutation(ctx.userId, "setCertificationGoldReward", "Certification", cert.id, ctx.utterance, {
      certCode: args.certCode,
      goldReward: args.goldReward,
    });
    return { ok: true, certCode: args.certCode, goldReward: args.goldReward };
  },
};

export const assignRecommendedToMembers: AiTool = {
  name: "assignRecommendedToMembers",
  description:
    "Bulk-create RECOMMENDED assignments for a certification to one or more members (by name or email). Dedupes existing assignments.",
  scope: "ADMIN",
  kind: "write",
  schema: z.object({
    certCode: z.string().trim().min(1),
    memberQuery: z.array(z.string().min(1)).min(1),
    deadline: z.string().datetime().optional().nullable(),
  }),
  async execute(args, ctx: AiToolContext) {
    const cert = await prisma.certification.findUnique({ where: { code: args.certCode } });
    if (!cert) throw new Error(`Certification "${args.certCode}" not found in catalog`);
    const members = await resolveMembers(args.memberQuery);
    if (members.length === 0) throw new Error("No members matched the provided queries");

    const existing = await prisma.certificationAssignment.findMany({
      where: { certificationId: cert.id, memberId: { in: members.map((m) => m.id) } },
      select: { memberId: true },
    });
    const existingIds = new Set(existing.map((e) => e.memberId));
    const toCreate = members.filter((m) => !existingIds.has(m.id));

    if (toCreate.length > 0) {
      await prisma.certificationAssignment.createMany({
        data: toCreate.map((m) => ({
          memberId: m.id,
          certificationId: cert.id,
          type: "RECOMMENDED",
          deadline: args.deadline ? new Date(args.deadline) : null,
          status: "NOT_STARTED",
        })),
      });
    }

    await auditAiMutation(ctx.userId, "assignRecommendedToMembers", "Certification", cert.id, ctx.utterance, {
      certCode: args.certCode,
      created: toCreate.length,
      skippedDuplicates: members.length - toCreate.length,
      memberIds: toCreate.map((m) => m.id),
    });
    return { ok: true, certCode: args.certCode, created: toCreate.length, skipped: members.length - toCreate.length };
  },
};

export const updateAssignmentDeadline: AiTool = {
  name: "updateAssignmentDeadline",
  description: "Change the deadline of a member's assignment for a certification.",
  scope: "ADMIN",
  kind: "write",
  schema: z.object({
    memberQuery: z.string().min(1),
    certCode: z.string().trim().min(1),
    deadline: z.string().datetime(),
  }),
  async execute(args, ctx: AiToolContext) {
    const member = await resolveMember(args.memberQuery);
    if (!member) throw new Error(`Member "${args.memberQuery}" not found`);
    const cert = await prisma.certification.findUnique({ where: { code: args.certCode } });
    if (!cert) throw new Error(`Certification "${args.certCode}" not found in catalog`);

    const assignment = await prisma.certificationAssignment.findUnique({
      where: { memberId_certificationId: { memberId: member.id, certificationId: cert.id } },
    });
    if (!assignment) throw new Error(`No assignment found for ${member.displayName} on ${args.certCode}`);

    await prisma.certificationAssignment.update({
      where: { id: assignment.id },
      data: { deadline: new Date(args.deadline) },
    });

    await auditAiMutation(ctx.userId, "updateAssignmentDeadline", "CertificationAssignment", assignment.id, ctx.utterance, {
      member: member.email,
      certCode: args.certCode,
      deadline: args.deadline,
    });
    return { ok: true, member: member.displayName, certCode: args.certCode, deadline: args.deadline };
  },
};

export const writeTools: AiTool[] = [
  addRecommendedCertification,
  setCertificationGoldReward,
  assignRecommendedToMembers,
  updateAssignmentDeadline,
];