/**
 * Pure decision rules for OCR extraction. Kept dependency-free so they are
 * trivially unit-testable.
 */

import { similarityScore } from "@/features/certifications/similarity";

/** Threshold for treating the on-cert holder name as matching the attributed member. */
export const HOLDER_MATCH_THRESHOLD = 0.72;

/**
 * Compare the holder name read from the certificate (OCR evidence) against the
 * member the cert is being attributed to. Returns a match verdict + a warning
 * flag. A null/absent side yields `{ matched: null, warn: false }` (no evidence
 * to compare → do not warn).
 */
export function checkHolderMatch(
  holderNameOnCert?: string | null,
  memberDisplayName?: string | null
): { matched: boolean | null; warn: boolean; score: number } {
  if (!holderNameOnCert || !memberDisplayName) {
    return { matched: null, warn: false, score: 0 };
  }
  const score = similarityScore(holderNameOnCert, memberDisplayName);
  const matched = score >= HOLDER_MATCH_THRESHOLD;
  return { matched, warn: !matched, score };
}

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