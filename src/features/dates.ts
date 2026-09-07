/**
 * Pure date helpers. Kept dependency-free so they are trivially testable.
 */

/** Whole days between two dates (positive when `from` is before `to`). */
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / msPerDay);
}

/** Whole days from today until `date` (negative when `date` is in the past). */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return daysBetween(now, date);
}

export function isPast(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

export function isToday(date: Date, now: Date = new Date()): boolean {
  return daysBetween(now, date) === 0;
}

/** Add `months` calendar months to a date (clamps day-of-month overflow). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) {
    result.setDate(0);
  }
  return result;
}

export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** End of today (23:59:59.999). */
export function endOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}