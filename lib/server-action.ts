import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Wrap a server action body so that thrown errors become serialisable
 * `{ ok: false, error }` results instead of crashing the request.
 */
export async function wrapAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error("Server action failed:", err);
    return { ok: false, error: message };
  }
}

export function revalidateTracker(paths: string[] = []) {
  const defaults = [
    "/dashboard",
    "/admin/dashboard",
    "/admin/certifications",
    "/admin/members",
    "/admin/certification-plan",
    "/admin/reports/overdue",
    "/admin/reports/missing",
    "/admin/reports/upcoming",
    "/admin/reports/expiring",
  ];
  for (const p of [...defaults, ...paths]) {
    revalidatePath(p);
  }
}