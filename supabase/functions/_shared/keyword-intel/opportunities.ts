// Keyword Intelligence v2 — opportunity discovery (adaptive thresholds + Ads context)
// Trösklar härleds från universumets egna distribution (percentiler) istället för
// hårdkodade värden. När adsContext finns läggs Ads-action-typer till på toppen.

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

// ----- Ads-context shapes (best-effort, alla fält optional) -----
export type AdsDiagnosis = {
  rule_id?: string;
  severity?: string;
  title?: string;
  what_happens?: string;
  scope_ref?: Array<{ id?: string; name?: string }>;
  expected_impact?: { mid?: number; metric?: string; direction?: string };
};
export type AuctionCampaign = {
  id?: string;
  name?: string;
  cost?: number;
  conversions?: number;
  impressionShare?: number;
  lostBudget?: number;
  lostRank?: number;
};
export type AuctionCompetitor = { domain?: string; impressionShare?: number };
export type AdsContext = {
  diagnoses?: AdsDiagnosis[];
  campaigns?: AuctionCampaign[];
  competitors?: AuctionCompetitor[];
};

export type Opportunity = {
  type:
    | "quick_dominance"
    | "service_gap"
    | "striking_distance_cluster"
    | "geo_opportunity"
    | "market_expansion"
    | "high_score_underserved"
    | "cluster_consolidation"
    // Ads action types
    | "account_gap"
    | "adgroup_candidate"
    | "negative_candidate"
    | "scalable_winner";
  title: string;
  description: string;
  keywords: string[];
  estimated_revenue_p50?: number;
  priority: "high" | "medium" | "low";
  // Ads-extras
  scope?: { campaign_id?: string; campaign_name?: string };
  action_label?: string;
};

const isUsable = (kw: ScoredKw) => !kw.isNegative && kw.priority !== "skip";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}
const scoreOf = (kw: ScoredKw) => kw.score?.final ?? 0;
const revOf = (kw: ScoredKw) => kw.score?.revenue?.p50 ?? 0;

export function discoverOpportunities(
  universe: ScoredKw[],
  adsContext: AdsContext | null = null,
): Opportunity[] {
  const out: Opportunity[] = [];
  const usable = universe.filter(isUsable);
  if (usable.length === 0) return out;

  // ---- Adaptiva trösklar ----
  const kds = usable.map((k) => k.kd).filter((v): v is number => v != null).sort((a, b) => a - b);
  const vols = usable.map((k) => k.searchVolume ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  const scores = usable.map(scoreOf).sort((a, b) => a - b);

  const kdP25 = percentile(kds, 25);
  const volP50 = percentile(vols, 50);
  const scoreP50 = percentile(scores, 50);
  const scoreP75 = percentile(scores, 75);
  const scoreP90 = percentile(scores, 90);

  const usedKws = new Set<string>();
  const markUsed = (kws: string[]) => kws.forEach((k) => usedKws.add(k));

  // ============================================================
  //  ADS ACTION OPPORTUNITIES (visas först, kräver adsContext)
  // ============================================================
  if (adsContext) {
    // --- negative_candidate: wasted_keyword_no_conversions ---
    const wasted = (adsContext.diagnoses || []).filter(
      (d) => d.rule_id === "wasted_keyword_no_conversions",
    );
    if (wasted.length > 0) {
      const kws = wasted
        .map((d) => d.scope_ref?.[d.scope_ref.length - 1]?.name)
        .filter((n): n is string => !!n)
        .slice(0, 20);
      const totalSpend = wasted.reduce((s, d) => s + (d.expected_impact?.mid || 0), 0);
      if (kws.length > 0) {
        out.push({
          type: "negative_candidate",
          title: `Negativa: ${kws.length} sökord spenderar utan konvertering`,
          description:
            `${kws.length} sökord har ackumulerat spend utan konv senaste 30 dagar. ` +
            `Totalt ~${Math.round(totalSpend).toLocaleString("sv-SE")} kr — pausa eller lägg som account-negativa.`,
          keywords: kws,
          estimated_revenue_p50: Math.round(totalSpend),
          priority: "high",
          action_label: "Lägg till som negativ",
        });
      }
    }

    // --- scalable_winner: daily_budget_starved ELLER kampanj med lostBudget>10% & conversions>0 ---
    const starved = (adsContext.diagnoses || []).filter((d) => d.rule_id === "daily_budget_starved");
    const budgetCampaigns = new Map<string, { name: string; lostBudget: number; conversions: number }>();
    for (const d of starved) {
      const ref = d.scope_ref?.[0];
      if (ref?.id) budgetCampaigns.set(ref.id, { name: ref.name || ref.id, lostBudget: 0, conversions: 0 });
    }
    for (const c of adsContext.campaigns || []) {
      if (!c.id) continue;
      if ((c.lostBudget || 0) > 0.10 && (c.conversions || 0) > 0) {
        budgetCampaigns.set(c.id, {
          name: c.name || c.id,
          lostBudget: c.lostBudget || 0,
          conversions: c.conversions || 0,
        });
      } else if (budgetCampaigns.has(c.id)) {
        budgetCampaigns.set(c.id, {
          name: c.name || c.id,
          lostBudget: c.lostBudget || 0,
          conversions: c.conversions || 0,
        });
      }
    }
    for (const [id, c] of budgetCampaigns) {
      out.push({
        type: "scalable_winner",
        title: `Skalbar vinnare: "${c.name}"`,
        description:
          `Kampanjen tappar ${Math.round(c.lostBudget * 100)}% impression share pga budget ` +
          `och har ${c.conversions ? c.conversions.toFixed(1) : "?"} konv. Höj budget för att fånga tappade visningar.`,
        keywords: [],
        priority: "high",
        scope: { campaign_id: id, campaign_name: c.name },
        action_label: "Höj budget",
      });
    }

    // --- account_gap: konkurrenter med hög impression-share (om data finns) ---
    const competitors = (adsContext.competitors || []).filter(
      (c) => c.domain && (c.impressionShare || 0) >= 0.30,
    );
    if (competitors.length > 0) {
      out.push({
        type: "account_gap",
        title: `Konto-gap: ${competitors.length} konkurrenter dominerar auktionen`,
        description:
          `Konkurrenter med ≥30% impression share: ${competitors.map((c) => c.domain).join(", ")}. ` +
          `Granska deras annonser och bygg täckande annonsgrupper.`,
        keywords: [],
        priority: "medium",
        action_label: "Analysera konkurrent",
      });
    }
  }

  // ---- Klusteraggregat (används av flera typer) ----
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

  // --- adgroup_candidate (Ads): kluster ≥5 kw, samma intent, hög avgScore ---
  if (adsContext) {
    const candidates = clusterStats
      .filter((c) => c.kws.length >= 5 && c.avgScore >= scoreP50)
      .map((c) => {
        const intentCounts = new Map<string, number>();
        for (const k of c.kws) intentCounts.set(k.intent, (intentCounts.get(k.intent) || 0) + 1);
        const dominant = [...intentCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        return { ...c, dominantIntent: dominant?.[0] || "commercial", intentShare: (dominant?.[1] || 0) / c.kws.length };
      })
      .filter((c) => c.intentShare >= 0.6 && (c.dominantIntent === "commercial" || c.dominantIntent === "transactional"))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 4);

    for (const c of candidates) {
      const kws = c.kws.slice(0, 15).map((k) => k.keyword);
      out.push({
        type: "adgroup_candidate",
        title: `Annonsgrupp-kandidat: "${c.cluster}"`,
        description:
          `${c.kws.length} sökord (${Math.round(c.intentShare * 100)}% ${c.dominantIntent}) ` +
          `redo som ny annonsgrupp. Föreslagen uppdelning: top-3 som [Exakt], övriga som [Fras].`,
        keywords: kws,
        estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
        priority: "high",
        action_label: "Skapa annonsgrupp",
      });
      markUsed(kws);
    }
  }

  // ============================================================
  //  STRATEGISKA (SEO) OPPORTUNITIES
  // ============================================================

  // ---- 1. quick_dominance ----
  const quickWins = usable
    .filter(
      (kw) =>
        scoreOf(kw) >= scoreP90 &&
        (kw.intent === "transactional" || kw.intent === "commercial") &&
        (kw.competitorGap || (kw.kd != null && kw.kd <= kdP25)),
    )
    .sort((a, b) => revOf(b) - revOf(a))
    .slice(0, 8);

  if (quickWins.length >= 3) {
    const kws = quickWins.map((k) => k.keyword);
    out.push({
      type: "quick_dominance",
      title: "Snabbvinster: topp-score + låg konkurrens",
      description: `${quickWins.length} kommersiella sökord i toppen av v2-scoringen där KD är låg relativt din nisch eller konkurrenterna saknas i topp 10.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(quickWins.reduce((s, k) => s + revOf(k), 0)),
      priority: "high",
    });
    markUsed(kws);
  }

  // ---- 2. service_gap ----
  const serviceGaps = clusterStats
    .filter(
      (c) =>
        c.kws.length >= 3 &&
        c.avgScore >= scoreP75 &&
        c.gapShare >= 0.6 &&
        c.kws.some((k) => k.intent === "commercial" || k.intent === "transactional"),
    )
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  for (const c of serviceGaps) {
    const kws = c.kws.slice(0, 10).map((k) => k.keyword);
    if (kws.every((k) => usedKws.has(k))) continue;
    out.push({
      type: "service_gap",
      title: `Tjänstgap: "${c.cluster}"`,
      description: `${c.kws.length} sökord där ${Math.round(c.gapShare * 100)}% saknar dina konkurrenter i topp 10. Bygg en hub-sida.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
      priority: "high",
    });
    markUsed(kws);
  }

  // ---- 3. striking_distance_cluster ----
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
      description: `${c.kws.length} sökord, total månadsvolym ${c.totalVol.toLocaleString("sv-SE")}. Pillar-sida fångar hela klustret.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
    markUsed(kws);
  }

  // ---- 4. geo_opportunity ----
  const geoKws = usable
    .filter((kw) => kw.dimension === "location" && scoreOf(kw) >= scoreP50)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 12);
  if (geoKws.length >= 5) {
    const kws = geoKws.map((k) => k.keyword);
    out.push({
      type: "geo_opportunity",
      title: "Geo-expansion: städer värd lokal närvaro",
      description: `${geoKws.length} lokal-sökord med stark v2-score. Bygg location-pages med GBP-koppling.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(geoKws.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
    markUsed(kws);
  }

  // ---- 5. cluster_consolidation ----
  const consolidation = clusterStats
    .filter((c) => c.kws.length >= 5 && c.avgScore >= scoreP50 && !c.kws.every((k) => usedKws.has(k.keyword)))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3);
  for (const c of consolidation) {
    const kws = c.kws.slice(0, 10).map((k) => k.keyword);
    out.push({
      type: "cluster_consolidation",
      title: `Pillar-kandidat: "${c.cluster}"`,
      description: `${c.kws.length} relaterade sökord — konsolidera till en djup pillar-sida.`,
      keywords: kws,
      estimated_revenue_p50: Math.round(c.kws.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
    markUsed(kws);
  }

  // ---- 6. high_score_underserved (soft floor: < 3 → sänk till p75) ----
  const seoCount = out.filter((o) =>
    !["account_gap", "adgroup_candidate", "negative_candidate", "scalable_winner"].includes(o.type),
  ).length;
  const threshold = seoCount < 3 && usable.length >= 50 ? scoreP75 : scoreP90;
  const underserved = usable
    .filter((k) => !usedKws.has(k.keyword) && scoreOf(k) >= threshold)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 15);
  if (underserved.length >= 5) {
    out.push({
      type: "high_score_underserved",
      title: "Topp-score sökord utan tydligt kluster",
      description: `${underserved.length} sökord med högst v2-score som inte fångas av övriga möjligheter. Granska manuellt.`,
      keywords: underserved.map((k) => k.keyword),
      estimated_revenue_p50: Math.round(underserved.reduce((s, k) => s + revOf(k), 0)),
      priority: "medium",
    });
  }

  return out;
}
