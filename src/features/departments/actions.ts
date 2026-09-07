"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { splitPath, joinPath, ancestorPaths, parentPath } from "./path";
import { MemberInput, normalizeRole } from "./schemas";
import { upsertDepartmentByPath } from "./service";

export { upsertDepartmentByPath };

/** Tạo department (admin). Trả về summary để UI hiển thị. */
export async function createDepartment(input: unknown): Promise<ActionResult<{ id: string; path: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = typeof input === "string" ? { path: input } : (input as { path: string; name?: string });
    if (!parsed?.path || typeof parsed.path !== "string") {
      throw new Error("Thiếu đường dẫn 部署");
    }
    const dept = await upsertDepartmentByPath(parsed.path, parsed.name);
    await logAudit({
      actorId: admin.id,
      action: "CREATE_DEPARTMENT",
      entityType: "Department",
      entityId: dept.id,
      details: { path: dept.path },
    });
    revalidateTracker(["/admin/departments"]);
    return dept;
  });
}

/** Vô hiệu hoá department (soft delete). */
export async function disableDepartment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const { id } = (input ?? {}) as { id?: string };
    if (!id) throw new Error("Thiếu id department");

    const dept = await prisma.department.update({
      where: { id },
      data: { isActive: false },
    });
    await logAudit({
      actorId: admin.id,
      action: "DISABLE_DEPARTMENT",
      entityType: "Department",
      entityId: id,
      details: { path: dept.path },
    });
    revalidateTracker(["/admin/departments", "/admin/members"]);
    return { id };
  });
}

/** Đổi tên hiển thị (path giữ nguyên). */
export async function renameDepartment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const { id, name } = (input ?? {}) as { id?: string; name?: string };
    if (!id || !name?.trim()) throw new Error("Thiếu id hoặc tên");
    await prisma.department.update({ where: { id }, data: { name: name.trim() } });
    await logAudit({
      actorId: admin.id,
      action: "UPDATE_DEPARTMENT",
      entityType: "Department",
      entityId: id,
      details: { name: name.trim() },
    });
    revalidateTracker(["/admin/departments"]);
    return { id };
  });
}

/** Gán member vào department (admin). */
export async function assignMemberDepartment(input: unknown): Promise<ActionResult<{ userId: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const { userId, departmentId } = (input ?? {}) as { userId?: string; departmentId?: string | null };
    if (!userId) throw new Error("Thiếu userId");

    await prisma.user.update({
      where: { id: userId },
      data: { departmentId: departmentId ?? null, departmentLocked: true },
    });
    await logAudit({
      actorId: admin.id,
      action: "ASSIGN_MEMBER_DEPARTMENT",
      entityType: "User",
      entityId: userId,
      details: { departmentId: departmentId ?? null },
    });
    revalidateTracker(["/admin/members", "/admin/departments"]);
    return { userId };
  });
}

/**
 * Tạo member bằng tay. `entraObjectId` để null — bản ghi "pending",
 * sẽ khớp khi member login Entra lần đầu (theo email).
 */
export async function createMember(input: unknown): Promise<ActionResult<{ id: string; email: string }>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const parsed = MemberInput.parse(input);

    const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      throw new Error(`Email ${parsed.email} đã tồn tại`);
    }

    const dept = parsed.departmentPath
      ? await upsertDepartmentByPath(parsed.departmentPath)
      : null;

    const user = await prisma.user.create({
      data: {
        email: parsed.email,
        displayName: parsed.displayName?.trim() || parsed.email,
        entraObjectId: `pending:${parsed.email}`,
        role: normalizeRole(parsed.role),
        isActive: true,
        departmentId: dept?.id ?? null,
      },
    });

    await logAudit({
      actorId: admin.id,
      action: "CREATE_MEMBER",
      entityType: "User",
      entityId: user.id,
      details: { email: user.email, departmentId: dept?.id ?? null },
    });
    revalidateTracker(["/admin/members"]);
    return { id: user.id, email: user.email };
  });
}

export { ancestorPaths, parentPath };