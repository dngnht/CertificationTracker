import { describe, it, expect } from "vitest";

import { getEffectiveStatus } from "@/features/assignments/status";

const now = new Date("2026-06-15T12:00:00Z");
const inFuture = (days: number) => new Date(now.getTime() + days * 86400000);
const inPast = (days: number) => new Date(now.getTime() - days * 86400000);

function assignment(overrides: Partial<Parameters<typeof getEffectiveStatus>[0]> = {}) {
  return { type: "REQUIRED" as const, deadline: null, exemptedAt: null, ...overrides };
}

function memberCert(overrides: Partial<Parameters<typeof getEffectiveStatus>[1] & {}> = {}) {
  return {
    status: "PLANNED" as const,
    progressPercent: 0,
    verificationStatus: "PENDING" as const,
    expirationDate: null,
    ...overrides,
  };
}

describe("getEffectiveStatus", () => {
  it("Required + no certification => NOT_STARTED", () => {
    expect(getEffectiveStatus(assignment(), null, now)).toBe("NOT_STARTED");
  });

  it("Required + learning => IN_PROGRESS", () => {
    expect(
      getEffectiveStatus(assignment(), memberCert({ status: "LEARNING", progressPercent: 70 }), now)
    ).toBe("IN_PROGRESS");
  });

  it("Required + progress percent > 0 => IN_PROGRESS", () => {
    expect(
      getEffectiveStatus(assignment(), memberCert({ status: "PLANNED", progressPercent: 10 }), now)
    ).toBe("IN_PROGRESS");
  });

  it("Required + completed (certified + verified) => COMPLETED", () => {
    expect(
      getEffectiveStatus(
        assignment(),
        memberCert({ status: "CERTIFIED", verificationStatus: "VERIFIED", progressPercent: 100 }),
        now
      )
    ).toBe("COMPLETED");
  });

  it("Required + deadline passed + incomplete => OVERDUE", () => {
    expect(
      getEffectiveStatus(
        assignment({ deadline: inPast(10) }),
        memberCert({ status: "LEARNING", progressPercent: 20 }),
        now
      )
    ).toBe("OVERDUE");
  });

  it("Required + deadline passed + no cert => OVERDUE", () => {
    expect(getEffectiveStatus(assignment({ deadline: inPast(1) }), null, now)).toBe("OVERDUE");
  });

  it("Required + deadline today + not started => NOT_STARTED (not yet overdue)", () => {
    expect(getEffectiveStatus(assignment({ deadline: inFuture(0) }), null, now)).toBe("NOT_STARTED");
  });

  it("Exempted => EXEMPTED", () => {
    expect(
      getEffectiveStatus(assignment({ exemptedAt: inPast(5) }), null, now)
    ).toBe("EXEMPTED");
  });

  it("Certified but certificate expired => CERTIFICATE_EXPIRED", () => {
    expect(
      getEffectiveStatus(
        assignment(),
        memberCert({
          status: "CERTIFIED",
          verificationStatus: "VERIFIED",
          expirationDate: inPast(2),
        }),
        now
      )
    ).toBe("CERTIFICATE_EXPIRED");
  });

  it("Certified but not verified => not COMPLETED", () => {
    expect(
      getEffectiveStatus(
        assignment(),
        memberCert({ status: "CERTIFIED", verificationStatus: "PENDING", progressPercent: 100 }),
        now
      )
    ).toBe("IN_PROGRESS");
  });
});