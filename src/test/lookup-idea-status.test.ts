// R7 — lookupIdeaStatus tests.
import { describe, it, expect } from "vitest";
import { lookupIdeaStatus } from "../lib/ideaStatus";

const universe = {
  keywords: [
    { keyword: "Test", dataSource: "real" as const, isNegative: false },
    { keyword: "Idea KW", dataSource: "estimated" as const, isNegative: false },
    { keyword: "Bad KW", dataSource: "real" as const, isNegative: true },
  ],
};

describe("lookupIdeaStatus", () => {
  it("returns verified for real datasource, case-insensitive match", () => {
    expect(lookupIdeaStatus(universe, "test")).toBe("verified");
    expect(lookupIdeaStatus(universe, "  TEST  ")).toBe("verified");
  });

  it("returns unverified_idea for estimated datasource", () => {
    expect(lookupIdeaStatus(universe, "idea kw")).toBe("unverified_idea");
  });

  it("returns negative when isNegative is true", () => {
    expect(lookupIdeaStatus(universe, "bad kw")).toBe("negative");
  });

  it("returns undefined when keyword not found", () => {
    expect(lookupIdeaStatus(universe, "missing")).toBeUndefined();
  });

  it("returns undefined for null/undefined inputs", () => {
    expect(lookupIdeaStatus(null, "test")).toBeUndefined();
    expect(lookupIdeaStatus(undefined, "test")).toBeUndefined();
    expect(lookupIdeaStatus(universe, null)).toBeUndefined();
    expect(lookupIdeaStatus(universe, undefined)).toBeUndefined();
    expect(lookupIdeaStatus(universe, "")).toBeUndefined();
    expect(lookupIdeaStatus(universe, "   ")).toBeUndefined();
  });
});
