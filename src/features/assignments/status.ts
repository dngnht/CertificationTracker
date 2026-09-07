import type { AssignmentType, CertificationStatus, VerificationStatus } from "@prisma/client";

/**
 * The status a certification assignment effectively has.
 *
 * `CERTIFICATE_EXPIRED` is a derived state: the member once completed the
 * certification (verified) but the certificate has since expired. It is not a
 * stored enum value; it is computed and surfaced in the UI and compliance.
 */
export type EffectiveAssignmentStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERDUE"
  | "EXEMPTED"
  | "CERTIFICATE_EXPIRED";

export interface AssignmentLike {
  type: AssignmentType;
  deadline: Date | null;
  exemptedAt: Date | null;
}

export interface MemberCertificationLike {
  status: CertificationStatus;
  progressPercent: number;
  verificationStatus: VerificationStatus;
  expirationDate: Date | null;
}

/**
 * Derive the effective status of a certification assignment.
 *
 * Rules (from the spec):
 * - EXEMPTED wins if the assignment is exempted.
 * - COMPLETED when the member certification is CERTIFIED and VERIFIED.
 *   - If that certificate has expired -> CERTIFICATE_EXPIRED.
 * - Otherwise, if the deadline has passed -> OVERDUE.
 * - Otherwise, if there is any active learning progress -> IN_PROGRESS.
 * - Otherwise -> NOT_STARTED.
 */
export function getEffectiveStatus(
  assignment: AssignmentLike,
  memberCert: MemberCertificationLike | null,
  now: Date = new Date()
): EffectiveAssignmentStatus {
  if (assignment.exemptedAt) {
    return "EXEMPTED";
  }

  const isVerifiedCertified =
    memberCert !== null &&
    memberCert.status === "CERTIFIED" &&
    memberCert.verificationStatus === "VERIFIED";

  if (isVerifiedCertified) {
    if (memberCert!.expirationDate && memberCert!.expirationDate.getTime() < now.getTime()) {
      return "CERTIFICATE_EXPIRED";
    }
    return "COMPLETED";
  }

  const deadlinePassed = assignment.deadline !== null && assignment.deadline.getTime() < now.getTime();
  if (deadlinePassed) {
    return "OVERDUE";
  }

  const hasProgress =
    memberCert !== null &&
    (memberCert.status !== "PLANNED" || memberCert.progressPercent > 0);

  if (hasProgress) {
    return "IN_PROGRESS";
  }

  return "NOT_STARTED";
}

export function isTerminalSuccess(status: EffectiveAssignmentStatus): boolean {
  return status === "COMPLETED";
}

/** Whether an effective status satisfies a required assignment for compliance. */
export function satisfiesRequirement(status: EffectiveAssignmentStatus): boolean {
  return status === "COMPLETED" || status === "EXEMPTED";
}