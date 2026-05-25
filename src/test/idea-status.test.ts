// R3a — ideaStatus derivation tests.
// R3b — isWinner + filterByIdeaTab tests.

import { describe, it, expect } from "vitest";
import {
  getIdeaStatus,
  isVerified,
  isUnverifiedIdea,
  isNegativeKeyword,
  filterVerifiedOnly,
  isWinner,
  filterByIdeaTab,
} from "../lib/ideaStatus";

const real = (extra: Partial<{ isNegative: boolean; priority: "high" | "medium" | "low" | "skip"; searchVolume: number }> = {}) => ({
  dataSource: "real" as const,
  isNegative: extra.isNegative ?? false,
  priority: (extra.priority ?? "medium") as "high" | "medium" | "low" | "skip",
  searchVolume: extra.searchVolume ?? 100,
});

const estimated = (extra: Partial<{ isNegative: boolean; priority: "high" | "medium" | "low" | "skip"; searchVolume: number }> = {}) => ({
  dataSource: "estimated" as const,
  isNegative: extra.isNegative ?? false,
  priority: (extra.priority ?? "medium") as "high" | "medium" | "low" | "skip",
  searchVolume: extra.searchVolume ?? 0,
});

describe("getIdeaStatus", () => {
  it("returns 'verified' for real datasource", () => {
    expect(getIdeaStatus(real())).toBe("verified");
  });

  it("returns 'unverified_idea' for estimated datasource", () => {
    expect(getIdeaStatus(estimated())).toBe("unverified_idea");
  });

  it("returns 'negative' when isNegative=true, regardless of datasource", () => {
    expect(getIdeaStatus(real({ isNegative: true }))).toBe("negative");
    expect(getIdeaStatus(estimated({ isNegative: true }))).toBe("negative");
  });

  it("treats missing isNegative as false", () => {
    expect(getIdeaStatus({ dataSource: "real" })).toBe("verified");
    expect(getIdeaStatus({ dataSource: "estimated" })).toBe("unverified_idea");
  });
});

describe("predicates", () => {
  it("isVerified is true only for verified", () => {
    expect(isVerified(real())).toBe(true);
    expect(isVerified(estimated())).toBe(false);
    expect(isVerified(real({ isNegative: true }))).toBe(false);
  });

  it("isUnverifiedIdea is true only for unverified_idea", () => {
    expect(isUnverifiedIdea(estimated())).toBe(true);
    expect(isUnverifiedIdea(real())).toBe(false);
    expect(isUnverifiedIdea(estimated({ isNegative: true }))).toBe(false);
  });

  it("isNegativeKeyword is true only when marked negative", () => {
    expect(isNegativeKeyword(real({ isNegative: true }))).toBe(true);
    expect(isNegativeKeyword(estimated({ isNegative: true }))).toBe(true);
    expect(isNegativeKeyword(real())).toBe(false);
  });
});

describe("filterVerifiedOnly", () => {
  it("drops unverified_idea entries", () => {
    const input = [real(), estimated(), real(), estimated()];
    expect(filterVerifiedOnly(input)).toHaveLength(2);
  });

  it("keeps negative entries (separate concern)", () => {
    const input = [
      real(),
      estimated(),
      real({ isNegative: true }),
      estimated({ isNegative: true }),
    ];
    const out = filterVerifiedOnly(input);
    // keeps real, real-negative, estimated-negative (status="negative") — drops only estimated
    expect(out).toHaveLength(3);
    expect(out.every((k) => getIdeaStatus(k) !== "unverified_idea")).toBe(true);
  });

  it("returns empty for all-unverified input", () => {
    expect(filterVerifiedOnly([estimated(), estimated()])).toEqual([]);
  });

  it("returns same array contents for all-verified input", () => {
    const input = [real(), real()];
    expect(filterVerifiedOnly(input)).toHaveLength(2);
  });
});

describe("isWinner", () => {
  it("true when real + non-negative + volume>0 + priority=high", () => {
    expect(isWinner(real({ priority: "high", searchVolume: 500 }))).toBe(true);
  });

  it("false when dataSource is estimated (even if priority=high)", () => {
    expect(isWinner(estimated({ priority: "high", searchVolume: 500 }))).toBe(false);
  });

  it("false when isNegative", () => {
    expect(isWinner(real({ priority: "high", searchVolume: 500, isNegative: true }))).toBe(false);
  });

  it("false when searchVolume is 0", () => {
    expect(isWinner(real({ priority: "high", searchVolume: 0 }))).toBe(false);
  });

  it("false when priority is medium/low/skip", () => {
    expect(isWinner(real({ priority: "medium", searchVolume: 500 }))).toBe(false);
    expect(isWinner(real({ priority: "low", searchVolume: 500 }))).toBe(false);
    expect(isWinner(real({ priority: "skip", searchVolume: 500 }))).toBe(false);
  });
});

describe("filterByIdeaTab", () => {
  const v = real({ priority: "medium", searchVolume: 100 });           // verified, not winner
  const w = real({ priority: "high", searchVolume: 500 });             // verified + winner
  const u = estimated({ priority: "medium", searchVolume: 0 });        // unverified
  const n1 = real({ isNegative: true });                                // negative (real)
  const n2 = estimated({ isNegative: true });                           // negative (estimated)
  const items = [v, w, u, n1, n2];

  it("'all' returns full list", () => {
    expect(filterByIdeaTab(items, "all")).toEqual(items);
  });

  it("'verified' returns only verified entries (includes winners)", () => {
    expect(filterByIdeaTab(items, "verified")).toEqual([v, w]);
  });

  it("'unverified' returns only unverified ideas", () => {
    expect(filterByIdeaTab(items, "unverified")).toEqual([u]);
  });

  it("'negative' returns all negatives regardless of datasource", () => {
    expect(filterByIdeaTab(items, "negative")).toEqual([n1, n2]);
  });

  it("'winners' returns only items matching isWinner", () => {
    expect(filterByIdeaTab(items, "winners")).toEqual([w]);
  });

  it("tab partitions are mutually exclusive across verified/unverified/negative", () => {
    const v_ = filterByIdeaTab(items, "verified");
    const u_ = filterByIdeaTab(items, "unverified");
    const n_ = filterByIdeaTab(items, "negative");
    expect(v_.length + u_.length + n_.length).toBe(items.length);
  });
});
