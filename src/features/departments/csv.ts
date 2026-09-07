/**
 * Parser CSV tối giản, không phụ thuộc thư viện ngoài.
 * Hỗ trợ header, dấu ngoặc kép, và dòng trống.
 *
 * Chỉ nhận các cột whitelist: email, displayName, departmentPath, role.
 */

export interface CsvRecord {
  [column: string]: string;
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/** Chuẩn hoá tên cột header về key chuẩn (camelCase). */
const COLUMN_ALIASES: Record<string, string> = {
  email: "email",
  displayname: "displayName",
  "display name": "displayName",
  departmentpath: "departmentPath",
  "department path": "departmentPath",
  dept: "departmentPath",
  role: "role",
};

function canonicalColumn(raw: string): string {
  return COLUMN_ALIASES[raw.toLowerCase()] ?? raw;
}

/** Parse CSV text thành mảng record. Dòng đầu là header. */
export function parseCsv(text: string): CsvRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const header = parseLine(lines[0]).map((h) => canonicalColumn(h.trim()));
  const out: CsvRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const rec: CsvRecord = {};
    for (let c = 0; c < header.length; c++) {
      rec[header[c]] = cells[c] ?? "";
    }
    out.push(rec);
  }
  return out;
}