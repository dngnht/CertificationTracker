import { describe, it, expect } from "vitest";

import {
  shouldAutoCreate,
  normalizeCertCode,
  suggestedProgress,
  isSafeOcrVerification,
} from "@/features/ocr/rules";
import { StubOcrService } from "@/features/ocr/service";

describe("OCR decision rules", () => {
  it("high confidence + matched cert & member => auto-create", () => {
    expect(
      shouldAutoCreate({ overall: 0.9, needsReview: false, certificationId: "c1", memberId: "m1", threshold: 0.75 })
    ).toBe(true);
  });

  it("low confidence => needs review (no auto-create)", () => {
    expect(
      shouldAutoCreate({ overall: 0.5, needsReview: false, certificationId: "c1", memberId: "m1", threshold: 0.75 })
    ).toBe(false);
  });

  it("unmatched certification => needs review", () => {
    expect(
      shouldAutoCreate({ overall: 0.95, needsReview: false, certificationId: null, memberId: "m1", threshold: 0.75 })
    ).toBe(false);
  });

  it("unmatched member => needs review", () => {
    expect(
      shouldAutoCreate({ overall: 0.95, needsReview: false, certificationId: "c1", memberId: null, threshold: 0.75 })
    ).toBe(false);
  });

  it("explicit needsReview flag forces review", () => {
    expect(
      shouldAutoCreate({ overall: 0.99, needsReview: true, certificationId: "c1", memberId: "m1", threshold: 0.75 })
    ).toBe(false);
  });

  it("normalizeCertCode strips spaces/hyphens for alias matching", () => {
    expect(normalizeCertCode("AZ-204")).toBe("az204");
    expect(normalizeCertCode("AZ 204")).toBe("az204");
    expect(normalizeCertCode("AWS-SAA")).toBe("awssaa");
  });

  it("suggestedProgress forces 100 for CERTIFIED", () => {
    expect(suggestedProgress("CERTIFIED", 40)).toBe(100);
    expect(suggestedProgress("LEARNING", 40)).toBe(40);
  });
});

describe("OCR never auto-verifies", () => {
  it("stub extraction suggests PENDING, never VERIFIED", async () => {
    const service = new StubOcrService();
    const result = await service.extract(Buffer.from("fake"), "eng");
    expect(result.suggested.verificationStatus).toBe("PENDING");
    expect(isSafeOcrVerification(result.suggested.verificationStatus)).toBe(true);
  });

  it("guard rejects VERIFIED as an OCR-produced state", () => {
    expect(isSafeOcrVerification("PENDING")).toBe(true);
    expect(isSafeOcrVerification("VERIFIED")).toBe(false);
    expect(isSafeOcrVerification("REJECTED")).toBe(false);
  });
});