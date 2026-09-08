import { describe, it, expect } from "vitest";
import { completionRate, targetStatus } from "@/features/dept-analytics/compute";

describe("completionRate (CR-DEPT-02)", () => {
  it("returns 0 when target is 0 or negative", () => {
    expect(completionRate(5, 0)).toBe(0);
    expect(completionRate(5, -3)).toBe(0);
  });

  it("returns achieved/target clamped to 0..1", () => {
    expect(completionRate(10, 20)).toBe(0.5);
    expect(completionRate(20, 20)).toBe(1);
    expect(completionRate(30, 20)).toBe(1);
    expect(completionRate(0, 10)).toBe(0);
  });
});

describe("targetStatus (CR-DEPT-02 §4.2)", () => {
  const now = new Date("2026-09-08T10:00:00");

  it("COMPLETED when rate >= 100%", () => {
    expect(targetStatus(20, 20, null, now)).toBe("COMPLETED");
    expect(targetStatus(25, 20, null, now)).toBe("COMPLETED");
  });

  it("ON_TRACK when 70% <= rate < 100% and not overdue", () => {
    expect(targetStatus(14, 20, new Date("2026-12-31"), now)).toBe("ON_TRACK");
  });

  it("AT_RISK when rate < 70% and not overdue", () => {
    expect(targetStatus(10, 20, new Date("2026-12-31"), now)).toBe("AT_RISK");
  });

  it("OVERDUE when not achieved and past dueDate", () => {
    expect(targetStatus(10, 20, new Date("2026-09-01"), now)).toBe("OVERDUE");
  });

  it("dueDate on the same day is not yet overdue (end-of-day comparison)", () => {
    expect(targetStatus(10, 20, new Date("2026-09-08"), now)).toBe("AT_RISK");
  });
});