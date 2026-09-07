import { prisma } from "@/lib/prisma";
import { config } from "@/features/config";
import { enrichAssignments, type AssignmentWithCert } from "@/features/assignments/effective";
import { calculateCompliance } from "@/features/compliance/calculate";

const assignmentInclude = {
  certification: { select: { code: true, name: true, provider: true } },
  member: { select: { id: true, displayName: true, email: true } },
  memberCert: true,
} as const;

export interface MemberDashboardData {
  summary: {
    required: number;
    completed: number;
    inProgress: number;
    overdue: number;
    recommended: number;
    notStarted: number;
    exempted: number;
  };
  assignments: ReturnType<typeof enrichAssignments>;
  compliance: ReturnType<typeof calculateCompliance>;
}

export async function getMemberDashboardData(memberId: string): Promise<MemberDashboardData> {
  const assignments = await prisma.certificationAssignment.findMany({
    where: { memberId },
    include: assignmentInclude,
    orderBy: [{ type: "asc" }, { deadline: "asc" }],
  });

  const enriched = enrichAssignments(assignments);
  const summary = {
    required: assignments.filter((a) => a.type === "REQUIRED").length,
    completed: enriched.filter((a) => a.effectiveStatus === "COMPLETED").length,
    inProgress: enriched.filter((a) => a.effectiveStatus === "IN_PROGRESS").length,
    overdue: enriched.filter((a) => a.effectiveStatus === "OVERDUE" || a.effectiveStatus === "CERTIFICATE_EXPIRED").length,
    recommended: assignments.filter((a) => a.type === "RECOMMENDED").length,
    notStarted: enriched.filter((a) => a.effectiveStatus === "NOT_STARTED").length,
    exempted: enriched.filter((a) => a.effectiveStatus === "EXEMPTED").length,
  };

  const compliance = calculateCompliance(assignments);

  return { summary, assignments: enriched, compliance };
}

export interface AdminDashboardData {
  totals: {
    members: number;
    requiredAssignments: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    expiringSoon: number;
    pendingVerification: number;
    recommended: number;
  };
  compliance: {
    compliantMembers: number;
    nonCompliantMembers: number;
    totalMembers: number;
    rate: number;
  };
  statusDistribution: Record<string, number>;
  requiredVsRecommended: { required: number; recommended: number };
  byProvider: { provider: string; count: number }[];
  needsAttention: {
    assignmentId: string;
    memberName: string;
    memberId: string;
    certificationCode: string;
    certificationName: string;
    type: string;
    effectiveStatus: string;
    deadline: Date | null;
    progressPercent: number;
    daysOverdue: number | null;
    daysLeft: number | null;
  }[];
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const now = new Date();

  const [members, assignments, memberCerts, expiringCount, pendingCount] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.certificationAssignment.findMany({ include: assignmentInclude }),
    prisma.memberCertification.findMany({
      where: { verificationStatus: "PENDING" },
      select: { id: true },
    }),
    prisma.memberCertification.count({
      where: {
        status: "CERTIFIED",
        verificationStatus: "VERIFIED",
        expirationDate: {
          gte: now,
          lte: new Date(now.getTime() + config.expiringSoonDays * 86400000),
        },
      },
    }),
    prisma.memberCertification.count({ where: { verificationStatus: "PENDING" } }),
  ]);
  void memberCerts;

  const enriched = enrichAssignments(assignments, now);

  const statusDistribution: Record<string, number> = {
    COMPLETED: 0,
    IN_PROGRESS: 0,
    NOT_STARTED: 0,
    OVERDUE: 0,
    EXEMPTED: 0,
    CERTIFICATE_EXPIRED: 0,
  };
  for (const a of enriched) statusDistribution[a.effectiveStatus]++;

  const required = assignments.filter((a) => a.type === "REQUIRED");
  const recommended = assignments.filter((a) => a.type === "RECOMMENDED");

  const byProviderMap = new Map<string, number>();
  for (const a of assignments) {
    byProviderMap.set(a.certification.provider, (byProviderMap.get(a.certification.provider) ?? 0) + 1);
  }
  const byProvider = [...byProviderMap.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count);

  // Compliance: group assignments by member.
  const byMember = new Map<string, AssignmentWithCert[]>();
  for (const a of enriched) {
    const list = byMember.get(a.memberId) ?? [];
    list.push(a);
    byMember.set(a.memberId, list);
  }
  let compliantMembers = 0;
  for (const [, list] of byMember) {
    if (calculateCompliance(list, now).compliant) compliantMembers++;
  }
  const nonCompliantMembers = members - compliantMembers;
  const rate = members === 0 ? 0 : Math.round((compliantMembers / members) * 100);

  // Needs attention: overdue, deadline within 7 days, not started, low progress.
  const needsAttention = enriched
    .filter((a) => a.type === "REQUIRED")
    .filter((a) => {
      if (a.effectiveStatus === "OVERDUE" || a.effectiveStatus === "CERTIFICATE_EXPIRED") return true;
      if (a.effectiveStatus === "NOT_STARTED") return true;
      if (a.effectiveStatus === "IN_PROGRESS" && a.deadline && a.daysLeft !== null && a.daysLeft <= 7) return true;
      if (a.effectiveStatus === "IN_PROGRESS" && a.progressPercent < 30) return true;
      return false;
    })
    .sort((a, b) => (a.daysOverdue ?? -Infinity) - (b.daysOverdue ?? -Infinity))
    .slice(0, 10)
    .map((a) => ({
      assignmentId: a.id,
      memberName: a.member.displayName,
      memberId: a.member.id,
      certificationCode: a.certification.code,
      certificationName: a.certification.name,
      type: a.type,
      effectiveStatus: a.effectiveStatus,
      deadline: a.deadline,
      progressPercent: a.progressPercent,
      daysOverdue: a.daysOverdue,
      daysLeft: a.daysLeft,
    }));

  return {
    totals: {
      members,
      requiredAssignments: required.length,
      completed: statusDistribution.COMPLETED,
      inProgress: statusDistribution.IN_PROGRESS,
      notStarted: statusDistribution.NOT_STARTED,
      overdue: statusDistribution.OVERDUE + statusDistribution.CERTIFICATE_EXPIRED,
      expiringSoon: expiringCount,
      pendingVerification: pendingCount,
      recommended: recommended.length,
    },
    compliance: {
      compliantMembers,
      nonCompliantMembers,
      totalMembers: members,
      rate,
    },
    statusDistribution,
    requiredVsRecommended: { required: required.length, recommended: recommended.length },
    byProvider,
    needsAttention,
  };
}