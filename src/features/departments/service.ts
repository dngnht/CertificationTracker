import { prisma } from "@/lib/prisma";
import { splitPath, joinPath } from "./path";

/**
 * Tạo/khớp department theo materialized path, idempotent.
 * Tự tạo các tầng tổ tiên nếu chưa tồn tại, nối parent dần.
 *
 * Logic DB thuần (không phụ thuộc next-auth/server-action) để dễ test.
 */
export async function upsertDepartmentByPath(
  rawPath: string,
  name?: string
): Promise<{ id: string; path: string }> {
  const parts = splitPath(rawPath);
  if (parts.length === 0) throw new Error("Đường dẫn 部署 rỗng");

  let parentId: string | null = null;
  let last: { id: string; path: string } | null = null;
  let dept: { id: string; path: string } | null = null;

  for (let i = 0; i < parts.length; i++) {
    const path = joinPath(parts.slice(0, i + 1));
    dept = await prisma.department.upsert({
      where: { path },
      update: { parentId },
      create: {
        code: parts[i],
        name: i === parts.length - 1 ? (name?.trim() || parts[i]) : parts[i],
        path,
        depth: i,
        parentId,
        source: "MANUAL",
      },
    });
    parentId = dept.id;
    last = { id: dept.id, path: dept.path };
  }

  return last!;
}