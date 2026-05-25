// -----------------------------------------------------------------------------
// Component scorers — 10 pure functions. Each returns:
//   { raw: 0..1, reason_codes: string[], supporting_signals: EvidenceRef[] }
//
// PURE: no I/O, no Deno, no embeddings calls, no LLM. Deterministic for a
// given input.
//
// Components without sufficient signal return NEUTRAL_RAW (0.5) with
// RC_INSUFFICIENT_SIGNAL — never throw, never guess.
// -----------------------------------------------------------------------------

import {
  LEAD_QUALITY_CONVERSION_MULT,
  NEUTRAL_RAW,
  type LeadQualityTarget,
  type ScoreComponentName,
} from "./constants.ts";

// -----------------------------------------------------------------------------
// Local minimal type shapes (kept independent from src/lib/types.ts so the
// _shared module can be tested without bundling the React app types).
// -----------------------------------------------------------------------------

export interface EvidenceRefLite {
  id: string;
  source: string;
  source_id?: string;
  observed_at?: string;
  freshness_days?: number;
}

export interface ValueDistributionLite {
  p10: number;
  p50: number;
  p90: number;
  currency: string;
}

export interface IntelligenceVerdictLite {
  keyword: string;
  normalized_keyword: string;
  search_intent: string;
  buyer_stage: string;
  commercial_intent_score: number;
  business_relevance_score: number;
  conversion_likelihood: number;
  serp_competitiveness: number;
  commoditization_score: number;
  estimated_commercial_value: ValueDistributionLite;
  evidence?: EvidenceRefLite[];
  signal_coverage?: number; // 0..1 if available
}

export type FulfillmentCapacity =
  | "unconstrained"
  | "constrained"
  | "at_capacity"
  | "suspended";

export type StrategicImportance =
  | "core"
  | "growth"
  | "defensive"
  | "exploratory";

export interface ProjectBusinessModelLite {
  workspace_profile: string;
  aggressiveness_profile: string;
  lead_quality_target: LeadQualityTarget;
  service_priority?: Record<string, number>;
  service_margin_pct?: Record<string, number>;
  close_rate_est?: Record<string, number>;
  fulfillment_capacity?: Record<string, FulfillmentCapacity>;
  strategic_importance?: Record<string, StrategicImportance>;
}

export interface OutcomeLearningLite {
  cluster_family: string;
  suggested_acquisition_approach: string;
  action_category: string;
  n: number;
  mean_uplift_pct?: number;
  variance?: number;
}

export interface ScoreInput {
  scope_kind: "keyword" | "cluster" | "opportunity";
  scope_id: string;
  verdict: IntelligenceVerdictLite;
  business_model: ProjectBusinessModelLite;
  // Optional mapping from the keyword/cluster to a service id (resolved by the
  // worker; the pure scorer doesn't infer it).
  mapped_service_id?: string;
  // Optional theme id (resolved by the worker).
  mapped_theme_id?: string;
  // Optional landing-page fit (0..1) supplied by an external matcher.
  // null/undefined => neutral fallback.
  landing_page_fit?: number | null;
  landing_page_evidence?: EvidenceRefLite[];
  // SERP top-domain quality (0..1). 1 = strong known brands; 0 = weak/thin.
  competition_quality?: number | null;
  competition_evidence?: EvidenceRefLite[];
  // Outcome learnings matching this scope's (cluster_family, approach).
  matching_learnings?: OutcomeLearningLite[];
}

export interface ComponentResult {
  component: ScoreComponentName;
  raw: number;
  reason_codes: string[];
  supporting_signals: EvidenceRefLite[];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function verdictEvidence(v: IntelligenceVerdictLite): EvidenceRefLite[] {
  return v.evidence ?? [];
}

// -----------------------------------------------------------------------------
// 1. buyer_intent — from verdict.commercial_intent_score
// -----------------------------------------------------------------------------

export function scoreBuyerIntent(input: ScoreInput): ComponentResult {
  const v = input.verdict;
  const raw = clamp01(v.commercial_intent_score);
  const codes: string[] = [];
  if (raw >= 0.7) codes.push("RC_HIGH_BUYER_INTENT");
  else if (raw >= 0.4) codes.push("RC_MID_BUYER_INTENT");
  else codes.push("RC_LOW_BUYER_INTENT");
  return {
    component: "buyer_intent",
    raw,
    reason_codes: codes,
    supporting_signals: verdictEvidence(v),
  };
}

// -----------------------------------------------------------------------------
// 2. business_fit — combines verdict.business_relevance_score with the mapped
//    service's service_priority. If no mapping, use relevance alone with a
//    lower confidence reason.
// -----------------------------------------------------------------------------

export function scoreBusinessFit(input: ScoreInput): ComponentResult {
  const relevance = clamp01(input.verdict.business_relevance_score);
  const sid = input.mapped_service_id;
  const priority = sid
    ? clamp01(input.business_model.service_priority?.[sid] ?? 0.5)
    : null;

  const codes: string[] = [];
  let raw: number;
  if (priority === null) {
    raw = relevance;
    codes.push("RC_NO_SERVICE_MAPPING");
  } else {
    // 60% relevance / 40% priority
    raw = clamp01(relevance * 0.6 + priority * 0.4);
    if (priority >= 0.7) codes.push("RC_SERVICE_PRIORITY_HIGH");
    else if (priority <= 0.3) codes.push("RC_SERVICE_PRIORITY_LOW");
    else codes.push("RC_SERVICE_PRIORITY_MID");
  }

  return {
    component: "business_fit",
    raw,
    reason_codes: codes,
    supporting_signals: verdictEvidence(input.verdict),
  };
}

// -----------------------------------------------------------------------------
// 3. conversion_likelihood — verdict.conversion_likelihood, biased by
//    lead_quality_target. Lead-quality bias is recorded as a reason code.
// -----------------------------------------------------------------------------

export function scoreConversionLikelihood(input: ScoreInput): ComponentResult {
  const base = clamp01(input.verdict.conversion_likelihood);
  const mult = LEAD_QUALITY_CONVERSION_MULT[input.business_model.lead_quality_target] ?? 1.0;
  const raw = clamp01(base * mult);
  const codes: string[] = [];
  if (raw >= 0.6) codes.push("RC_HIGH_CONVERSION_LIKELIHOOD");
  else if (raw <= 0.3) codes.push("RC_LOW_CONVERSION_LIKELIHOOD");
  else codes.push("RC_MID_CONVERSION_LIKELIHOOD");
  if (mult !== 1.0) codes.push("RC_LEAD_QUALITY_BIAS");
  return {
    component: "conversion_likelihood",
    raw,
    reason_codes: codes,
    supporting_signals: verdictEvidence(input.verdict),
  };
}

// -----------------------------------------------------------------------------
// 4. serp_weakness — inverse of verdict.serp_competitiveness, with a
//    commoditization penalty (commoditized SERPs are not "weak" — they're
//    saturated with aggregators).
// -----------------------------------------------------------------------------

export function scoreSerpWeakness(input: ScoreInput): ComponentResult {
  const comp = clamp01(input.verdict.serp_competitiveness);
  const commod = clamp01(input.verdict.commoditization_score);
  // weakness = 1 - competitiveness, then dampened by commoditization
  const raw = clamp01((1 - comp) * (1 - 0.5 * commod));
  const codes: string[] = [];
  if (commod >= 0.6) codes.push("RC_SERP_COMMODITIZED");
  if (comp >= 0.7) codes.push("RC_SERP_STRONG");
  else if (comp <= 0.3) codes.push("RC_SERP_WEAK");
  else codes.push("RC_SERP_NEUTRAL");
  return {
    component: "serp_weakness",
    raw,
    reason_codes: codes,
    supporting_signals: verdictEvidence(input.verdict),
  };
}

// -----------------------------------------------------------------------------
// 5. commercial_value — from verdict.estimated_commercial_value.
//    Map p50 to 0..1 via a saturating curve: raw = p50 / (p50 + p50_pivot),
//    where pivot depends on profile-typical deal size proxy. Width penalty if
//    p10/p90 spread is large.
// -----------------------------------------------------------------------------

export function scoreCommercialValue(input: ScoreInput): ComponentResult {
  const ev = input.verdict.estimated_commercial_value;
  const p10 = Math.max(0, ev?.p10 ?? 0);
  const p50 = Math.max(0, ev?.p50 ?? 0);
  const p90 = Math.max(0, ev?.p90 ?? 0);

  // Pivot at 500 (currency-agnostic; relative). Tweaks require MODEL_VERSION bump.
  const PIVOT = 500;
  const valueRaw = p50 / (p50 + PIVOT);

  // Spread penalty: if p90-p10 > 4*p50 the band is "wide".
  const spread = p90 - p10;
  const wide = p50 > 0 && spread > 4 * p50;
  const raw = clamp01(wide ? valueRaw * 0.85 : valueRaw);

  const codes: string[] = [];
  if (raw >= 0.6) codes.push("RC_HIGH_VALUE_P50");
  else if (raw <= 0.2) codes.push("RC_LOW_VALUE_P50");
  else codes.push("RC_MID_VALUE_P50");
  if (wide) codes.push("RC_VALUE_UNCERTAINTY_WIDE");

  return {
    component: "commercial_value",
    raw,
    reason_codes: codes,
    supporting_signals: verdictEvidence(input.verdict),
  };
}

// -----------------------------------------------------------------------------
// 6. historical_performance — from outcome_learnings.
//    Only entries with n >= 1 are considered for the *signal*; the bounded
//    learning_adjustment (applied separately) requires n >= LEARNING_MIN_N.
//    Here we only emit a soft component value 0..1 from mean_uplift_pct.
// -----------------------------------------------------------------------------

export function scoreHistoricalPerformance(input: ScoreInput): ComponentResult {
  const learnings = input.matching_learnings ?? [];
  if (learnings.length === 0) {
    return {
      component: "historical_performance",
      raw: NEUTRAL_RAW,
      reason_codes: ["RC_HISTORICAL_INSUFFICIENT", "RC_INSUFFICIENT_SIGNAL"],
      supporting_signals: [],
    };
  }

  // Weighted average uplift by n.
  let totalN = 0;
  let weightedSum = 0;
  for (const l of learnings) {
    if (typeof l.mean_uplift_pct === "number") {
      totalN += l.n;
      weightedSum += l.mean_uplift_pct * l.n;
    }
  }
  if (totalN === 0) {
    return {
      component: "historical_performance",
      raw: NEUTRAL_RAW,
      reason_codes: ["RC_HISTORICAL_NEUTRAL"],
      supporting_signals: [],
    };
  }
  const avgUplift = weightedSum / totalN;

  // Map -50%..+50% uplift to 0..1; saturating outside.
  const raw = clamp01(0.5 + avgUplift / 100);
  const codes: string[] = [];
  if (avgUplift >= 10) codes.push("RC_HISTORICAL_POSITIVE");
  else if (avgUplift <= -10) codes.push("RC_HISTORICAL_NEGATIVE");
  else codes.push("RC_HISTORICAL_NEUTRAL");
  if (totalN < 3) codes.push("RC_HISTORICAL_INSUFFICIENT");

  return {
    component: "historical_performance",
    raw,
    reason_codes: codes,
    supporting_signals: learnings.map((l, i) => ({
      id: `learning:${l.cluster_family}:${l.suggested_acquisition_approach}:${i}`,
      source: "outcome_learnings",
    })),
  };
}

// -----------------------------------------------------------------------------
// 7. strategic_value — from project_business_model.strategic_importance for
//    the mapped theme. Operator strategic_lock is applied as a multiplier in
//    operator_controls.ts (not here).
// -----------------------------------------------------------------------------

const STRATEGIC_RAW: Record<StrategicImportance, number> = {
  core: 0.95,
  growth: 0.80,
  defensive: 0.60,
  exploratory: 0.40,
};

const STRATEGIC_REASON: Record<StrategicImportance, string> = {
  core: "RC_STRATEGIC_CORE",
  growth: "RC_STRATEGIC_GROWTH",
  defensive: "RC_STRATEGIC_DEFENSIVE",
  exploratory: "RC_STRATEGIC_EXPLORATORY",
};

export function scoreStrategicValue(input: ScoreInput): ComponentResult {
  const tid = input.mapped_theme_id;
  const imp = tid ? input.business_model.strategic_importance?.[tid] : undefined;
  if (!imp) {
    return {
      component: "strategic_value",
      raw: NEUTRAL_RAW,
      reason_codes: ["RC_INSUFFICIENT_SIGNAL"],
      supporting_signals: [],
    };
  }
  return {
    component: "strategic_value",
    raw: STRATEGIC_RAW[imp],
    reason_codes: [STRATEGIC_REASON[imp]],
    supporting_signals: [],
  };
}

// -----------------------------------------------------------------------------
// 8. operational_feasibility — from fulfillment_capacity. 'suspended' triggers
//    a *signal* near 0 here; the actual VETO is enforced in operator_controls
//    composition so it appears explicitly in vetoes_triggered.
// -----------------------------------------------------------------------------

const CAPACITY_RAW: Record<FulfillmentCapacity, number> = {
  unconstrained: 0.95,
  constrained: 0.65,
  at_capacity: 0.35,
  suspended: 0.0,
};

const CAPACITY_REASON: Record<FulfillmentCapacity, string> = {
  unconstrained: "RC_CAPACITY_UNCONSTRAINED",
  constrained: "RC_CAPACITY_CONSTRAINED",
  at_capacity: "RC_CAPACITY_AT_CAPACITY",
  suspended: "RC_CAPACITY_SUSPENDED",
};

export function scoreOperationalFeasibility(input: ScoreInput): ComponentResult {
  const sid = input.mapped_service_id;
  const cap = sid
    ? input.business_model.fulfillment_capacity?.[sid]
    : undefined;
  if (!cap) {
    return {
      component: "operational_feasibility",
      raw: NEUTRAL_RAW,
      reason_codes: ["RC_INSUFFICIENT_SIGNAL"],
      supporting_signals: [],
    };
  }
  return {
    component: "operational_feasibility",
    raw: CAPACITY_RAW[cap],
    reason_codes: [CAPACITY_REASON[cap]],
    supporting_signals: [],
  };
}

// -----------------------------------------------------------------------------
// 9. competition_quality — externally supplied 0..1. Inverted in scoring:
//    high competition quality (strong brands) -> lower component raw, because
//    it is harder to win against quality competition.
// -----------------------------------------------------------------------------

export function scoreCompetitionQuality(input: ScoreInput): ComponentResult {
  const q = input.competition_quality;
  if (q === null || q === undefined || !Number.isFinite(q)) {
    return {
      component: "competition_quality",
      raw: NEUTRAL_RAW,
      reason_codes: ["RC_INSUFFICIENT_SIGNAL"],
      supporting_signals: input.competition_evidence ?? [],
    };
  }
  const qClamped = clamp01(q);
  const raw = clamp01(1 - qClamped);
  const codes: string[] = [];
  if (qClamped >= 0.7) codes.push("RC_COMPETITION_HIGH_QUALITY");
  else if (qClamped <= 0.3) codes.push("RC_COMPETITION_LOW_QUALITY");
  else codes.push("RC_COMPETITION_MID_QUALITY");
  return {
    component: "competition_quality",
    raw,
    reason_codes: codes,
    supporting_signals: input.competition_evidence ?? [],
  };
}

// -----------------------------------------------------------------------------
// 10. landing_page_fit — supplied externally (null = unknown -> neutral).
//     Until a landing-page embedding writer ships, this defaults to neutral
//     for all keywords (Step 2 deferral).
// -----------------------------------------------------------------------------

export function scoreLandingPageFit(input: ScoreInput): ComponentResult {
  const lp = input.landing_page_fit;
  if (lp === null || lp === undefined || !Number.isFinite(lp)) {
    return {
      component: "landing_page_fit",
      raw: NEUTRAL_RAW,
      reason_codes: ["RC_LANDING_PAGE_UNKNOWN", "RC_INSUFFICIENT_SIGNAL"],
      supporting_signals: input.landing_page_evidence ?? [],
    };
  }
  const raw = clamp01(lp);
  const codes: string[] = [];
  if (raw >= 0.7) codes.push("RC_LANDING_PAGE_MATCH");
  else if (raw <= 0.3) codes.push("RC_LANDING_PAGE_MISMATCH");
  else codes.push("RC_LANDING_PAGE_NEUTRAL");
  return {
    component: "landing_page_fit",
    raw,
    reason_codes: codes,
    supporting_signals: input.landing_page_evidence ?? [],
  };
}

// -----------------------------------------------------------------------------
// All components in one pass — locked order matches SCORE_COMPONENTS.
// -----------------------------------------------------------------------------

export function scoreAllComponents(
  input: ScoreInput,
): Record<ScoreComponentName, ComponentResult> {
  return {
    buyer_intent: scoreBuyerIntent(input),
    business_fit: scoreBusinessFit(input),
    conversion_likelihood: scoreConversionLikelihood(input),
    serp_weakness: scoreSerpWeakness(input),
    commercial_value: scoreCommercialValue(input),
    historical_performance: scoreHistoricalPerformance(input),
    strategic_value: scoreStrategicValue(input),
    operational_feasibility: scoreOperationalFeasibility(input),
    competition_quality: scoreCompetitionQuality(input),
    landing_page_fit: scoreLandingPageFit(input),
  };
}
