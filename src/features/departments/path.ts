/**
 * Helpers cho materialized path của 部署 (department).
 *
 * Chuẩn hoá separator về '/'. Chấp nhận đầu vào '.' '/' '>' '\'.
 */

export const PATH_SEPARATOR = "/";

/** "ORG.DIV-A.DEPT-1" (hoặc "ORG/DIV-A/DEPT-1") -> ["ORG","DIV-A","DEPT-1"] */
export function splitPath(raw: string): string[] {
  return raw
    .split(/[./>\\]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ["ORG","DIV-A","DEPT-1"] -> "ORG/DIV-A/DEPT-1" */
export function joinPath(parts: string[]): string {
  return parts.join(PATH_SEPARATOR);
}

/** Chuẩn hoá bất kỳ chuỗi path nào về dạng "ORG/DIV-A/DEPT-1" */
export function normalizePath(raw: string): string {
  return joinPath(splitPath(raw));
}

/** Danh sách các path tổ tiên (bao gồm cả chính nó), từ gốc xuống. */
export function ancestorPaths(path: string): string[] {
  const parts = splitPath(path);
  const acc: string[] = [];
  const out: string[] = [];
  for (const p of parts) {
    acc.push(p);
    out.push(joinPath(acc));
  }
  return out;
}

/** Path của node cha (null nếu là gốc). */
export function parentPath(path: string): string | null {
  const parts = splitPath(path);
  if (parts.length <= 1) return null;
  return joinPath(parts.slice(0, -1));
}