import { describe, it, expect } from "vitest";

import {
  splitPath,
  joinPath,
  normalizePath,
  ancestorPaths,
  parentPath,
} from "@/features/departments/path";
import { parseCsv } from "@/features/departments/csv";
import { buildDepartmentTree } from "@/features/departments/queries";
import { decideDepartmentSync } from "@/features/departments/entra-sync";

describe("path helpers", () => {
  it("splitPath handles '.', '/', '>', '\\' separators", () => {
    expect(splitPath("ORG.DIV-A.DEPT-1")).toEqual(["ORG", "DIV-A", "DEPT-1"]);
    expect(splitPath("ORG/DIV-A/DEPT-1")).toEqual(["ORG", "DIV-A", "DEPT-1"]);
    expect(splitPath("ORG>DIV-A>DEPT-1")).toEqual(["ORG", "DIV-A", "DEPT-1"]);
    expect(splitPath("ORG\\DIV-A\\DEPT-1")).toEqual(["ORG", "DIV-A", "DEPT-1"]);
  });

  it("splitPath ignores empty segments and trims", () => {
    expect(splitPath("  ORG .. DIV-A / DEPT-1 ")).toEqual(["ORG", "DIV-A", "DEPT-1"]);
    expect(splitPath("")).toEqual([]);
  });

  it("joinPath joins with '/'", () => {
    expect(joinPath(["ORG", "DIV-A", "DEPT-1"])).toBe("ORG/DIV-A/DEPT-1");
  });

  it("normalizePath normalizes any input", () => {
    expect(normalizePath("ORG.DIV-A.DEPT-1")).toBe("ORG/DIV-A/DEPT-1");
  });

  it("ancestorPaths returns all prefixes from root", () => {
    expect(ancestorPaths("ORG/DIV-A/DEPT-1")).toEqual([
      "ORG",
      "ORG/DIV-A",
      "ORG/DIV-A/DEPT-1",
    ]);
  });

  it("parentPath returns null for root", () => {
    expect(parentPath("ORG")).toBeNull();
    expect(parentPath("ORG/DIV-A")).toBe("ORG");
  });
});

describe("parseCsv", () => {
  it("parses header + rows", () => {
    const rows = parseCsv(
      "email,displayName,departmentPath,role\nalice@example.com,Alice,ORG/DIV-A,MEMBER\nbob@example.com,Bob,ORG/DIV-B,ADMIN"
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      email: "alice@example.com",
      displayName: "Alice",
      departmentPath: "ORG/DIV-A",
      role: "MEMBER",
    });
  });

  it("handles quoted commas", () => {
    const rows = parseCsv('email,name\na@x.com,"Smith, John"');
    expect(rows[0].name).toBe("Smith, John");
  });

  it("returns empty array for blank input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("buildDepartmentTree", () => {
  const flat = [
    { id: "org", code: "ORG", name: "ORG", path: "ORG", depth: 0, memberCount: 5 },
    { id: "diva", code: "DIV-A", name: "DIV-A", path: "ORG/DIV-A", depth: 1, memberCount: 3 },
    { id: "dept1", code: "DEPT-1", name: "DEPT-1", path: "ORG/DIV-A/DEPT-1", depth: 2, memberCount: 2 },
    { id: "teamx", code: "TEAM-X", name: "TEAM-X", path: "ORG/DIV-A/DEPT-1/TEAM-X", depth: 3, memberCount: 1 },
    { id: "divb", code: "DIV-B", name: "DIV-B", path: "ORG/DIV-B", depth: 1, memberCount: 2 },
  ];

  it("builds nested tree from flat list", () => {
    const tree = buildDepartmentTree(flat);
    expect(tree).toHaveLength(1);
    const org = tree[0];
    expect(org.id).toBe("org");
    expect(org.children.map((c) => c.id)).toEqual(["diva", "divb"]);
    const diva = org.children[0];
    expect(diva.children[0].id).toBe("dept1");
    expect(diva.children[0].children[0].id).toBe("teamx");
  });
});

describe("decideDepartmentSync", () => {
  it("does not override a manually-locked department", () => {
    expect(
      decideDepartmentSync({ departmentLocked: true, entraDepartment: "ORG/DIV-A" })
    ).toEqual({ sync: false, reason: "MANUAL_LOCK" });
  });

  it("skips when Entra has no department", () => {
    expect(
      decideDepartmentSync({ departmentLocked: false, entraDepartment: null })
    ).toEqual({ sync: false, reason: "NO_DEPARTMENT" });
    expect(
      decideDepartmentSync({ departmentLocked: false, entraDepartment: "  " })
    ).toEqual({ sync: false, reason: "NO_DEPARTMENT" });
  });

  it("syncs when unlocked and department present", () => {
    expect(
      decideDepartmentSync({ departmentLocked: false, entraDepartment: "DEPT-1" })
    ).toEqual({ sync: true, reason: "SYNC" });
  });
});