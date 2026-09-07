"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import {
  assignCertificationSchema,
  updateAssignmentSchema,
  exemptAssignmentSchema,
} from "@/features/schemas";

/**
 * Assign a certification to one or more members. Existing assignments are
 * skipped (memberId + certificationId unique constraint).
 */
export async function bulkAssignCertification(
  input: unknown
): Promise<ActionResult<{ created: number; skipped: number }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = assignCertificationSchema.parse(input);

    const certification = await prisma.certification.findUnique({
      where: { id: parsed.certificationId },
    });
    if (!certification) throw new Error("Certification not found");

    const existing = await prisma.certificationAssignment.findMany({
      where: {
        certificationId: parsed.certificationId,
        memberId: { in: parsed.memberIds },
      },
      select: { memberId: true },
    });
    const existingMemberIds = new Set(existing.map((e) => e.memberId));

    const toCreate = parsed.memberIds.filter((id) => !existingMemberIds.has(id));

    if (toCreate.length > 0) {
      await prisma.certificationAssignment.createMany({
        data: toCreate.map((memberId) => ({
          memberId,
          certificationId: parsed.certificationId,
          type: parsed.type,
          deadline: parsed.deadline ? new Date(parsed.deadline) : null,
          notes: parsed.notes ?? null,
          status: "NOT_STARTED",
        })),
      });
    }

    await logAudit({
      actorId: admin.id,
      action: "CREATE_ASSIGNMENT",
      entityType: "CertificationAssignment",
      details: {
        certificationId: parsed.certificationId,
        memberIds: toCreate,
        skippedDuplicates: parsed.memberIds.length - toCreate.length,
        type: parsed.type,
      },
    });

    revalidateTracker();
    return { created: toCreate.length, skipped: parsed.memberIds.length - toCreate.length };
  });
}

export async function updateAssignment(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = updateAssignmentSchema.parse(input);
    const { assignmentId, ...data } = parsed;
    await prisma.certificationAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(data.type ? { type: data.type } : {}),
        ...(data.deadline !== undefined ? { deadline: data.deadline ? new Date(data.deadline) : null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "UPDATE_ASSIGNMENT",
      entityType: "CertificationAssignment",
      entityId: assignmentId,
    });
    revalidateTracker();
  });
}

export async function exemptAssignment(input: unknown): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = exemptAssignmentSchema.parse(input);
    await prisma.certificationAssignment.update({
      where: { id: parsed.assignmentId },
      data: {
        exemptedAt: new Date(),
        exemptedById: admin.id,
        exemptionReason: parsed.reason,
        status: "EXEMPTED",
      },
    });
    await logAudit({
      actorId: admin.id,
      action: "EXEMPT_ASSIGNMENT",
      entityType: "CertificationAssignment",
      entityId: parsed.assignmentId,
      details: { reason: parsed.reason },
    });
    revalidateTracker();
  });
}

export async function removeExemption(assignmentId: string): Promise<ActionResult> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    await prisma.certificationAssignment.update({
      where: { id: assignmentId },
      data: {
        exemptedAt: null,
        exemptedById: null,
        exemptionReason: null,
        status: "NOT_STARTED",
      },
    });
    revalidateTracker();
  });
}