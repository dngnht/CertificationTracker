/**
 * Reminder safety rules.
 */

export interface CanSendReminderResult {
  allowed: boolean;
  reason: "OK" | "COOLDOWN" | "NO_ASSIGNMENT" | "ALREADY_COMPLETED";
}

/**
 * Determine whether a reminder may be sent for an assignment.
 *
 * A reminder is blocked when one was already sent within the cooldown window
 * (default 24h) to prevent accidental spam. Admins can override via
 * `force = true`.
 */
export function canSendReminder(input: {
  lastReminderAt: Date | null;
  cooldownHours: number;
  now?: Date;
  force?: boolean;
}): CanSendReminderResult {
  const now = input.now ?? new Date();

  if (input.force) {
    return { allowed: true, reason: "OK" };
  }

  if (!input.lastReminderAt) {
    return { allowed: true, reason: "OK" };
  }

  const cooldownMs = input.cooldownHours * 60 * 60 * 1000;
  if (now.getTime() - input.lastReminderAt.getTime() <= cooldownMs) {
    return { allowed: false, reason: "COOLDOWN" };
  }

  return { allowed: true, reason: "OK" };
}