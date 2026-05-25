import type {
  KeywordPlannerIdea,
  KeywordUniverse,
  UniverseKeyword,
  UniversePriority,
} from "@/lib/types";

/**
 * Map a Google Ads Keyword Planner idea to a UniverseKeyword.
 * Planner data comes straight from Google → always dataSource: "real".
 */
export function plannerIdeaToUniverseKeyword(idea: KeywordPlannerIdea): UniverseKeyword {
  const volume = idea.avg_monthly_searches ?? 0;
  const priority: UniversePriority =
    volume >= 1000 ? "high" : volume >= 100 ? "medium" : "low";

  const cpc =
    idea.high_top_of_page_bid_micros != null
      ? idea.high_top_of_page_bid_micros / 1_000_000
      : undefined;

  const competition =
    idea.competition_index != null ? idea.competition_index / 100 : undefined;

  return {
    keyword: idea.keyword,
    cluster: idea.seed_keyword || "Keyword Planner",
    dimension: "produkt",
    intent: "commercial",
    funnelStage: "consideration",
    priority,
    channel: "Google Ads",
    isNegative: false,
    searchVolume: volume,
    cpc,
    competition,
    dataSource: "real",
  };
}

export interface MergeResult {
  universe: KeywordUniverse;
  added: number;
  skipped: number;
}

/**
 * Merge planner ideas into a universe. Existing keywords (case-insensitive)
 * are never overwritten — scored/curated data wins.
 */
export function mergeIdeasIntoUniverse(
  universe: KeywordUniverse,
  ideas: KeywordPlannerIdea[],
): MergeResult {
  if (ideas.length === 0) {
    return { universe, added: 0, skipped: 0 };
  }

  const existing = new Set(universe.keywords.map((k) => k.keyword.toLowerCase()));
  const newKeywords: UniverseKeyword[] = [];
  const seenInBatch = new Set<string>();
  let skipped = 0;

  for (const idea of ideas) {
    const key = idea.keyword.toLowerCase();
    if (existing.has(key) || seenInBatch.has(key)) {
      skipped++;
      continue;
    }
    seenInBatch.add(key);
    newKeywords.push(plannerIdeaToUniverseKeyword(idea));
  }

  if (newKeywords.length === 0) {
    return { universe, added: 0, skipped };
  }

  return {
    universe: {
      ...universe,
      keywords: [...universe.keywords, ...newKeywords],
      totalKeywords: universe.keywords.length + newKeywords.length,
    },
    added: newKeywords.length,
    skipped,
  };
}
