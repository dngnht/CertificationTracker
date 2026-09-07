import { describe, it, expect } from "vitest";

import { getToolsForRole, getToolByName } from "@/features/ai/tools/registry";

describe("AI tool role scoping", () => {
  it("member scope exposes member tools but NOT admin/org-wide tools", () => {
    const memberTools = getToolsForRole("MEMBER");
    const names = memberTools.map((t) => t.name);
    expect(names).toContain("getMyAssignments");
    expect(names).toContain("getMyGold");
    expect(names).not.toContain("getOverdueMembers");
    expect(names).not.toContain("getComplianceOverview");
    expect(names).not.toContain("getMemberSummary");
  });

  it("member scope never exposes write/mutation tools", () => {
    const memberTools = getToolsForRole("MEMBER");
    expect(memberTools.every((t) => t.kind === "read")).toBe(true);
  });

  it("admin scope exposes org-wide read tools and write tools", () => {
    const adminTools = getToolsForRole("ADMIN");
    const names = adminTools.map((t) => t.name);
    expect(names).toContain("getOverdueMembers");
    expect(names).toContain("getHotCertifications");
    expect(names).toContain("addRecommendedCertification");
    expect(names).toContain("setCertificationGoldReward");
    expect(names).toContain("assignRecommendedToMembers");
    expect(names).toContain("updateAssignmentDeadline");
  });

  it("all write tools are ADMIN-scoped (defense in depth)", () => {
    const adminTools = getToolsForRole("ADMIN");
    const writeTools = adminTools.filter((t) => t.kind === "write");
    expect(writeTools.length).toBeGreaterThan(0);
    expect(writeTools.every((t) => t.scope === "ADMIN")).toBe(true);
  });

  it("getToolByName resolves registered tools", () => {
    expect(getToolByName("getMyCompliance")?.scope).toBe("MEMBER");
    expect(getToolByName("addRecommendedCertification")?.kind).toBe("write");
    expect(getToolByName("nonexistent")).toBeUndefined();
  });
});