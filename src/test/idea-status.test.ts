// R3a — ideaStatus derivation tests.

import { describe, it, expect } from "vitest";
import {
  getIdeaStatus,
  isVerified,
  isUnverifiedIdea,
  isNegativeKeyword,
  filterVerifiedOnly,
} from "../lib/ideaStatus";

const real = (extra: Partial<{ isNegative: boolean }> = {}) => ({
  dataSource: "real" as const,
  isNegative: extra.isNegative ?? false,
});

const estimated = (extra: Partial<{ isNegative: boolean }> = {}) => ({
  dataSource: "estimated" as const,
  isNegative: extra.isNegative ?? false,
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
