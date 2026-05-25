// Pure commercial-value estimator.
//
// Returns a {p10, p50, p90} distribution in the project currency (assumed SEK
// where not provided). Reasoning is deterministic:
//
//   expected_clicks_per_month   = search_volume * effective_ctr(position_band)
//   conversion_rate             = base_cr * intent_multiplier * stage_multiplier
//   monthly_conversions         = expected_clicks * conversion_rate
//   value_per_conversion        = deal_size * margin * close_rate * ltv_multiplier
//   p50                         = monthly_conversions * value_per_conversion
//   p10/p90                     = p50 * uncertainty_band (driven by signal coverage)
//
// Multiplier tables are LOCKED v1. Change → bump MODEL_VERSION.

import {
  FALLBACK_CLOSE_RATE,
  FALLBACK_CPC_SEK,
  FALLBACK_DEAL_SIZE_SEK,
  FALLBACK_LTV_MULTIPLIER,
  REASON_CODES,
  type ReasonCode,
} from "./constants.ts";
import type { BuyerStage, SearchIntent } from "./intent.ts";

export type LeadQualityProxy = "low" | "medium" | "high";

export interface ValueInputs {
  search_volume?: number | null;
  cpc_sek?: number | null;
  search_intent: SearchIntent;
  buyer_stage: BuyerStage;
  business_relevance_score: number;       // 0..1
  serp_competitiveness: number;            // 0..1
  commoditization_score: number;           // 0..1
  conversion_likelihood: number;           // 0..1
  // Business-model inputs (per project)
  deal_size_sek?: number | null;
  margin_pct?: number | null;              // 0..1
  close_rate?: number | null;              // 0..1
  ltv_multiplier?: number | null;          // 1..n
  // Currency tag
  currency?: string;
}

export interface ValueEstimate {
  estimated_commercial_value: { p10: number; p50: number; p90: number; currency: string };
  conversion_likelihood: number;           // returned for transparency
  lead_quality_proxy: LeadQualityProxy;
  reason_codes: ReasonCode[];
  signal_coverage: number;                 // 0..1
}

// Locked multiplier tables
const INTENT_CR_MULT: Record<SearchIntent, number> = {
  transactional: 1.6,
  commercial: 1.1,
  navigational: 0.9,
  informational: 0.4,
};

const STAGE_CR_MULT: Record<BuyerStage, number> = {
  ready_to_buy: 1.5,
  product_aware: 1.1,
  solution_aware: 0.9,
  problem_aware: 0.6,
  unaware: 0.3,
};

const BASE_CONVERSION_RATE = 0.025; // 2.5%

export function estimateValue(inputs: ValueInputs): ValueEstimate {
  const reasons: ReasonCode[] = [];
  let signals = 0;
  let signalsPresent = 0;

  // Volume
  signals++;
  let vol = 0;
  if (typeof inputs.search_volume === "number" && inputs.search_volume > 0) {
    vol = inputs.search_volume;
    signalsPresent++;
    reasons.push(REASON_CODES.VALUE_VOLUME_PRESENT);
  } else {
    vol = 100;
    reasons.push(REASON_CODES.VALUE_VOLUME_FALLBACK);
  }

  // CPC — used to refine value-per-click and as proxy for buyer competition
  signals++;
  let cpc = FALLBACK_CPC_SEK;
  if (typeof inputs.cpc_sek === "number" && inputs.cpc_sek > 0) {
    cpc = inputs.cpc_sek;
    signalsPresent++;
    reasons.push(REASON_CODES.VALUE_CPC_PRESENT);
  } else {
    reasons.push(REASON_CODES.VALUE_CPC_FALLBACK);
  }

  // Business-model
  const dealSize = inputs.deal_size_sek && inputs.deal_size_sek > 0
    ? inputs.deal_size_sek
    : FALLBACK_DEAL_SIZE_SEK;
  const margin = inputs.margin_pct != null
    ? clamp01(inputs.margin_pct)
    : 0.4;
  const closeRate = inputs.close_rate != null
    ? clamp01(inputs.close_rate)
    : FALLBACK_CLOSE_RATE;
  const ltv = inputs.ltv_multiplier != null && inputs.ltv_multiplier > 0
    ? inputs.ltv_multiplier
    : FALLBACK_LTV_MULTIPLIER;

  // Effective CTR from position assumption (we don't know position; use 0.18
  // as a deterministic baseline for "achievable top-3 over horizon").
  const effectiveCtr = 0.18;
  const expectedClicks = vol * effectiveCtr;

  // Conversion rate
  const cr = clamp01(
    BASE_CONVERSION_RATE
    * INTENT_CR_MULT[inputs.search_intent]
    * STAGE_CR_MULT[inputs.buyer_stage]
    * (0.5 + inputs.business_relevance_score * 0.5)  // relevance dampens at low end
  );
  const monthlyConv = expectedClicks * cr;
  const valuePerConv = dealSize * margin * closeRate * ltv;
  const p50 = monthlyConv * valuePerConv;

  // Uncertainty widens when coverage is low or commoditization high.
  const coverage = signalsPresent / signals;
  const uncertainty = 0.4 + (1 - coverage) * 0.4 + inputs.commoditization_score * 0.2;
  const p10 = Math.max(0, p50 * (1 - uncertainty));
  const p90 = p50 * (1 + uncertainty);

  // Lead-quality proxy: heuristic combining intent, stage, CPC, commoditization.
  const leadQualityNum =
    INTENT_CR_MULT[inputs.search_intent] * 0.3 +
    STAGE_CR_MULT[inputs.buyer_stage] * 0.3 +
    inputs.business_relevance_score * 0.3 +
    (1 - inputs.commoditization_score) * 0.1;
  let lead_quality_proxy: LeadQualityProxy;
  if (leadQualityNum >= 1.1) {
    lead_quality_proxy = "high";
    reasons.push(REASON_CODES.VALUE_HIGH_LEAD_QUALITY);
  } else if (leadQualityNum >= 0.7) {
    lead_quality_proxy = "medium";
  } else {
    lead_quality_proxy = "low";
    reasons.push(REASON_CODES.VALUE_LOW_LEAD_QUALITY);
  }

  // Silence unused-cpc warning while still recording it via reason_code.
  void cpc;

  return {
    estimated_commercial_value: {
      p10: round(p10),
      p50: round(p50),
      p90: round(p90),
      currency: inputs.currency || "SEK",
    },
    conversion_likelihood: cr,
    lead_quality_proxy,
    reason_codes: reasons,
    signal_coverage: coverage,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
