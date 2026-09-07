import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { enrichAssignments } from "@/features/assignments/effective";

const assignmentInclude = {
  certification: { select: { code: true, name: true, provider: true } },
  member: { select: { id: true, displayName: true, email: true, department: true } },
  memberCert: true,
} as const;

export interface ReportFilters {
  memberId?: string;
  certificationId?: string;
  provider?: string;
  type?: "REQUIRED" | "RECOMMENDED";
  deptPath?: string;
  minDaysOverdue?: number;
  now?: Date;
}

function buildWhere(filters: ReportFilters) {
  const where: Record<string, unknown> = {};
  if (filters.memberId) where.memberId = filters.memberId;
  if (filters.certificationId) where.certificationId = filters.certificationId;
  if (filters.type) where.type = filters.type;
  if (filters.provider) where.certification = { provider: filters.provider };
  if (filters.deptPath) where.member = { department: { path: { startsWith: filters.deptPath } } };
  return where;
}

/** Assignments that are effectively OVERDUE (deadline passed, not satisfied). */
export async function getOverdueAssignments(
  filters: ReportFilters = {},
  pagination: { page?: number; pageSize?: number } = {}
) {
  const now = filters.now ?? new Date();
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 50;

  const assignments = await prisma.certificationAssignment.findMany({
    where: buildWhere(filters),
    include: assignmentInclude,
  });

  const enriched = enrichAssignments(assignments, now)
    .filter((a) => a.effectiveStatus === "OVERDUE" || a.effectiveStatus === "CERTIFICATE_EXPIRED")
    .filter((a) => (filters.minDaysOverdue ? (a.daysOverdue ?? 0) >= filters.minDaysOverdue : true))
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));

  const total = enriched.length;
  const start = (page - 1) * pageSize;
  return {
    items: enriched.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Required assignments that have not been started. */
export async function getMissingAssignments(
  filters: ReportFilters = {},
  pagination: { page?: number; pageSize?: number } = {}
) {
  const now = filters.now ?? new Date();
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 50;

  const assignments = await prisma.certificationAssignment.findMany({
    where: { ...buildWhere(filters), type: "REQUIRED" },
    include: assignmentInclude,
  });

  const enriched = enrichAssignments(assignments, now).filter(
    (a) => a.effectiveStatus === "NOT_STARTED"
  );

  const total = enriched.length;
  const start = (page - 1) * pageSize;
  return {
    items: enriched.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Assignments with a deadline within `windowDays` (default 30). */
export async function getUpcomingDeadlines(
  filters: ReportFilters = {},
  windowDays: number = config.expiringSoonDays,
  pagination: { page?: number; pageSize?: number } = {}
) {
  const now = filters.now ?? new Date();
  const endWindow = new Date(now.getTime() + windowDays * 86400000);

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 50;

  const assignments = await prisma.certificationAssignment.findMany({
    where: {
      ...buildWhere(filters),
      deadline: { gte: now, lte: endWindow },
      NOT: { status: "EXEMPTED" },
    },
    include: assignmentInclude,
  });

  const enriched = enrichAssignments(assignments, now)
    .filter((a) => a.effectiveStatus !== "COMPLETED" && a.effectiveStatus !== "EXEMPTED")
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

  const total = enriched.length;
  const start = (page - 1) * pageSize;
  return {
    items: enriched.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Certificates that are about to expire (independent of assignment deadlines). */
export async function getExpiringCertificates(
  thresholdDays: number = config.expiringSoonDays,
  pagination: { page?: number; pageSize?: number } = {},
  now: Date = new Date(),
  filters: ReportFilters = {}
) {
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 50;
  const horizon = new Date(now.getTime() + thresholdDays * 86400000);

  const memberCerts = await prisma.memberCertification.findMany({
    where: {
      status: "CERTIFIED",
      verificationStatus: "VERIFIED",
      expirationDate: { gte: now, lte: horizon },
      ...(filters.deptPath
        ? { member: { department: { path: { startsWith: filters.deptPath } } } }
        : {}),
    },
    include: {
      certification: { select: { code: true, name: true, provider: true } },
      member: { select: { id: true, displayName: true, email: true, department: true } },
    },
    orderBy: { expirationDate: "asc" },
  });

  const items = memberCerts.map((mc) => ({
    id: mc.id,
    member: mc.member,
    certification: mc.certification,
    expirationDate: mc.expirationDate!,
    daysLeft: Math.ceil((mc.expirationDate!.getTime() - now.getTime()) / 86400000),
  }));

  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}