import { prisma } from "@/lib/prisma";
import { PATH_SEPARATOR } from "./path";

export interface DeptTreeNode {
  id: string;
  code: string;
  name: string;
  path: string;
  depth: number;
  memberCount: number;
  children: DeptTreeNode[];
}

/**
 * Dựng cây 部署 từ danh sách phẳng (đã sort theo path asc).
 * Thuần tuý — dễ unit test.
 */
export function buildDepartmentTree(
  flat: Array<Omit<DeptTreeNode, "children">>
): DeptTreeNode[] {
  const byId = new Map<string, DeptTreeNode>();
  const roots: DeptTreeNode[] = [];

  for (const node of flat) {
    const item: DeptTreeNode = { ...node, children: [] };
    byId.set(item.id, item);
  }

  for (const item of byId.values()) {
    const parentPath = item.path.includes(PATH_SEPARATOR)
      ? item.path.slice(0, item.path.lastIndexOf(PATH_SEPARATOR))
      : null;
    const parent = parentPath
      ? [...byId.values()].find((n) => n.path === parentPath)
      : undefined;
    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

/** Toàn bộ department (kể cả inactive) — dùng cho admin. */
export async function listDepartments() {
  return prisma.department.findMany({
    orderBy: { path: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

/** Cây department active kèm số member mỗi node. */
export async function getDepartmentTree() {
  const all = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { path: "asc" },
    include: { _count: { select: { members: true } } },
  });
  const flat = all.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    path: d.path,
    depth: d.depth,
    memberCount: d._count.members,
  }));
  return buildDepartmentTree(flat);
}

/** Tìm department theo materialized path chính xác. */
export async function getDepartmentByPath(path: string) {
  return prisma.department.findUnique({ where: { path } });
}

/**
 * Liệt kê member thuộc 1 department VÀ mọi cấp dưới
 * (dùng materialized path prefix — 1 query, không cần đệ quy).
 */
export async function listMembersInDeptTree(deptPath: string) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      department: { path: { startsWith: deptPath } },
    },
    include: { department: true },
    orderBy: [{ department: { path: "asc" } }, { displayName: "asc" }],
  });
}

/** Toàn bộ department active dạng phẳng (cho dropdown filter). */
export async function listActiveDepartments() {
  return prisma.department.findMany({
    where: { isActive: true },
    orderBy: { path: "asc" },
  });
}