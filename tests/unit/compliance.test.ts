import { describe, it, expect } from "vitest";

import { calculateCompliance } from "@/features/compliance/calculate";

const now = new Date("2026-06-15T12:00:00Z");
const inFuture = (days: number) => new Date(now.getTime() + days * 86400000);
const inPast = (days: number) => new Date(now.getTime() - days * 86400000);

function req(overrides: Partial<Parameters<typeof calculateCompliance>[0][number]> = {}) {
  return {
    type: "REQUIRED" as const,
    deadline: null,
    exemptedAt: null,
    memberCert: null,
    ...overrides,
  };
}

function rec(overrides: Partial<Parameters<typeof calculateCompliance>[0][number]> = {}) {
  return { ...req(), type: "RECOMMENDED" as const, ...overrides };
}

function completed() {
  return req({
    memberCert: {
      status: "CERTIFIED",
      progressPercent: 100,
      verificationStatus: "VERIFIED",
      expirationDate: inFuture(100),
    },
  });
}

describe("calculateCompliance", () => {
  it("All required completed => COMPLIANT", () => {
    const result = calculateCompliance([completed(), completed()], now);
    expect(result.status).toBe("COMPLIANT");
    expect(result.compliant).toBe(true);
  });

  it("One required overdue => NON_COMPLIANT", () => {
    const result = calculateCompliance(
      [completed(), req({ deadline: inPast(5), memberCert: { status: "LEARNING", progressPercent: 20, verificationStatus: "PENDING", expirationDate: null } })],
      now
    );
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.missingCount).toBe(1);
  });

  it("Only recommended incomplete => COMPLIANT", () => {
    const result = calculateCompliance(
      [completed(), rec({ memberCert: { status: "PLANNED", progressPercent: 0, verificationStatus: "PENDING", expirationDate: null } })],
      now
    );
    expect(result.status).toBe("COMPLIANT");
  });

  it("Required exempted counts as satisfied => COMPLIANT", () => {
    const result = calculateCompliance(
      [completed(), req({ exemptedAt: inPast(10) })],
      now
    );
    expect(result.status).toBe("COMPLIANT");
  });

  it("Required not started => NON_COMPLIANT", () => {
    const result = calculateCompliance([req()], now);
    expect(result.status).toBe("NON_COMPLIANT");
  });

  it("Verified certificate expired => NON_COMPLIANT", () => {
    const result = calculateCompliance(
      [
        req({
          memberCert: {
            status: "CERTIFIED",
            progressPercent: 100,
            verificationStatus: "VERIFIED",
            expirationDate: inPast(2),
          },
        }),
      ],
      now
    );
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.overdueCount).toBe(1);
  });

  it("No required assignments => COMPLIANT", () => {
    const result = calculateCompliance([rec()], now);
    expect(result.status).toBe("COMPLIANT");
  });
});