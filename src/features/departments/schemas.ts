import { z } from "zod";

import type { UserRole } from "@prisma/client";

/** Đầu vào tạo/cập nhật department theo đường dẫn phân cấp. */
export const DepartmentInput = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
});

/** Một dòng trong CSV import member. */
export const CsvRow = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).optional(),
  departmentPath: z.string().trim().optional(),
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
});

export type CsvRowInput = z.infer<typeof CsvRow>;

/** Đầu vào tạo member bằng tay. */
export const MemberInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).optional(),
  departmentPath: z.string().trim().optional(),
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
});

export type MemberInput = z.infer<typeof MemberInput>;

/** Role hợp lệ khi import. */
export type ImportRole = "MEMBER" | "ADMIN";

export function normalizeRole(role?: string): UserRole {
  return role === "ADMIN" ? "ADMIN" : "MEMBER";
}