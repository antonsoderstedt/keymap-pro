// Pure SERP competitiveness assessment.
//
// Inputs come from cached SERP / metrics signals; no I/O here.
// Output: serp_competitiveness 0..1 (higher = harder), commoditization_score 0..1
// (higher = more shopping/aggregator/marketplace presence).

import { REASON_CODES, type ReasonCode } from "./constants.ts";

export interface SerpInputs {
  // Difficulty as 0..100 (Semrush KD scale). Optional.
  keyword_difficulty?: number | null;
  // Google Ads competition 0..1. Optional.
  competition?: number | null;
  // SERP feature flags from cache (lowercased).
  serp_features?: string[] | null;
  // Top-ranking domains (lowercased, no protocol).
  top_domains?: string[] | null;
  // Operator-provided own + competitor domains.
  own_domains?: readonly string[];
}

export interface SerpAssessment {
  serp_competitiveness: number;  // 0..1
  commoditization_score: number; // 0..1
  reason_codes: ReasonCode[];
  coverage: number;              // 0..1 — how many of the 4 signals were present
}

const COMMODITIZED_FEATURES = new Set([
  "shopping_pack", "shopping", "popular_products", "product_carousel",
  "google_shopping", "marketplace",
]);

const AGGREGATOR_FRAGMENTS = [
  "prisjakt", "pricerunner", "amazon", "ebay", "tradera",
  "blocket", "alibaba", "google.com/shopping",
];

export function assessSerp(inputs: SerpInputs): SerpAssessment {
  const reasons: ReasonCode[] = [];
  let signalCount = 0;
  let presentCount = 0;

  // 1. KD signal
  signalCount++;
  let kdNorm: number | null = null;
  if (typeof inputs.keyword_difficulty === "number") {
    presentCount++;
    kdNorm = clamp01(inputs.keyword_difficulty / 100);
    if (kdNorm >= 0.7) reasons.push(REASON_CODES.SERP_KD_HIGH);
    else if (kdNorm >= 0.4) reasons.push(REASON_CODES.SERP_KD_MEDIUM);
    else reasons.push(REASON_CODES.SERP_KD_LOW);
  }

  // 2. Ads competition signal
  signalCount++;
  let compNorm: number | null = null;
  if (typeof inputs.competition === "number") {
    presentCount++;
    compNorm = clamp01(inputs.competition);
  }

  // 3. SERP features → both competitiveness & commoditization
  signalCount++;
  const features = (inputs.serp_features ?? []).map((f) => f.toLowerCase());
  let commodFeatureScore = 0;
  if (features.length > 0) {
    presentCount++;
    const matched = features.filter((f) => COMMODITIZED_FEATURES.has(f));
    if (matched.length > 0) {
      commodFeatureScore = clamp01(matched.length / 3);
      reasons.push(REASON_CODES.SERP_COMMODITIZED_FEATURES);
    }
  }

  // 4. Top domains → niche vs aggregator
  signalCount++;
  const topDomains = (inputs.top_domains ?? []).map((d) => d.toLowerCase());
  let aggregatorRatio = 0;
  let nicheBoost = 0;
  if (topDomains.length > 0) {
    presentCount++;
    const aggregatorHits = topDomains.filter((d) =>
      AGGREGATOR_FRAGMENTS.some((frag) => d.includes(frag))
    ).length;
    aggregatorRatio = aggregatorHits / topDomains.length;

    const ownSet = new Set((inputs.own_domains ?? []).map((d) => d.toLowerCase()));
    const nicheLike = topDomains.filter((d) =>
      !AGGREGATOR_FRAGMENTS.some((f) => d.includes(f)) && !ownSet.has(d)
    ).length;
    nicheBoost = nicheLike / topDomains.length;
    if (nicheBoost >= 0.6) reasons.push(REASON_CODES.SERP_NICHE_DOMAINS);
  }

  if (presentCount === 0) {
    reasons.push(REASON_CODES.SERP_NO_DATA);
    return {
      serp_competitiveness: 0.5,
      commoditization_score: 0.3,
      reason_codes: reasons,
      coverage: 0,
    };
  }

  // Weighted blend across the signals that are present.
  const parts: { value: number; weight: number }[] = [];
  if (kdNorm !== null) parts.push({ value: kdNorm, weight: 0.5 });
  if (compNorm !== null) parts.push({ value: compNorm, weight: 0.2 });
  if (features.length > 0) parts.push({ value: clamp01(features.length / 5), weight: 0.15 });
  if (topDomains.length > 0) parts.push({ value: clamp01(aggregatorRatio * 0.8 + nicheBoost * 0.4), weight: 0.15 });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const serp_competitiveness = clamp01(
    parts.reduce((a, p) => a + p.value * p.weight, 0) / (totalWeight || 1)
  );

  const commoditization_score = clamp01(
    0.6 * commodFeatureScore + 0.4 * aggregatorRatio
  );

  return {
    serp_competitiveness,
    commoditization_score,
    reason_codes: reasons,
    coverage: presentCount / signalCount,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
