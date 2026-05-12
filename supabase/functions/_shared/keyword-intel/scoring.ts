// Keyword Intelligence v2 — multi-signal scoring + Bayesian revenue forecast
// Inkluderar Fix 1 (busRel ordgräns) och Fix 3 (payback per workspace_type)

export type ScoringContext = {
  workspaceType: string;
  productTerms: string[];
  serviceTerms: string[];
  materialTerms: string[];
  customerProductHints: string[];
  customerIndustries: Set<string>;
  diagFlaggedKeywords: Set<string>;
  goals?: { conversion_type?: string; aov_sek?: number; margin?: number };
};

export type RawKw = {
  keyword: string;
  cluster: string;
  dimension: string;
  intent: string;
  funnel: string;
  channel: string;
  isNegative?: boolean;
};

export type EnrichmentData = {
  vol: number | null;
  cpc: number | null;
  comp: number | null;
  kd: number | null;
  serpFeatures: string[] | null;
  topDomains: string[] | null;
  trendJson: any;
};

export type Score = {
  final: number;
  priority: "high" | "medium" | "low" | "skip";
  components: {
    demand: number;
    intent: number;
    busRel: number;
    difficulty: number;
    icp: number;
  };
  revenue: {
    p10: number;
    p50: number;
    p90: number;
    payback_weeks: number | null;
  };
};

// ---- Fix 3: content-kostnad per workspace_type ----
function contentCostByWorkspaceType(workspaceType: string): number {
  const costs: Record<string, number> = {
    b2b_manufacturer: 12000,
    b2b_service: 10000,
    d2c_brand: 6000,
    local_service: 4000,
    ecommerce: 5000,
  };
  return costs[workspaceType] || 8000;
}

// ---- Fix 1: ordgräns istället för naken includes() ----
function termMatch(term: string, text: string): boolean {
  if (!term || term.length < 3) return false;
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}`, "i").test(text);
}

function businessRelevanceScore(
  keyword: string,
  dimension: string,
  intent: string,
  ctx: ScoringContext,
): number {
  const kw = keyword.toLowerCase().trim();
  let score = 0.30;

  const allTerms = [...ctx.productTerms, ...ctx.serviceTerms, ...ctx.materialTerms]
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 3);

  if (allTerms.some((t) => termMatch(t, kw))) {
    score += 0.30;
  } else if (
    allTerms.some((t) =>
      t.length >= 5 && kw.split(" ").some((tok) => tok.startsWith(t))
    )
  ) {
    score += 0.15;
  }

  if (ctx.customerProductHints.some((h) => h.length >= 3 && termMatch(h, kw))) {
    score += 0.10;
  }

  if (ctx.goals?.conversion_type) {
    const ct = ctx.goals.conversion_type;
    if (
      (ct === "purchase" || ct === "lead") &&
      (intent === "transactional" || intent === "commercial")
    ) score += 0.15;
    if (ct === "booking" && (intent === "transactional" || /\bboka\b|\btid\b|\bmöte\b/.test(kw))) {
      score += 0.15;
    }
    if (ct === "trial" && /\bdemo\b|\btrial\b|\bprova\b|\bgratis\b/.test(kw)) {
      score += 0.15;
    }
  }

  const wtBoosts: Record<string, string[]> = {
    b2b_manufacturer: ["produkt", "material", "bransch", "use_case"],
    local_service: ["location", "tjanst"],
    d2c_brand: ["produkt", "vs_jämförelse", "konkurrent"],
    b2b_service: ["use_case", "bransch", "losning"],
    ecommerce: ["produkt", "kommersiell"],
  };
  if ((wtBoosts[ctx.workspaceType] || []).includes(dimension)) score += 0.10;

  if (
    Array.from(ctx.customerIndustries).some((ind) =>
      ind && ind.length >= 4 && termMatch(ind.split(" ")[0], kw)
    )
  ) score += 0.10;

  if (
    ctx.diagFlaggedKeywords.has(kw) ||
    ctx.diagFlaggedKeywords.has(kw.split(" ").slice(0, 2).join(" "))
  ) score -= 0.10;

  return Math.max(0, Math.min(score, 1.0));
}

// ---- Demand-signal: log-skalad volym ----
function demandScore(vol: number | null): number {
  if (vol == null || vol <= 0) return 0.05;
  // log10(10000)=4 → mappa 0..4 → 0..1
  return Math.min(1, Math.log10(vol + 1) / 4);
}

// ---- Intent-signal ----
function intentScore(intent: string): number {
  switch (intent) {
    case "transactional": return 1.0;
    case "commercial": return 0.7;
    case "navigational": return 0.4;
    case "informational": return 0.3;
    default: return 0.4;
  }
}

// ---- Difficulty: kombinerar KD + competition ----
function difficultyScore(kd: number | null, comp: number | null): number {
  if (kd != null) return Math.min(1, kd / 100);
  if (comp != null) return Math.min(1, comp);
  return 0.5;
}

// ---- ICP-signal: matchar sökord kundindustrier? ----
function icpScore(keyword: string, ctx: ScoringContext): number {
  const kw = keyword.toLowerCase();
  let s = 0.4;
  const inds = Array.from(ctx.customerIndustries);
  if (inds.some((i) => i && i.length >= 4 && termMatch(i.split(" ")[0], kw))) s += 0.3;
  if (ctx.customerProductHints.some((h) => h.length >= 3 && termMatch(h, kw))) s += 0.3;
  return Math.min(1, s);
}

// ---- CTR-kurva för position 1 utan dominerande SERP-features ----
function expectedCtr(serpFeatures: string[] | null): number {
  // Genomsnittlig CTR position 1-3 viktad ~0.20
  let baseCtr = 0.18;
  if (!serpFeatures) return baseCtr;
  // AI Overview / Featured Snippet stjäl trafik
  if (serpFeatures.some((f) => /ai_overview|featured_snippet/i.test(f))) baseCtr *= 0.55;
  if (serpFeatures.some((f) => /shopping/i.test(f))) baseCtr *= 0.75;
  if (serpFeatures.some((f) => /local_pack/i.test(f))) baseCtr *= 0.7;
  return Math.max(0.03, baseCtr);
}

// ---- Conversion rate per intent + workspace type ----
function expectedCr(intent: string, workspaceType: string): number {
  const baseByIntent: Record<string, number> = {
    transactional: 0.035,
    commercial: 0.018,
    navigational: 0.025,
    informational: 0.005,
  };
  const wtMul: Record<string, number> = {
    b2b_manufacturer: 0.6,
    b2b_service: 0.7,
    d2c_brand: 1.2,
    local_service: 1.4,
    ecommerce: 1.0,
  };
  const base = baseByIntent[intent] ?? 0.01;
  const mul = wtMul[workspaceType] ?? 1.0;
  return base * mul;
}

// ---- Bayesian-light revenue forecast (p10/p50/p90, 12 mån) ----
function forecastRevenue(
  vol: number | null,
  intent: string,
  serpFeatures: string[] | null,
  busRel: number,
  ctx: ScoringContext,
): { p10: number; p50: number; p90: number } {
  if (!vol || vol <= 0) return { p10: 0, p50: 0, p90: 0 };

  const ctr = expectedCtr(serpFeatures);
  const cr = expectedCr(intent, ctx.workspaceType);
  const aov = ctx.goals?.aov_sek || 2500;
  const margin = ctx.goals?.margin ?? 0.35;

  // busRel skalar realistisk fångst (om vi inte är relevanta för sökordet får vi inte konverteringen)
  const monthlyClicks = vol * ctr * (0.5 + 0.5 * busRel);
  const monthlyConversions = monthlyClicks * cr;
  const monthlyRevenue = monthlyConversions * aov * margin;

  const p50 = monthlyRevenue * 12;
  return {
    p10: Math.round(p50 * 0.4),
    p50: Math.round(p50),
    p90: Math.round(p50 * 1.8),
  };
}

export function scoreKeyword(
  kw: RawKw,
  e: EnrichmentData,
  ctx: ScoringContext,
): Score {
  const demand = demandScore(e.vol);
  const intent = intentScore(kw.intent);
  const busRel = businessRelevanceScore(kw.keyword, kw.dimension, kw.intent, ctx);
  const difficulty = difficultyScore(e.kd, e.comp);
  const icp = icpScore(kw.keyword, ctx);

  const final = Math.max(
    0,
    Math.min(
      1,
      0.22 * demand +
        0.18 * intent +
        0.28 * busRel +
        0.12 * icp -
        0.15 * difficulty +
        0.15, // bias så scoring sitter i 0.2-0.9-spannet
    ),
  );

  const revenue = forecastRevenue(e.vol, kw.intent, e.serpFeatures, busRel, ctx);

  // Fix 3: payback per workspace_type
  const contentCost = contentCostByWorkspaceType(ctx.workspaceType);
  const payback_weeks = revenue.p50 > 0
    ? Math.round((contentCost / (revenue.p50 / 4)) * 10) / 10
    : null;

  // Priority från final + busRel-gate (sökord under 0.4 busRel är aldrig "high")
  let priority: "high" | "medium" | "low" | "skip";
  if (busRel < 0.35) priority = "skip";
  else if (final >= 0.62 && busRel >= 0.5) priority = "high";
  else if (final >= 0.45) priority = "medium";
  else priority = "low";

  return {
    final: Math.round(final * 1000) / 1000,
    priority,
    components: {
      demand: Math.round(demand * 100) / 100,
      intent: Math.round(intent * 100) / 100,
      busRel: Math.round(busRel * 100) / 100,
      difficulty: Math.round(difficulty * 100) / 100,
      icp: Math.round(icp * 100) / 100,
    },
    revenue: { ...revenue, payback_weeks },
  };
}
