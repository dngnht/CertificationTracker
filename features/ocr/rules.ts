/**
 * Pure decision rules for OCR extraction. Kept dependency-free so they are
 * trivially unit-testable.
 */

/**
 * Whether an extraction should auto-create a PENDING MemberCertification.
 * Requires sufficient overall confidence AND both cert + member matched.
 */
export function shouldAutoCreate(input: {
  overall: number;
  needsReview: boolean;
  certificationId: string | null;
  memberId: string | null;
  threshold: number;
}): boolean {
  if (input.needsReview) return false;
  if (input.overall < input.threshold) return false;
  if (!input.certificationId || !input.memberId) return false;
  return true;
}

/** Normalize a certification code for alias matching (strip spaces/hyphens). */
export function normalizeCertCode(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

/** Progress invariant: CERTIFIED implies 100%. */
export function suggestedProgress(status: string, fallback: number): number {
  return status === "CERTIFIED" ? 100 : Math.max(0, Math.min(100, fallback));
}

/**
 * OCR must never produce a VERIFIED verification state — only PENDING.
 * This is a guard assertion used by tests.
 */
export function isSafeOcrVerification(status: string): boolean {
  return status === "PENDING";
}