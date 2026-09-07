import type {
  CertificationAssignment,
  MemberCertification,
  CertificateFile,
} from "@prisma/client";

import { getEffectiveStatus, type EffectiveAssignmentStatus } from "@/features/assignments/status";

export type AssignmentWithCert = CertificationAssignment & {
  certification: { code: string; name: string; provider: string };
  member: { id: string; displayName: string; email: string };
  memberCert: (MemberCertification & { files?: CertificateFile[] }) | null;
};

export type EnrichedAssignment = AssignmentWithCert & {
  effectiveStatus: EffectiveAssignmentStatus;
  progressPercent: number;
  daysOverdue: number | null;
  daysLeft: number | null;
};

/**
 * Compute the effective status and derived metrics for a list of assignments
 * that already include their `memberCert` relation.
 */
export function enrichAssignments(
  assignments: AssignmentWithCert[],
  now: Date = new Date()
): EnrichedAssignment[] {
  return assignments.map((a) => {
    const effectiveStatus = getEffectiveStatus(a, a.memberCert, now);
    const progressPercent = a.memberCert?.progressPercent ?? 0;

    let daysOverdue: number | null = null;
    if ((effectiveStatus === "OVERDUE" || effectiveStatus === "CERTIFICATE_EXPIRED") && a.deadline) {
      daysOverdue = Math.floor((now.getTime() - a.deadline.getTime()) / 86400000);
    }

    let daysLeft: number | null = null;
    if (a.deadline && effectiveStatus !== "COMPLETED" && effectiveStatus !== "EXEMPTED") {
      daysLeft = Math.ceil((a.deadline.getTime() - now.getTime()) / 86400000);
    }

    return {
      ...a,
      effectiveStatus,
      progressPercent,
      daysOverdue,
      daysLeft,
    };
  });
}

export function enrichSingle(
  assignment: AssignmentWithCert,
  now?: Date
): EnrichedAssignment {
  return enrichAssignments([assignment], now)[0];
}