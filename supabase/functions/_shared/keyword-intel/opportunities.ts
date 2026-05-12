// Keyword Intelligence v2 — opportunity discovery
// Inkluderar Fix 2 (negative keyword filter i alla universe.filter())

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
    | "market_expansion";
  title: string;
  description: string;
  keywords: string[];
  estimated_revenue_p50?: number;
  priority: "high" | "medium" | "low";
};

// Fix 2: gemensamt filter mot negativa sökord
const isUsable = (kw: ScoredKw) => !kw.isNegative && kw.priority !== "skip";

export function discoverOpportunities(universe: ScoredKw[]): Opportunity[] {
  const out: Opportunity[] = [];

  // 1. quick_dominance: kommersiella sökord med låg KD och konkurrentgap
  const quickWins = universe
    .filter((kw) =>
      isUsable(kw) &&
      (kw.intent === "transactional" || kw.intent === "commercial") &&
      (kw.searchVolume || 0) >= 50 &&
      (kw.kd == null || kw.kd < 35) &&
      kw.competitorGap
    )
    .sort((a, b) => (b.score?.revenue.p50 || 0) - (a.score?.revenue.p50 || 0))
    .slice(0, 8);

  if (quickWins.length >= 3) {
    out.push({
      type: "quick_dominance",
      title: "Snabbvinster: låg konkurrens + konkurrenter rankar inte",
      description:
        `${quickWins.length} kommersiella sökord där KD är låg och dina konkurrenter saknas i topp 10. ` +
        `Bygg landningssidor här först.`,
      keywords: quickWins.map((k) => k.keyword),
      estimated_revenue_p50: Math.round(
        quickWins.reduce((s, k) => s + (k.score?.revenue.p50 || 0), 0),
      ),
      priority: "high",
    });
  }

  // 2. service_gap: kluster där flera kommersiella sökord finns men dimension är obetjänad
  const byCluster = new Map<string, ScoredKw[]>();
  for (const kw of universe) {
    if (!isUsable(kw)) continue;
    if (!byCluster.has(kw.cluster)) byCluster.set(kw.cluster, []);
    byCluster.get(kw.cluster)!.push(kw);
  }
  const serviceGaps = [...byCluster.entries()]
    .filter(([_, kws]) =>
      kws.length >= 3 &&
      kws.every((k) => k.competitorGap) &&
      kws.some((k) =>
        k.intent === "commercial" || k.intent === "transactional"
      )
    )
    .slice(0, 5);

  for (const [cluster, kws] of serviceGaps) {
    out.push({
      type: "service_gap",
      title: `Tjänstgap: "${cluster}"`,
      description:
        `${kws.length} sökord i klustret "${cluster}" där ingen av dina konkurrenter rankar. ` +
        `Outsidern-läge — bygg en hub-sida.`,
      keywords: kws.slice(0, 10).map((k) => k.keyword),
      estimated_revenue_p50: Math.round(
        kws.reduce((s, k) => s + (k.score?.revenue.p50 || 0), 0),
      ),
      priority: "high",
    });
  }

  // 3. striking_distance_cluster: medium-priority kluster med hög aggregerad volym
  const strikingDistance = [...byCluster.entries()]
    .filter(([_, kws]) => {
      if (!kws.some(isUsable)) return false;
      const totalVol = kws.reduce((s, k) => s + (k.searchVolume || 0), 0);
      return totalVol >= 500 && kws.some((k) => k.priority === "medium");
    })
    .sort((a, b) => {
      const vA = a[1].reduce((s, k) => s + (k.searchVolume || 0), 0);
      const vB = b[1].reduce((s, k) => s + (k.searchVolume || 0), 0);
      return vB - vA;
    })
    .slice(0, 4);

  for (const [cluster, kws] of strikingDistance) {
    const totalVol = kws.reduce((s, k) => s + (k.searchVolume || 0), 0);
    out.push({
      type: "striking_distance_cluster",
      title: `Räckhåll: "${cluster}"`,
      description:
        `${kws.length} sökord, total månadsvolym ${totalVol.toLocaleString("sv-SE")}. ` +
        `Med en konsoliderad pillar-sida kan du fånga hela klustret.`,
      keywords: kws.slice(0, 10).map((k) => k.keyword),
      estimated_revenue_p50: Math.round(
        kws.reduce((s, k) => s + (k.score?.revenue.p50 || 0), 0),
      ),
      priority: "medium",
    });
  }

  // 4. geo_opportunity: location-dimension med flera obetjänade städer
  const geoKws = universe.filter(
    (kw) => isUsable(kw) && kw.dimension === "location" && kw.competitorGap,
  );
  if (geoKws.length >= 5) {
    out.push({
      type: "geo_opportunity",
      title: "Geo-expansion: städer utan lokal konkurrent",
      description:
        `${geoKws.length} lokal-sökord där ingen konkurrent dominerar. ` +
        `Bygg location-pages med GBP-koppling.`,
      keywords: geoKws.slice(0, 12).map((k) => k.keyword),
      estimated_revenue_p50: Math.round(
        geoKws.reduce((s, k) => s + (k.score?.revenue.p50 || 0), 0),
      ),
      priority: "medium",
    });
  }

  return out;
}
