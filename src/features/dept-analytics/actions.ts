"use server";

import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { TargetInputSchema, DeleteTargetInputSchema } from "./schemas";

const ANALYTICS_PATHS = ["/admin/departments", "/admin/departments/analytics", "/admin/departments/targets"];

/**
 * Tạo hoặc cập nhật target cert cho 1 department (CR-DEPT-02 §6).
 * Chống trùng bằng @@unique([departmentId, certificationId]).
 */
export async function upsertDeptTarget(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = TargetInputSchema.parse(input);

    const certificationId = parsed.certificationId ?? null;
    const data = {
      targetCount: parsed.targetCount,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      note: parsed.note ?? null,
      isActive: true,
    };

    // Upsert theo (departmentId, certificationId). certificationId nullable nên
    // không dùng được compound unique upsert — dùng findFirst + create/update.
    const existing = await prisma.departmentCertTarget.findFirst({
      where: { departmentId: parsed.departmentId, certificationId, isActive: true },
    });

    const target = existing
      ? await prisma.departmentCertTarget.update({ where: { id: existing.id }, data })
      : await prisma.departmentCertTarget.create({
          data: { ...data, departmentId: parsed.departmentId, certificationId, createdById: admin.id },
        });

    await logAudit({
      actorId: admin.id,
      action: "CREATE_DEPT_TARGET",
      entityType: "DepartmentCertTarget",
      entityId: target.id,
      details: {
        departmentId: parsed.departmentId,
        certificationId: parsed.certificationId ?? null,
        targetCount: parsed.targetCount,
        dueDate: parsed.dueDate ?? null,
      },
    });

    revalidateTracker(ANALYTICS_PATHS);
    return { id: target.id };
  });
}

/** Soft-delete (isActive = false) 1 target. */
export async function deleteDeptTarget(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const { id } = DeleteTargetInputSchema.parse(input);

    const target = await prisma.departmentCertTarget.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      actorId: admin.id,
      action: "DELETE_DEPT_TARGET",
      entityType: "DepartmentCertTarget",
      entityId: id,
      details: { departmentId: target.departmentId, certificationId: target.certificationId },
    });

    revalidateTracker(ANALYTICS_PATHS);
    return { id };
  });
}