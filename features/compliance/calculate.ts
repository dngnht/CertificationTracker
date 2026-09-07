import {
  getEffectiveStatus,
  satisfiesRequirement,
  type EffectiveAssignmentStatus,
} from "@/features/assignments/status";
import type { AssignmentType, CertificationStatus, VerificationStatus } from "@prisma/client";

export type ComplianceStatus = "COMPLIANT" | "NON_COMPLIANT";

export interface AssignmentForCompliance {
  type: AssignmentType;
  deadline: Date | null;
  exemptedAt: Date | null;
  memberCert: {
    status: CertificationStatus;
    progressPercent: number;
    verificationStatus: VerificationStatus;
    expirationDate: Date | null;
  } | null;
}

export interface ComplianceResult {
  status: ComplianceStatus;
  /** Number of REQUIRED assignments. */
  requiredCount: number;
  /** REQUIRED assignments that are COMPLETED or EXEMPTED. */
  satisfiedCount: number;
  /** REQUIRED assignments that are overdue. */
  overdueCount: number;
  /** REQUIRED assignments not yet satisfied (incl. expired). */
  missingCount: number;
  /** True when every required assignment is satisfied. */
  compliant: boolean;
}

/**
 * Calculate a member's compliance from their assignments.
 *
 * A member is compliant when ALL REQUIRED assignments are COMPLETED or
 * EXEMPTED. Recommended assignments never affect compliance.
 *
 * Compliance is always derived, never stored.
 */
export function calculateCompliance(
  assignments: AssignmentForCompliance[],
  now: Date = new Date()
): ComplianceResult {
  const required = assignments.filter((a) => a.type === "REQUIRED");

  let satisfiedCount = 0;
  let overdueCount = 0;

  for (const assignment of required) {
    const status = getEffectiveStatus(assignment, assignment.memberCert, now);
    if (satisfiesRequirement(status)) {
      satisfiedCount += 1;
    }
    if (status === "OVERDUE" || status === "CERTIFICATE_EXPIRED") {
      overdueCount += 1;
    }
  }

  const missingCount = required.length - satisfiedCount;
  const compliant = missingCount === 0;

  return {
    status: compliant ? "COMPLIANT" : "NON_COMPLIANT",
    requiredCount: required.length,
    satisfiedCount,
    overdueCount,
    missingCount,
    compliant,
  };
}

export type { EffectiveAssignmentStatus };