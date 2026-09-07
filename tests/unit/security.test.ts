import { describe, it, expect } from "vitest";

import { canAccessMemberCertification, canMutateMemberCertification } from "@/features/files/access";

describe("authorization: member A cannot access member B data", () => {
  it("Member A cannot read member B's certification", () => {
    expect(canAccessMemberCertification("memberA", "memberB", "MEMBER")).toBe(false);
  });

  it("Member A cannot mutate member B's certification", () => {
    expect(canMutateMemberCertification("memberA", "memberB", "MEMBER")).toBe(false);
  });

  it("Member can access their own certification", () => {
    expect(canAccessMemberCertification("memberA", "memberA", "MEMBER")).toBe(true);
    expect(canMutateMemberCertification("memberA", "memberA", "MEMBER")).toBe(true);
  });

  it("Admin can access any member's certification", () => {
    expect(canAccessMemberCertification("admin", "memberB", "ADMIN")).toBe(true);
    expect(canMutateMemberCertification("admin", "memberB", "ADMIN")).toBe(true);
  });
});