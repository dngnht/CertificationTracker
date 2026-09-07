import { describe, it, expect } from "vitest";

import { canSendReminder } from "@/features/reminders/rules";

const now = new Date("2026-06-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);

describe("canSendReminder", () => {
  it("No previous reminder => allowed", () => {
    expect(canSendReminder({ lastReminderAt: null, cooldownHours: 24, now }).allowed).toBe(true);
  });

  it("Reminder within 24h => blocked", () => {
    const result = canSendReminder({ lastReminderAt: hoursAgo(2), cooldownHours: 24, now });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("COOLDOWN");
  });

  it("Reminder exactly at cooldown boundary => blocked (>= cooldown)", () => {
    const result = canSendReminder({ lastReminderAt: hoursAgo(24), cooldownHours: 24, now });
    expect(result.allowed).toBe(false);
  });

  it("Reminder older than 24h => allowed", () => {
    expect(canSendReminder({ lastReminderAt: hoursAgo(25), cooldownHours: 24, now }).allowed).toBe(true);
  });

  it("Force overrides cooldown", () => {
    const result = canSendReminder({ lastReminderAt: hoursAgo(1), cooldownHours: 24, now, force: true });
    expect(result.allowed).toBe(true);
  });
});