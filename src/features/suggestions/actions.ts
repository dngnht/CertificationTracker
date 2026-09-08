"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { suggestCertificationSchema, resolveSuggestionSchema } from "@/features/schemas";

/**
 * CR-CERT-002: MEMBER đề xuất cert mới chờ admin duyệt.
 * Tạo CertificationSuggestion (PENDING) — member không tự thêm vào catalog.
 */
export async function suggestCertification(input: unknown): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const user = await requireSession();
    const parsed = suggestCertificationSchema.parse(input);

    const dup = await prisma.certificationSuggestion.findFirst({
      where: { name: parsed.name, status: "PENDING" },
    });
    if (dup) throw new Error("Đã có đề xuất chờ duyệt cùng tên.");

    const suggestion = await prisma.certificationSuggestion.create({
      data: {
        code: parsed.code ?? null,
        name: parsed.name,
        provider: parsed.provider ?? null,
        suggestedById: user.id,
      },
    });
    await logAudit({
      actorId: user.id,
      action: "SUGGEST_CERTIFICATION",
      entityType: "CertificationSuggestion",
      entityId: suggestion.id,
      details: { code: parsed.code ?? null, name: parsed.name },
    });
    revalidateTracker(["/admin/verifications"]);
    return { id: suggestion.id };
  });
}

/** ADMIN duyệt đề xuất → tạo Certification trong catalog + link lại. */
export async function approveSuggestion(input: unknown): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = resolveSuggestionSchema.parse(input);
    const suggestion = await prisma.certificationSuggestion.findUnique({
      where: { id: parsed.suggestionId },
    });
    if (!suggestion) throw new Error("Suggestion not found");
    if (suggestion.status !== "PENDING") throw new Error("Suggestion đã được xử lý.");

    const code = suggestion.code ?? suggestion.name;
    const existing = await prisma.certification.findUnique({ where: { code } });
    if (existing) throw new Error(`Cert với mã ${code} đã tồn tại.`);

    const cert = await prisma.certification.create({
      data: {
        code,
        name: suggestion.name,
        provider: suggestion.provider ?? "Unknown",
      },
    });
    await prisma.certificationSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: "APPROVED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        approvedCertificationId: cert.id,
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "APPROVE_SUGGESTION",
      entityType: "CertificationSuggestion",
      entityId: suggestion.id,
      details: { certificationId: cert.id, code: cert.code },
    });
    revalidateTracker(["/admin/certifications", "/admin/verifications"]);
    return { id: cert.id };
  });
}

/** ADMIN từ chối đề xuất. */
export async function rejectSuggestion(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = resolveSuggestionSchema.parse(input);
    const suggestion = await prisma.certificationSuggestion.findUnique({
      where: { id: parsed.suggestionId },
    });
    if (!suggestion) throw new Error("Suggestion not found");
    await prisma.certificationSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: "REJECTED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectReason: parsed.rejectReason ?? null,
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "REJECT_SUGGESTION",
      entityType: "CertificationSuggestion",
      entityId: suggestion.id,
      details: { reason: parsed.rejectReason ?? null },
    });
    revalidateTracker(["/admin/verifications"]);
  });
}