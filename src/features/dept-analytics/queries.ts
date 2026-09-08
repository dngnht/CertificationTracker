import { prisma } from "@/lib/prisma";
import { PATH_SEPARATOR } from "@/features/departments/path";
import { buildDepartmentTree } from "@/features/departments/queries";
import { completionRate, targetStatus, type TargetStatus } from "./compute";

export interface DeptStatNode {
  id: string;
  code: string;
  name: string;
  path: string;
  depth: number;
  memberCount: number;
  achieved: number;
  inProgress: number;
  expired: number;
  children: DeptStatNode[];
}

export interface DeptTargetProgress {
  id: string;
  certificationId: string | null;
  certificationCode: string | null;
  certificationName: string | null;
  targetCount: number;
  dueDate: Date | null;
  note: string | null;
  achieved: number;
  completionRate: number;
  status: TargetStatus;
}

/**
 * Thống kê cert theo department (gồm cả cây con qua materialized path prefix).
 * Mọi con số là derived — đếm runtime từ MemberCertification VERIFIED.
 * Aggregation chạy ở server (không load record về client).
 */
export async function getDeptCertStats(rootPath?: string): Promise<DeptStatNode[]> {
  const depts = await prisma.department.findMany({
    where: { isActive: true, ...(rootPath ? { path: { startsWith: rootPath } } : {}) },
    orderBy: { path: "asc" },
  });
  if (depts.length === 0) return [];

  const now = new Date();
  const memberScope = rootPath
    ? { department: { path: { startsWith: rootPath } } }
    : {};

  const members = await prisma.user.findMany({
    where: { isActive: true, departmentId: { not: null }, ...memberScope },
    select: { id: true, departmentId: true, department: { select: { path: true } } },
  });
  const memberIds = members.map((m) => m.id);

  // Đếm theo trạng thái (DB aggregation).
  const statusRows = memberIds.length
    ? await prisma.memberCertification.groupBy({
        by: ["memberId", "verificationStatus"],
        where: { memberId: { in: memberIds } },
        _count: { _all: true },
      })
    : [];
  const expiredRows = memberIds.length
    ? await prisma.memberCertification.groupBy({
        by: ["memberId"],
        where: {
          memberId: { in: memberIds },
          verificationStatus: "VERIFIED",
          expirationDate: { lt: now },
        },
        _count: { _all: true },
      })
    : [];

  const statusMap = new Map<string, Record<string, number>>();
  for (const r of statusRows) {
    const cur = statusMap.get(r.memberId) ?? {};
    cur[r.verificationStatus] = r._count._all;
    statusMap.set(r.memberId, cur);
  }
  const expiredMap = new Map(expiredRows.map((r) => [r.memberId, r._count._all]));

  // Leaf aggregates theo path department của member.
  const leaf = new Map<string, { achieved: number; inProgress: number; expired: number; memberCount: number }>();
  const touch = (path: string) => {
    if (!leaf.has(path)) leaf.set(path, { achieved: 0, inProgress: 0, expired: 0, memberCount: 0 });
    return leaf.get(path)!;
  };

  for (const m of members) {
    if (!m.department?.path) continue;
    const agg = touch(m.department.path);
    agg.memberCount += 1;
    const st = statusMap.get(m.id) ?? {};
    const verified = st.VERIFIED ?? 0;
    const expired = expiredMap.get(m.id) ?? 0;
    agg.achieved += Math.max(0, verified - expired);
    agg.expired += expired;
    agg.inProgress += (st.PLANNED ?? 0) + (st.LEARNING ?? 0) + (st.EXAM_SCHEDULED ?? 0);
  }

  // Roll-up: mỗi node = chính nó + mọi cấp dưới (path prefix).
  const flat = depts.map((d) => {
    let achieved = 0;
    let inProgress = 0;
    let expired = 0;
    let memberCount = 0;
    const prefix = d.path + PATH_SEPARATOR;
    for (const [p, a] of leaf) {
      if (p === d.path || p.startsWith(prefix)) {
        achieved += a.achieved;
        inProgress += a.inProgress;
        expired += a.expired;
        memberCount += a.memberCount;
      }
    }
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      path: d.path,
      depth: d.depth,
      memberCount,
      achieved,
      inProgress,
      expired,
    };
  });

  return buildDepartmentTree(flat) as DeptStatNode[];
}

/**
 * Thống kê 1 department kèm target + % hoàn thành (CR-DEPT-02 §4.1).
 */
export async function getDeptTargetProgress(departmentId: string): Promise<{
  path: string;
  targets: DeptTargetProgress[];
}> {
  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) return { path: "", targets: [] };

  const targets = await prisma.departmentCertTarget.findMany({
    where: { departmentId, isActive: true },
    include: { certification: { select: { code: true, name: true } } },
    orderBy: [{ certificationId: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const now = new Date();

  const progressed: DeptTargetProgress[] = [];
  for (const t of targets) {
    const where: any = {
      verificationStatus: "VERIFIED",
      member: { department: { path: { startsWith: dept.path } } },
    };
    if (t.certificationId) where.certificationId = t.certificationId;
    const achieved = await prisma.memberCertification.count({ where });
    progressed.push({
      id: t.id,
      certificationId: t.certificationId,
      certificationCode: t.certification?.code ?? null,
      certificationName: t.certification?.name ?? null,
      targetCount: t.targetCount,
      dueDate: t.dueDate,
      note: t.note,
      achieved,
      completionRate: completionRate(achieved, t.targetCount),
      status: targetStatus(achieved, t.targetCount, t.dueDate, now),
    });
  }

  return { path: dept.path, targets: progressed };
}

/** Toàn bộ target active kèm department + certification (cho trang quản lý target). */
export async function listTargets() {
  return prisma.departmentCertTarget.findMany({
    where: { isActive: true },
    include: {
      department: { select: { id: true, code: true, name: true, path: true } },
      certification: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ department: { path: "asc" } }, { createdAt: "desc" }],
  });
}

export type TargetProgressRow = Awaited<ReturnType<typeof listTargets>>[number] & {
  achieved: number;
  completionRate: number;
  status: TargetStatus;
};

/** Toàn bộ target active kèm achieved/rate/status (cho analytics overview). */
export async function getTargetProgressAll(): Promise<TargetProgressRow[]> {
  const targets = await listTargets();
  const now = new Date();
  const rows: TargetProgressRow[] = [];
  for (const t of targets) {
    const where: any = {
      verificationStatus: "VERIFIED",
      member: { department: { path: { startsWith: t.department.path } } },
    };
    if (t.certificationId) where.certificationId = t.certificationId;
    const achieved = await prisma.memberCertification.count({ where });
    rows.push({
      ...t,
      achieved,
      completionRate: completionRate(achieved, t.targetCount),
      status: targetStatus(achieved, t.targetCount, t.dueDate, now),
    });
  }
  return rows;
}