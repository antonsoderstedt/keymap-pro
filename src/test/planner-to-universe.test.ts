import { describe, it, expect } from "vitest";
import {
  plannerIdeaToUniverseKeyword,
  mergeIdeasIntoUniverse,
} from "@/lib/plannerToUniverse";
import type { KeywordPlannerIdea, KeywordUniverse, UniverseKeyword } from "@/lib/types";

function makeIdea(overrides: Partial<KeywordPlannerIdea> = {}): KeywordPlannerIdea {
  return {
    id: "i1",
    project_id: "p1",
    run_id: "r1",
    seed_keyword: "takläggning",
    seed_url: null,
    keyword: "takläggare stockholm",
    language_code: "1015",
    location_code: "2752",
    avg_monthly_searches: 500,
    competition: "MEDIUM",
    competition_index: 50,
    low_top_of_page_bid_micros: 10_000_000,
    high_top_of_page_bid_micros: 25_000_000,
    fetched_at: "2026-05-25T00:00:00Z",
    created_at: "2026-05-25T00:00:00Z",
    ...overrides,
  };
}

function makeUniverse(keywords: Partial<UniverseKeyword>[] = []): KeywordUniverse {
  const ks: UniverseKeyword[] = keywords.map((k) => ({
    keyword: "default",
    cluster: "c",
    dimension: "produkt",
    intent: "commercial",
    funnelStage: "consideration",
    priority: "medium",
    channel: "SEO",
    dataSource: "estimated",
    searchVolume: 100,
    ...k,
  }));
  return {
    scale: "focused",
    generatedAt: "2026-05-25T00:00:00Z",
    totalKeywords: ks.length,
    totalEnriched: 0,
    cities: [],
    keywords: ks,
  };
}

describe("plannerIdeaToUniverseKeyword", () => {
  it("always sets dataSource to 'real'", () => {
    const k = plannerIdeaToUniverseKeyword(makeIdea());
    expect(k.dataSource).toBe("real");
  });

  it("maps volume → priority (high ≥1000, medium ≥100, else low)", () => {
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: 2000 })).priority).toBe("high");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: 1000 })).priority).toBe("high");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: 500 })).priority).toBe("medium");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: 100 })).priority).toBe("medium");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: 50 })).priority).toBe("low");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: 0 })).priority).toBe("low");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ avg_monthly_searches: null })).priority).toBe("low");
  });

  it("converts CPC from micros and competition from index/100", () => {
    const k = plannerIdeaToUniverseKeyword(makeIdea({
      high_top_of_page_bid_micros: 25_000_000,
      competition_index: 75,
    }));
    expect(k.cpc).toBe(25);
    expect(k.competition).toBe(0.75);
  });

  it("handles null CPC and competition gracefully", () => {
    const k = plannerIdeaToUniverseKeyword(makeIdea({
      high_top_of_page_bid_micros: null,
      competition_index: null,
    }));
    expect(k.cpc).toBeUndefined();
    expect(k.competition).toBeUndefined();
  });

  it("uses seed_keyword as cluster, falls back to 'Keyword Planner'", () => {
    expect(plannerIdeaToUniverseKeyword(makeIdea({ seed_keyword: "tak" })).cluster).toBe("tak");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ seed_keyword: null })).cluster).toBe("Keyword Planner");
    expect(plannerIdeaToUniverseKeyword(makeIdea({ seed_keyword: "" })).cluster).toBe("Keyword Planner");
  });

  it("sets channel to 'Google Ads', intent 'commercial', isNegative false", () => {
    const k = plannerIdeaToUniverseKeyword(makeIdea());
    expect(k.channel).toBe("Google Ads");
    expect(k.intent).toBe("commercial");
    expect(k.isNegative).toBe(false);
  });
});

describe("mergeIdeasIntoUniverse", () => {
  it("is a no-op when ideas array is empty", () => {
    const u = makeUniverse([{ keyword: "x" }]);
    const result = mergeIdeasIntoUniverse(u, []);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.universe).toBe(u);
  });

  it("adds new ideas and counts them", () => {
    const u = makeUniverse([{ keyword: "existing" }]);
    const result = mergeIdeasIntoUniverse(u, [
      makeIdea({ keyword: "new1" }),
      makeIdea({ id: "i2", keyword: "new2" }),
    ]);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.universe.keywords).toHaveLength(3);
    expect(result.universe.totalKeywords).toBe(3);
  });

  it("skips ideas whose keyword already exists (case-insensitive)", () => {
    const u = makeUniverse([{ keyword: "Takläggning" }]);
    const result = mergeIdeasIntoUniverse(u, [
      makeIdea({ keyword: "takläggning" }),
      makeIdea({ id: "i2", keyword: "TAKLÄGGNING" }),
      makeIdea({ id: "i3", keyword: "ny" }),
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("never overwrites existing keywords (existing wins)", () => {
    const u = makeUniverse([
      { keyword: "tak", dataSource: "estimated", priority: "low", searchVolume: 10 },
    ]);
    const result = mergeIdeasIntoUniverse(u, [
      makeIdea({ keyword: "tak", avg_monthly_searches: 9999 }),
    ]);
    const existing = result.universe.keywords.find((k) => k.keyword === "tak");
    expect(existing?.dataSource).toBe("estimated");
    expect(existing?.priority).toBe("low");
    expect(existing?.searchVolume).toBe(10);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("dedupes within the same batch", () => {
    const u = makeUniverse([]);
    const result = mergeIdeasIntoUniverse(u, [
      makeIdea({ keyword: "duplicate" }),
      makeIdea({ id: "i2", keyword: "Duplicate" }),
      makeIdea({ id: "i3", keyword: "DUPLICATE" }),
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("returns same universe reference when nothing is added", () => {
    const u = makeUniverse([{ keyword: "tak" }]);
    const result = mergeIdeasIntoUniverse(u, [makeIdea({ keyword: "tak" })]);
    expect(result.universe).toBe(u);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("preserves other universe fields", () => {
    const u: KeywordUniverse = {
      ...makeUniverse([]),
      scale: "broad",
      cities: ["Stockholm"],
      engineVersion: "v2",
    };
    const result = mergeIdeasIntoUniverse(u, [makeIdea({ keyword: "new" })]);
    expect(result.universe.scale).toBe("broad");
    expect(result.universe.cities).toEqual(["Stockholm"]);
    expect(result.universe.engineVersion).toBe("v2");
  });
});
