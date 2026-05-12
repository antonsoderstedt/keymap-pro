// Keyword Intelligence v2 — opportunity discovery (adaptive thresholds)
// Trösklar härleds från universumets egna distribution (percentiler) istället för
// hårdkodade värden, så att nisch-B2B (KD 30–60) och konsumentsajter (KD 5–25)
// båda får ~5–10 meningsfulla opportunities.

type ScoredKw = {
  keyword: string;
  cluster: string;
  dimension: string;
  intent: string;
  channel: string;
  isNegative?: boolean;
  priority: "high" | "medium" | "low" | "skip";
  searchVolume?: number;
  cpc?: number;
  kd?: number;
  topRankingDomains?: string[];
  competitorGap?: boolean;
  score?: { final: number; revenue: { p50: number } };
};

export type Opportunity = {
  type:
    | "quick_dominance"
    | "service_gap"
    | "striking_distance_cluster"
    | "geo_opportunity"
    | "market_expansion"
    | "high_score_underserved"
    | "cluster_consolidation";
  title: string;
  description: string;
  keywords: string[];
  estimated_revenue_p50?: number;
  priority: "high" | "medium" | "low";
};

const isUsable = (kw: ScoredKw) => !kw.isNegative && kw.priority !== "skip";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function scoreOf(kw: ScoredKw): number {
  return kw.score?.final ?? 0;
}
function revOf(kw: ScoredKw): number {
  return kw.score?.revenue?.p50 ?? 0;
}

export function discoverOpportunities(universe: ScoredKw[]): Opportunity[] {
  const out: Opportunity[] = [];
  const usable = universe.filter(isUsable);
  if (usable.length === 0) return out;

  // ---- Adaptiva trösklar från universumets distribution ----
  const kds = usable.map((k) => k.kd).filter((v): v is number => v != null).sort((a, b) => a - b);
  const vols = usable.map((k) => k.searchVolume ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  const scores = usable.map(scoreOf).sort((a, b) => a - b);

  const kdP25 = percentile(kds, 25);
  const kdP50 = percentile(kds, 50);
  const volP50 = percentile(vols, 50);
  const volP75 = percentile(vols, 75);
  const scoreP50 = percentile(scores, 50);
  const scoreP75 = percentile(scores, 75);
  const scoreP90 = percentile(scores, 90);

  const usedKws = new Set<string>();
  const markUsed = (kws: string[]) => kws.forEach((k) => usedKws.add(k));

  // ---- 1. quick_dominance: topp-score + kommersiell + (gap eller låg KD relativt) ----
  const quickWins = usable
    .filter((kw) =>
      scoreOf(kw) >= scoreP90 &&
      (kw.intent === "transactional" || kw.intent === "commercial") &&
      (kw.competitorGap || (kw.kd != null && kw.kd <= kdP25))
    )
    .sort((a, b) => revOf(b) - revOf(a))
    .slice(0, 8);

  if (quickWins.length >= 3) {
    const kws = quickWins.map((k) => k.keyword);
    out.push({
      type: "quick_dominance",
      title: "Snabbvinster: topp-score + låg konkurrens",
      description:
        `${quickWins.length} kommersiella sökord i toppen av v2-scoringen där KD är låg relativt din nisch ` +
        `eller konkurrenterna saknas i topp 10. Bygg landningssidor här först.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(quickWins.reduce((s, k) => s + revOf(k), 0)),
      priority: "high",
    });
    markUsed(kws);
  }

  // ---- Klusteraggregat ----
  const byCluster = new Map<string, ScoredKw[]>();
  for (const kw of usable) {
    if (!byCluster.has(kw.cluster)) byCluster.set(kw.cluster, []);
    byCluster.get(kw.cluster)!.push(kw);
  }
  const clusterStats = [...byCluster.entries()].map(([cluster, kws]) => {
    const totalVol = kws.reduce((s, k) => s + (k.searchVolume || 0), 0);
    const avgScore = kws.reduce((s, k) => s + scoreOf(k), 0) / kws.length;
    const gapShare = kws.filter((k) => k.competitorGap).length / kws.length;
    return { cluster, kws, totalVol, avgScore, gapShare };
  });
  const clusterVols = clusterStats.map((c) => c.totalVol).sort((a, b) => a - b);
  const clusterVolP75 = percentile(clusterVols, 75);

  // ---- 2. service_gap: kluster med hög score + majoritet competitorGap ----
  const serviceGaps = clusterStats
    .filter((c) =>
      c.kws.length >= 3 &&
      c.avgScore >= scoreP75 &&
      c.gapShare >= 0.6 &&
      c.kws.some((k) => k.intent === "commercial" || k.intent === "transactional")
    )
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  for (const c of serviceGaps) {
    const kws = c.kws.slice(0, 10).map((k) => k.keyword);
    out.push({
      type: "service_gap",
      title: `Tjänstgap: "${c.cluster}"`,
      description:
        `${c.kws.length} sökord i klustret där ${Math.round(c.gapShare * 100)}% saknar dina konkurrenter ` +
        `i topp 10. Bygg en hub-sida.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
      priority: "high",
    });
    markUsed(kws);
  }

  // ---- 3. striking_distance_cluster: stora kluster med hyfsad score ----
  const striking = clusterStats
    .filter((c) => c.totalVol >= clusterVolP75 && c.avgScore >= scoreP50 && c.kws.length >= 3)
    .sort((a, b) => b.totalVol - a.totalVol)
    .slice(0, 4);

  for (const c of striking) {
    const kws = c.kws.slice(0, 10).map((k) => k.keyword);
    if (kws.every((k) => usedKws.has(k))) continue;
    out.push({
      type: "striking_distance_cluster",
      title: `Räckhåll: "${c.cluster}"`,
      description:
        `${c.kws.length} sökord, total månadsvolym ${c.totalVol.toLocaleString("sv-SE")}. ` +
        `Pillar-sida fångar hela klustret.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
    markUsed(kws);
  }

  // ---- 4. geo_opportunity: location-dimension med score ≥ p50 ----
  const geoKws = usable
    .filter((kw) => kw.dimension === "location" && scoreOf(kw) >= scoreP50)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 12);

  if (geoKws.length >= 5) {
    const kws = geoKws.map((k) => k.keyword);
    out.push({
      type: "geo_opportunity",
      title: "Geo-expansion: städer värd lokal närvaro",
      description:
        `${geoKws.length} lokal-sökord med stark v2-score. Bygg location-pages med GBP-koppling.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(geoKws.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
    markUsed(kws);
  }

  // ---- 5. cluster_consolidation: medelstora kluster med score ≥ p50 ----
  const consolidation = clusterStats
    .filter((c) =>
      c.kws.length >= 5 &&
      c.avgScore >= scoreP50 &&
      !c.kws.every((k) => usedKws.has(k.keyword))
    )
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3);

  for (const c of consolidation) {
    const kws = c.kws.slice(0, 10).map((k) => k.keyword);
    out.push({
      type: "cluster_consolidation",
      title: `Pillar-kandidat: "${c.cluster}"`,
      description:
        `${c.kws.length} relaterade sökord — konsolidera till en djup pillar-sida med interna länkar ` +
        `till stödartiklar.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
    markUsed(kws);
  }

  // ---- 6. Fallback: garantera minst 5 opportunities via topp-score ----
  if (out.length < 5) {
    const remaining = usable
      .filter((k) => !usedKws.has(k.keyword))
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 20);

    if (remaining.length >= 5) {
      const kws = remaining.map((k) => k.keyword);
      out.push({
        type: "high_score_underserved",
        title: "Topp-score sökord utan tydligt kluster",
        description:
          `${remaining.length} sökord med högst v2-score som inte fångas av övriga möjligheter. ` +
          `Granska manuellt — kandidater för enskilda landningssidor eller content briefs.`,
        keywords: kws,
        estimated_revenue_p50: Math.round(remaining.reduce((s, k) => s + revOf(k), 0)),
        priority: "medium",
      });
    }
  }

  return out;
}
