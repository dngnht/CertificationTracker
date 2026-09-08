import { describe, it, expect } from "vitest";

import {
  levenshtein,
  normalizeForMatch,
  similarityScore,
  isLikelyDuplicate,
  rankSimilar,
} from "@/features/certifications/similarity";

describe("levenshtein", () => {
  it("returns 0 for equal strings", () => {
    expect(levenshtein("AWS-SAA", "aws-saa")).toBe(0);
  });
  it("computes simple distances", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("normalizeForMatch", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeForMatch("AWS-SAA-C03")).toBe("aws saa c03");
    expect(normalizeForMatch("  Azure  Developer ")).toBe("azure developer");
  });
});

describe("similarityScore", () => {
  it("is 1 for identical strings", () => {
    expect(similarityScore("AWS-SAA", "AWS-SAA")).toBe(1);
  });
  it("is 0 when one side is empty", () => {
    expect(similarityScore("", "AWS")).toBe(0);
  });
  it("ranks close codes higher than distant ones", () => {
    expect(similarityScore("AWS-SAA", "AWS-SAA-C03")).toBeGreaterThan(
      similarityScore("AWS-SAA", "CompTIA-Security+")
    );
  });
});

describe("isLikelyDuplicate", () => {
  it("detects near-identical codes", () => {
    expect(isLikelyDuplicate("AWS-SAA", "AWS SAA")).toBe(true);
    expect(isLikelyDuplicate("AWS-SAA", "Google Cloud")).toBe(false);
  });
});

describe("rankSimilar", () => {
  const items = [
    { id: "1", code: "AWS-SAA", name: "AWS Solutions Architect Associate" },
    { id: "2", code: "AZ-204", name: "Microsoft Azure Developer Associate" },
    { id: "3", code: "PMP", name: "Project Management Professional" },
  ];

  it("returns top matches for a query, sorted by score", () => {
    const ranked = rankSimilar("AWS Solutions Architect", items, (i) => ({ code: i.code, name: i.name }), {
      limit: 3,
      threshold: 0.1,
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].item.id).toBe("1");
  });

  it("respects the limit", () => {
    const ranked = rankSimilar("certification", items, (i) => ({ code: i.code, name: i.name }), {
      limit: 2,
      threshold: 0,
    });
    expect(ranked.length).toBeLessThanOrEqual(2);
  });
});