"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { createCertificationSchema, updateCertificationSchema } from "@/features/schemas";

export async function createCertification(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = createCertificationSchema.parse(input);
    await prisma.certification.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        provider: parsed.provider,
        description: parsed.description ?? null,
        validityMonths: parsed.validityMonths ?? null,
        goldReward: parsed.goldReward ?? 0,
        isRecommendedFeatured: parsed.isRecommendedFeatured ?? false,
        recommendedNote: parsed.recommendedNote ?? null,
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "CREATE_CERTIFICATION",
      entityType: "Certification",
      details: { code: parsed.code },
    });
    revalidateTracker();
  });
}

export async function updateCertification(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = updateCertificationSchema.parse(input);
    const { id, ...data } = parsed;
    await prisma.certification.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
        ...(data.validityMonths !== undefined ? { validityMonths: data.validityMonths ?? null } : {}),
        ...(data.goldReward !== undefined ? { goldReward: data.goldReward ?? 0 } : {}),
        ...(data.isRecommendedFeatured !== undefined ? { isRecommendedFeatured: data.isRecommendedFeatured } : {}),
        ...(data.recommendedNote !== undefined ? { recommendedNote: data.recommendedNote ?? null } : {}),
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "UPDATE_CERTIFICATION",
      entityType: "Certification",
      entityId: id,
    });
    revalidateTracker();
  });
}

export async function disableCertification(id: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    await prisma.certification.update({ where: { id }, data: { isActive: false } });
    await logAudit({
      actorId: admin.id,
      action: "DISABLE_CERTIFICATION",
      entityType: "Certification",
      entityId: id,
    });
    revalidateTracker();
  });
}

export async function enableCertification(id: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    await prisma.certification.update({ where: { id }, data: { isActive: true } });
    revalidateTracker();
  });
}