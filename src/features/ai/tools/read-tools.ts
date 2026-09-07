import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getMemberDashboardData } from "@/features/dashboard/queries";
import {
  getOverdueAssignments,
  getMissingAssignments,
  getUpcomingDeadlines,
  getExpiringCertificates,
} from "@/features/reports/queries";
import { getHotCertifications } from "@/features/ai/hotcert";
import { goldBalance, recentGoldTransactions } from "@/features/gold/award";
import { resolveMember } from "./resolve";
import type { AiTool, AiToolContext } from "./types";

const statusEnum = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE", "EXEMPTED"];
const typeEnum = ["REQUIRED", "RECOMMENDED"];

// ---------------------------------------------------------------------------
// MEMBER scope
// ---------------------------------------------------------------------------

export const getMyAssignments: AiTool = {
  name: "getMyAssignments",
  description:
    "List the current user's certification assignments. Optionally filter by derived status or type.",
  scope: "MEMBER",
  kind: "read",
  schema: z.object({
    status: z.enum(statusEnum as [string, ...string[]]).optional(),
    type: z.enum(typeEnum as [string, ...string[]]).optional(),
  }),
  async execute(args, ctx: AiToolContext) {
    const data = await getMemberDashboardData(ctx.userId);
    return data.assignments
      .filter((a) => (args.status ? a.effectiveStatus === args.status : true))
      .filter((a) => (args.type ? a.type === args.type : true))
      .map((a) => ({
        code: a.certification.code,
        name: a.certification.name,
        type: a.type,
        deadline: a.deadline?.toISOString() ?? null,
        status: a.effectiveStatus,
        progress: a.progressPercent,
      }));
  },
};

export const getMyDeadlines: AiTool = {
  name: "getMyDeadlines",
  description: "List the current user's upcoming assignment deadlines within a number of days.",
  scope: "MEMBER",
  kind: "read",
  schema: z.object({ withinDays: z.number().int().min(1).max(365).optional() }),
  async execute(args, ctx) {
    const data = await getMemberDashboardData(ctx.userId);
    const withinDays = args.withinDays ?? 90;
    const now = Date.now();
    return data.assignments
      .filter((a) => a.deadline && a.effectiveStatus !== "COMPLETED" && a.effectiveStatus !== "EXEMPTED")
      .map((a) => ({
        code: a.certification.code,
        deadline: a.deadline!.toISOString(),
        daysLeft: Math.ceil((a.deadline!.getTime() - now) / 86400000),
        status: a.effectiveStatus,
        progress: a.progressPercent,
      }))
      .filter((a) => a.daysLeft <= withinDays)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  },
};

export const getMyGold: AiTool = {
  name: "getMyGold",
  description: "Return the current user's gold balance and recent awards.",
  scope: "MEMBER",
  kind: "read",
  schema: z.object({}),
  async execute(_args, ctx) {
    const [balance, recent] = await Promise.all([
      goldBalance(prisma, ctx.userId),
      recentGoldTransactions(prisma, ctx.userId, 5),
    ]);
    return {
      balance,
      recent: recent.map((t) => ({
        amount: t.amount,
        reason: t.reason,
        certCode: t.certification?.code ?? null,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  },
};

export const getRecommendedCerts: AiTool = {
  name: "getRecommendedCerts",
  description:
    "List certifications the company recommends (featured), with their gold reward. Shared read tool.",
  scope: "MEMBER",
  kind: "read",
  schema: z.object({
    provider: z.string().optional(),
    sortBy: z.enum(["gold", "provider"]).optional(),
  }),
  async execute(args) {
    const certs = await prisma.certification.findMany({
      where: { isActive: true, isRecommendedFeatured: true, ...(args.provider ? { provider: args.provider } : {}) },
      select: {
        code: true,
        name: true,
        provider: true,
        goldReward: true,
        recommendedNote: true,
      },
    });
    const sorted = [...certs].sort((a, b) =>
      args.sortBy === "provider" ? a.provider.localeCompare(b.provider) : b.goldReward - a.goldReward
    );
    return sorted;
  },
};

export const getMyCompliance: AiTool = {
  name: "getMyCompliance",
  description: "Return the current user's compliance status and any blocking required items.",
  scope: "MEMBER",
  kind: "read",
  schema: z.object({}),
  async execute(_args, ctx) {
    const data = await getMemberDashboardData(ctx.userId);
    const blocking = data.assignments.filter(
      (a) =>
        a.type === "REQUIRED" &&
        a.effectiveStatus !== "COMPLETED" &&
        a.effectiveStatus !== "EXEMPTED"
    );
    return {
      status: data.compliance.status,
      requiredCount: data.compliance.requiredCount,
      satisfiedCount: data.compliance.satisfiedCount,
      blockingItems: blocking.map((a) => ({
        code: a.certification.code,
        status: a.effectiveStatus,
        deadline: a.deadline?.toISOString() ?? null,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// ADMIN scope
// ---------------------------------------------------------------------------

export const getOverdueMembers: AiTool = {
  name: "getOverdueMembers",
  description: "Org-wide list of overdue REQUIRED assignments. Filters by provider, cert code, or min days overdue.",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({
    provider: z.string().optional(),
    certCode: z.string().optional(),
    minDaysOverdue: z.number().int().min(0).optional(),
  }),
  async execute(args) {
    const certificationId = args.certCode
      ? (await prisma.certification.findUnique({ where: { code: args.certCode }, select: { id: true } }))?.id
      : undefined;
    const result = await getOverdueAssignments({
      provider: args.provider,
      certificationId,
      minDaysOverdue: args.minDaysOverdue,
    });
    return result.items.map((a) => ({
      member: a.member.displayName,
      email: a.member.email,
      cert: a.certification.code,
      deadline: a.deadline?.toISOString() ?? null,
      daysOverdue: a.daysOverdue,
      progress: a.progressPercent,
    }));
  },
};

export const getMissingMembers: AiTool = {
  name: "getMissingMembers",
  description: "Org-wide list of members who have not started a required certification.",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({ certCode: z.string().optional() }),
  async execute(args) {
    const certificationId = args.certCode
      ? (await prisma.certification.findUnique({ where: { code: args.certCode }, select: { id: true } }))?.id
      : undefined;
    const result = await getMissingAssignments({ certificationId });
    return result.items.map((a) => ({
      member: a.member.displayName,
      email: a.member.email,
      cert: a.certification.code,
      deadline: a.deadline?.toISOString() ?? null,
    }));
  },
};

export const getUpcomingDeadlinesTool: AiTool = {
  name: "getUpcomingDeadlines",
  description: "Org-wide assignments with deadlines within a number of days.",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({ withinDays: z.number().int().min(1).max(365).optional() }),
  async execute(args) {
    const result = await getUpcomingDeadlines({}, args.withinDays ?? 30);
    return result.items.map((a) => ({
      member: a.member.displayName,
      cert: a.certification.code,
      deadline: a.deadline?.toISOString() ?? null,
      daysLeft: a.daysLeft,
      progress: a.progressPercent,
    }));
  },
};

export const getExpiringCertificatesTool: AiTool = {
  name: "getExpiringCertificates",
  description: "Certificates about to expire within a number of days (or already expired).",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({ withinDays: z.number().int().min(0).max(365).optional() }),
  async execute(args) {
    const result = await getExpiringCertificates(args.withinDays ?? 30);
    return result.items.map((c) => ({
      member: c.member.displayName,
      cert: c.certification.code,
      expiration: c.expirationDate.toISOString(),
      daysLeft: c.daysLeft,
    }));
  },
};

export const getComplianceOverview: AiTool = {
  name: "getComplianceOverview",
  description: "Org-wide compliance totals and rate.",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({}),
  async execute() {
    const members = await prisma.user.findMany({
      where: { isActive: true, role: "MEMBER" },
      include: {
        assignments: {
          include: {
            certification: { select: { code: true } },
            memberCert: true,
          },
        },
      },
    });
    const { calculateCompliance } = await import("@/features/compliance/calculate");
    let compliant = 0;
    let requiredTotal = 0;
    for (const m of members) {
      const c = calculateCompliance(m.assignments);
      requiredTotal += c.requiredCount;
      if (c.compliant) compliant++;
    }
    return {
      totalMembers: members.length,
      compliantMembers: compliant,
      nonCompliantMembers: members.length - compliant,
      complianceRate: members.length ? Math.round((compliant / members.length) * 100) : 0,
      totalRequiredAssignments: requiredTotal,
    };
  },
};

export const getHotCertificationsTool: AiTool = {
  name: "getHotCertifications",
  description: "Ranked 'hot' certifications by a popularity score over a window.",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({ windowDays: z.number().int().min(1).max(365).optional(), limit: z.number().int().min(1).max(50).optional() }),
  async execute(args) {
    return getHotCertifications({ windowDays: args.windowDays ?? 90, limit: args.limit ?? 10 });
  },
};

export const getMemberSummary: AiTool = {
  name: "getMemberSummary",
  description: "One member's certification plan and gold balance. Resolve by name or email.",
  scope: "ADMIN",
  kind: "read",
  schema: z.object({ memberQuery: z.string().min(1) }),
  async execute(args) {
    const member = await resolveMember(args.memberQuery);
    if (!member) return { found: false };
    const data = await getMemberDashboardData(member.id);
    const balance = await goldBalance(prisma, member.id);
    return {
      found: true,
      member: { name: member.displayName, email: member.email },
      compliance: data.compliance.status,
      goldBalance: balance,
      assignments: data.assignments.map((a) => ({
        code: a.certification.code,
        type: a.type,
        status: a.effectiveStatus,
        deadline: a.deadline?.toISOString() ?? null,
        progress: a.progressPercent,
      })),
    };
  },
};

export const memberReadTools: AiTool[] = [
  getMyAssignments,
  getMyDeadlines,
  getMyGold,
  getRecommendedCerts,
  getMyCompliance,
];

export const adminReadTools: AiTool[] = [
  getOverdueMembers,
  getMissingMembers,
  getUpcomingDeadlinesTool,
  getExpiringCertificatesTool,
  getComplianceOverview,
  getHotCertificationsTool,
  getMemberSummary,
];