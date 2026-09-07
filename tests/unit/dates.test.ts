import { describe, it, expect } from "vitest";

import { daysBetween, daysUntil, isPast, addMonths } from "@/features/dates";

describe("date helpers", () => {
  it("daysBetween counts whole days", () => {
    expect(daysBetween(new Date("2026-06-01"), new Date("2026-06-11"))).toBe(10);
    expect(daysBetween(new Date("2026-06-11"), new Date("2026-06-01"))).toBe(-10);
  });

  it("daysUntil is positive in the future, negative in the past", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(daysUntil(new Date("2026-06-25T00:00:00Z"), now)).toBe(10);
    expect(daysUntil(new Date("2026-06-05T00:00:00Z"), now)).toBe(-10);
  });

  it("isPast", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(isPast(new Date("2026-06-14T00:00:00Z"), now)).toBe(true);
    expect(isPast(new Date("2026-06-16T00:00:00Z"), now)).toBe(false);
  });

  it("addMonths clamps day overflow", () => {
    expect(addMonths(new Date("2026-01-31"), 1).getDate()).toBe(28);
    expect(addMonths(new Date("2026-03-15"), 1).getDate()).toBe(15);
  });
});