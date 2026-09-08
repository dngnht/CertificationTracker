import { endOfDay } from "date-fns";

/** Trạng thái target (CR-DEPT-02 §4.2). */
export type TargetStatus = "COMPLETED" | "ON_TRACK" | "AT_RISK" | "OVERDUE";

/**
 * Tỉ lệ hoàn thành target, clamp 0..1. Thuần tuý — dễ test.
 */
export function completionRate(achieved: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, achieved / target);
}

/**
 * Trạng thái target theo achieved/target + dueDate.
 * - COMPLETED: rate ≥ 100%
 * - OVERDUE: chưa đạt & quá hạn dueDate (so theo hết ngày kinh doanh — endOfDay)
 * - ON_TRACK: 70% ≤ rate < 100%, chưa quá hạn
 * - AT_RISK: rate < 70%, chưa quá hạn
 */
export function targetStatus(
  achieved: number,
  target: number,
  dueDate?: Date | null,
  now: Date = new Date()
): TargetStatus {
  const rate = completionRate(achieved, target);
  if (rate >= 1) return "COMPLETED";
  if (dueDate && endOfDay(dueDate) < endOfDay(now)) return "OVERDUE";
  if (rate >= 0.7) return "ON_TRACK";
  return "AT_RISK";
}

/** Màu hiển thị cho từng trạng thái (thống nhất toàn UI). */
export const TARGET_STATUS_STYLE: Record<
  TargetStatus,
  { label: string; text: string; bg: string; bar: string }
> = {
  COMPLETED: { label: "Completed", text: "text-green-700", bg: "bg-green-50", bar: "bg-green-500" },
  ON_TRACK: { label: "On track", text: "text-yellow-700", bg: "bg-yellow-50", bar: "bg-yellow-500" },
  AT_RISK: { label: "At risk", text: "text-orange-700", bg: "bg-orange-50", bar: "bg-orange-500" },
  OVERDUE: { label: "Overdue", text: "text-red-700", bg: "bg-red-50", bar: "bg-red-500" },
};