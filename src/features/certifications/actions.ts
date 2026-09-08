"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import {
  createCertificationSchema,
  updateCertificationSchema,
  suggestCertificationsQuerySchema,
} from "@/features/schemas";
import { rankSimilar } from "./similarity";

interface CertLike {
  id: string;
  code: string;
  name: string;
  provider: string | null;
}

export async function createCertification(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = createCertificationSchema.parse(input);

    // CR-CERT-002: duplicate guard — warn unless the admin forced it.
    const existing = await prisma.certification.findMany({
      select: { id: true, code: true, name: true, provider: true },
    });
    const similar = rankSimilar(
      `${parsed.code} ${parsed.name}`,
      existing,
      (c) => ({ code: c.code, name: c.name }),
      { threshold: 0.8, limit: 5 }
    );
    if (similar.length > 0 && !parsed.force) {
      throw new Error(
        `Cert tương tự đã tồn tại: ${similar.map((s) => s.item.code).join(", ")}. Truyền force=true để tạo mới.`
      );
    }

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
        verifyUrlPattern: parsed.verifyUrlPattern ?? null,
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

/** Fuzzy-search the catalog (CR-CERT-002) — used by the review form dropdown. */
export async function suggestCertifications(
  input: unknown
): Promise<ActionResult<CertLike[]>> {
  return wrapAction(async () => {
    await requireSession();
    const parsed = suggestCertificationsQuerySchema.parse(input);
    const all = await prisma.certification.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, provider: true },
    });
    const ranked = rankSimilar(
      parsed.query,
      all,
      (c) => ({ code: c.code, name: c.name }),
      { limit: parsed.limit ?? 5, threshold: 0.3 }
    );
    return ranked.map((r) => r.item);
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
        ...(data.verifyUrlPattern !== undefined ? { verifyUrlPattern: data.verifyUrlPattern ?? null } : {}),
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