"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { wrapAction, revalidateTracker, type ActionResult } from "@/lib/server-action";
import { logAudit } from "@/features/audit/log";
import { parseCsv } from "./csv";
import { CsvRow, normalizeRole } from "./schemas";
import { upsertDepartmentByPath } from "./service";

export interface ImportMembersSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Import member hàng loạt từ CSV.
 *
 * Header: email,displayName,departmentPath,role
 * - upsert theo email (không tạo trùng)
 * - departmentPath tự tạo/khớp các tầng (idempotent)
 * - member mới để entraObjectId = "pending:<email>" chờ khớp khi login
 */
export async function importMembersCsv(input: unknown): Promise<ActionResult<ImportMembersSummary>> {
  return wrapAction(async () => {
    const admin = await requireAdmin();
    const { csvText } = (input ?? {}) as { csvText?: string };
    if (typeof csvText !== "string" || !csvText.trim()) {
      throw new Error("Thiếu nội dung CSV");
    }

    const records = parseCsv(csvText);
    const result: ImportMembersSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const [i, rec] of records.entries()) {
      const rowNum = i + 2; // dòng 1 là header
      const parsed = CsvRow.safeParse({
        email: rec.email,
        displayName: rec.displayName,
        departmentPath: rec.departmentPath,
        role: rec.role,
      });
      if (!parsed.success) {
        result.errors.push(`Dòng ${rowNum}: ${parsed.error.issues.map((e) => e.message).join(", ")}`);
        continue;
      }
      const { email, displayName, departmentPath, role } = parsed.data;

      const dept = departmentPath ? await upsertDepartmentByPath(departmentPath) : null;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        await prisma.user.update({
          where: { email },
          data: {
            displayName: displayName?.trim() || existing.displayName,
            departmentId: dept?.id ?? existing.departmentId,
            role: role ? normalizeRole(role) : existing.role,
          },
        });
        result.updated++;
      } else {
        await prisma.user.create({
          data: {
            email,
            displayName: displayName?.trim() || email,
            entraObjectId: `pending:${email}`,
            role: normalizeRole(role),
            isActive: true,
            departmentId: dept?.id ?? null,
          },
        });
        result.created++;
      }
    }

    await logAudit({
      actorId: admin.id,
      action: "IMPORT_MEMBERS_CSV",
      entityType: "User",
      entityId: "batch",
      details: {
        created: result.created,
        updated: result.updated,
        errors: result.errors.length,
      },
    });
    revalidateTracker(["/admin/members", "/admin/departments"]);
    return result;
  });
}

/** Template CSV mẫu cho UI (placeholder, không chứa mã 部署 thật). */
export const CSV_TEMPLATE = [
  "email,displayName,departmentPath,role",
  "alice@example.com,Alice Example,ORG/DIV-A/DEPT-1,MEMBER",
  "bob@example.com,Bob Example,ORG/DIV-A/DEPT-1/TEAM-X,MEMBER",
  "carol@example.com,Carol Admin,ORG/DIV-B,ADMIN",
].join("\n");