import { prisma } from "@/lib/prisma";
import { logAudit } from "@/features/audit/log";
import { upsertDepartmentByPath } from "./service";

/** Dữ liệu department do Microsoft Graph trả về. */
export interface EntraProfileFields {
  department?: string | null;
  jobTitle?: string | null;
  officeLocation?: string | null;
}

export interface SyncDecision {
  sync: boolean;
  reason: "MANUAL_LOCK" | "NO_DEPARTMENT" | "SYNC";
}

/**
 * Quyết định có ghi đè department từ Entra hay không.
 * Thuần tuý — dễ unit test.
 *
 * - `departmentLocked` (admin gán tay) → KHÔNG ghi đè.
 * - không có chuỗi department từ Entra → không gán, nhưng vẫn lưu raw.
 */
export function decideDepartmentSync(input: {
  departmentLocked: boolean;
  entraDepartment?: string | null;
}): SyncDecision {
  if (input.departmentLocked) return { sync: false, reason: "MANUAL_LOCK" };
  if (!input.entraDepartment?.trim()) return { sync: false, reason: "NO_DEPARTMENT" };
  return { sync: true, reason: "SYNC" };
}

/**
 * Đồng bộ department/jobTitle/officeLocation từ Entra vào user.
 * Gọi trong callback đăng nhập (JIT) sau khi provision user.
 *
 * Luôn lưu `entraDepartmentRaw` để không mất dữ liệu kể cả khi parse lỗi.
 */
export async function syncUserDepartmentFromEntra(
  userId: string,
  profile: EntraProfileFields
): Promise<{ synced: boolean; departmentPath?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { synced: false };

  const raw = profile.department?.trim() || null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      entraDepartmentRaw: raw,
      jobTitle: profile.jobTitle?.trim() || null,
      officeLocation: profile.officeLocation?.trim() || null,
    },
  });

  const decision = decideDepartmentSync({
    departmentLocked: user.departmentLocked,
    entraDepartment: raw,
  });
  if (!decision.sync) {
    return { synced: false };
  }

  const dept = await upsertDepartmentByPath(raw!);
  await prisma.user.update({
    where: { id: userId },
    data: { departmentId: dept.id },
  });

  await logAudit({
    actorId: userId,
    action: "SYNC_DEPARTMENT_FROM_ENTRA",
    entityType: "User",
    entityId: userId,
    details: { raw, path: dept.path },
  });

  return { synced: true, departmentPath: dept.path };
}