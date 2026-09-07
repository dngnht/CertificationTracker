"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { goldBalance, recentGoldTransactions } from "@/features/gold/award";
import { config } from "@/features/config";
import { z } from "zod";

const setRewardSchema = z.object({
  certCode: z.string().trim().min(1),
  goldReward: z.number().int().min(0).max(1_000_000),
});

const featureSchema = z.object({
  certCode: z.string().trim().min(1),
  note: z.string().trim().max(500).optional().nullable(),
});

const grantGoldSchema = z.object({
  memberQuery: z.string().trim().min(1),
  amount: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

const clawbackSchema = z.object({
  memberQuery: z.string().trim().min(1),
  certCode: z.string().trim().min(1),
  amount: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

async function resolveMember(query: string) {
  const q = query.trim().toLowerCase();
  const users = await prisma.user.findMany({ where: { isActive: true } });
  return (
    users.find((u) => u.email === q) ||
    users.find((u) => u.email.includes(q)) ||
    users.find((u) => u.displayName.toLowerCase() === q) ||
    null
  );
}

export async function setCertificationReward(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = setRewardSchema.parse(input);
    const cert = await prisma.certification.findUnique({ where: { code: parsed.certCode } });
    if (!cert) throw new Error("Certification not found");
    await prisma.certification.update({
      where: { id: cert.id },
      data: { goldReward: parsed.goldReward },
    });
    await logAudit({
      actorId: admin.id,
      action: "SET_CERT_REWARD",
      entityType: "Certification",
      entityId: cert.id,
      details: { goldReward: parsed.goldReward },
    });
    revalidateTracker();
  });
}

export async function featureRecommendedCertification(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = featureSchema.parse(input);
    const cert = await prisma.certification.findUnique({ where: { code: parsed.certCode } });
    if (!cert) throw new Error("Certification not found");
    await prisma.certification.update({
      where: { id: cert.id },
      data: {
        isRecommendedFeatured: true,
        recommendedNote: parsed.note ?? null,
        featuredAt: new Date(),
        featuredById: admin.id,
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "FEATURE_RECOMMENDED_CERT",
      entityType: "Certification",
      entityId: cert.id,
      details: { note: parsed.note ?? null },
    });
    revalidateTracker();
  });
}

export async function unfeatureRecommendedCertification(certCode: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const cert = await prisma.certification.findUnique({ where: { code: certCode } });
    if (!cert) throw new Error("Certification not found");
    await prisma.certification.update({
      where: { id: cert.id },
      data: { isRecommendedFeatured: false, featuredAt: null, featuredById: null },
    });
    await logAudit({
      actorId: admin.id,
      action: "FEATURE_RECOMMENDED_CERT",
      entityType: "Certification",
      entityId: cert.id,
      details: { featured: false },
    });
    revalidateTracker();
  });
}

export async function grantManualGold(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = grantGoldSchema.parse(input);
    const member = await resolveMember(parsed.memberQuery);
    if (!member) throw new Error("Member not found");
    await prisma.goldTransaction.create({
      data: {
        memberId: member.id,
        amount: parsed.amount,
        reason: "MANUAL_ADJUSTMENT",
        note: parsed.note ?? null,
        createdById: admin.id,
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "GRANT_GOLD",
      entityType: "User",
      entityId: member.id,
      details: { amount: parsed.amount, note: parsed.note ?? null },
    });
    revalidateTracker();
  });
}

export async function clawbackGold(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = clawbackSchema.parse(input);
    const member = await resolveMember(parsed.memberQuery);
    if (!member) throw new Error("Member not found");
    const cert = await prisma.certification.findUnique({ where: { code: parsed.certCode } });
    if (!cert) throw new Error("Certification not found");
    await prisma.goldTransaction.create({
      data: {
        memberId: member.id,
        certificationId: cert.id,
        amount: -Math.abs(parsed.amount),
        reason: "CLAWBACK",
        note: parsed.note ?? null,
        createdById: admin.id,
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "CLAWBACK_GOLD",
      entityType: "User",
      entityId: member.id,
      details: { certCode: parsed.certCode, amount: parsed.amount, note: parsed.note ?? null },
    });
    revalidateTracker();
  });
}

export async function getMyGold(): Promise<
  ActionResult<{ balance: number; recent: Awaited<ReturnType<typeof recentGoldTransactions>> }>
> {
  return wrapAction(async () => {
    const user = await requireSession();
    const [balance, recent] = await Promise.all([
      goldBalance(prisma, user.id),
      recentGoldTransactions(prisma, user.id),
    ]);
    return { balance, recent };
  });
}

export async function getGoldLeaderboard(input: { limit?: number } = {}): Promise<
  ActionResult<
    { rank: number; memberId: string; displayName: string; email: string; balance: number }[]
  >
> {
  return wrapAction(async () => {
    await requireSession();
    if (!config.goldLeaderboardEnabled) {
      throw new Error("Leaderboard is disabled");
    }
    const limit = Math.min(input.limit ?? 10, 100);

    const rows = await prisma.goldTransaction.groupBy({
      by: ["memberId"],
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: limit,
    });

    const members = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.memberId) } },
      select: { id: true, displayName: true, email: true },
    });
    const memberMap = new Map(members.map((m) => [m.id, m]));

    return rows.map((r, i) => ({
      rank: i + 1,
      memberId: r.memberId,
      displayName: memberMap.get(r.memberId)?.displayName ?? "Unknown",
      email: memberMap.get(r.memberId)?.email ?? "",
      balance: r._sum.amount ?? 0,
    }));
  });
}