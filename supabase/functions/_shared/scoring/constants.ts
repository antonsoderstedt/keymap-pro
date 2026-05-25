// -----------------------------------------------------------------------------
// Opportunity Score v1 — locked constants.
// PURE module: no I/O, no Deno-specific APIs.
//
// Any change to:
//   - profile weight matrices
//   - veto rules
//   - multiplier ranges
//   - band thresholds
//   - confidence formula coefficients
//   - REASON_CODES_SCORING
// MUST be accompanied by a MODEL_VERSION bump. Stored scores carry
// model_version; this is how reproducibility is verified.
// -----------------------------------------------------------------------------

export const MODEL_VERSION = "opportunity-score-v1.0.0";

// Signals version is shared with commercial-intent v1 (same upstream signal
// shapes). If signal sources/shapes change, both bump together.
export const SIGNALS_VERSION = "signals-v1.0.0";

// -----------------------------------------------------------------------------
// Component set — locked. Adding/removing components is a MODEL_VERSION bump.
// -----------------------------------------------------------------------------

export const SCORE_COMPONENTS = [
  "buyer_intent",
  "business_fit",
  "conversion_likelihood",
  "serp_weakness",
  "commercial_value",
  "historical_performance",
  "strategic_value",
  "operational_feasibility",
  "competition_quality",
  "landing_page_fit",
] as const;

export type ScoreComponentName = typeof SCORE_COMPONENTS[number];

// -----------------------------------------------------------------------------
// Workspace profile weight matrices. Each row MUST sum to exactly 100.
// Verified at module load by `assertWeightsSum100`.
// -----------------------------------------------------------------------------

export type WorkspaceProfile =
  | "b2b_service"
  | "b2b_industrial"
  | "b2c_ecom"
  | "local_service"
  | "saas";

export type ProfileWeights = Record<ScoreComponentName, number>;

export const PROFILE_WEIGHTS: Record<WorkspaceProfile, ProfileWeights> = {
  b2b_service: {
    buyer_intent: 18,
    business_fit: 15,
    conversion_likelihood: 12,
    serp_weakness: 8,
    commercial_value: 12,
    historical_performance: 8,
    strategic_value: 10,
    operational_feasibility: 6,
    competition_quality: 6,
    landing_page_fit: 5,
  },
  b2b_industrial: {
    buyer_intent: 14,
    business_fit: 18,
    conversion_likelihood: 10,
    serp_weakness: 8,
    commercial_value: 14,
    historical_performance: 8,
    strategic_value: 12,
    operational_feasibility: 6,
    competition_quality: 5,
    landing_page_fit: 5,
  },
  b2c_ecom: {
    buyer_intent: 20,
    business_fit: 10,
    conversion_likelihood: 14,
    serp_weakness: 10,
    commercial_value: 14,
    historical_performance: 8,
    strategic_value: 6,
    operational_feasibility: 4,
    competition_quality: 6,
    landing_page_fit: 8,
  },
  local_service: {
    buyer_intent: 22,
    business_fit: 12,
    conversion_likelihood: 14,
    serp_weakness: 8,
    commercial_value: 10,
    historical_performance: 6,
    strategic_value: 8,
    operational_feasibility: 8,
    competition_quality: 6,
    landing_page_fit: 6,
  },
  saas: {
    buyer_intent: 14,
    business_fit: 14,
    conversion_likelihood: 10,
    serp_weakness: 10,
    commercial_value: 12,
    historical_performance: 10,
    strategic_value: 12,
    operational_feasibility: 5,
    competition_quality: 6,
    landing_page_fit: 7,
  },
};

// Validate at module load. Sums MUST be exactly 100 per profile.
for (const [profile, weights] of Object.entries(PROFILE_WEIGHTS)) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total !== 100) {
    throw new Error(
      `PROFILE_WEIGHTS[${profile}] sums to ${total}; must be exactly 100`,
    );
  }
  for (const c of SCORE_COMPONENTS) {
    if (!(c in weights)) {
      throw new Error(`PROFILE_WEIGHTS[${profile}] missing component ${c}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Aggressiveness profile — applied as a small global scalar on the WEIGHTED
// score (not raw components). Bounded; logged into multipliers_applied.
// -----------------------------------------------------------------------------

export type AggressivenessProfile = "conservative" | "balanced" | "aggressive";

export const AGGRESSIVENESS_MULT: Record<AggressivenessProfile, number> = {
  conservative: 0.92,
  balanced: 1.0,
  aggressive: 1.08,
};

// -----------------------------------------------------------------------------
// Lead quality target — biases conversion_likelihood emphasis. Bounded scalar
// applied to that component AFTER it is raw-scored. Never to other components.
// -----------------------------------------------------------------------------

export type LeadQualityTarget = "volume" | "balanced" | "quality";

export const LEAD_QUALITY_CONVERSION_MULT: Record<LeadQualityTarget, number> = {
  volume: 0.95,
  balanced: 1.0,
  quality: 1.05,
};

// -----------------------------------------------------------------------------
// Band thresholds — locked.
// -----------------------------------------------------------------------------

export const SCORE_BAND_THRESHOLDS = {
  // veto = explicit veto trigger (score = 0)
  low: 0,
  medium: 40,
  high: 60,
  critical: 80,
} as const;

export const CONFIDENCE_BAND_THRESHOLDS = {
  low: 0,
  medium: 0.5,
  high: 0.75,
} as const;

// -----------------------------------------------------------------------------
// Operator-control bounds. Multipliers are clamped to these ranges so a single
// control can never wholly override scoring.
// -----------------------------------------------------------------------------

export const OPERATOR_THEME_BOOST_RANGE = [1.0, 1.2] as const;       // theme_boost
export const OPERATOR_THEME_DEPRIORITIZE_RANGE = [0.8, 1.0] as const; // theme_deprioritize
export const OPERATOR_CAPACITY_AT_CAPACITY_MULT = 0.85;
export const OPERATOR_CAPACITY_SUSPENDED_VETO = true;

// Strategic lock — boost; cannot exceed cap. Recorded.
export const STRATEGIC_LOCK_MULT = 1.15;

// -----------------------------------------------------------------------------
// Confidence formula — locked coefficients.
//   confidence =
//       0.25 * coverage
//     + 0.20 * agreement
//     + 0.15 * freshness
//     + 0.15 * historical_certainty
//     + 0.10 * prior_strength
//     - 0.15 * contradiction_penalty
// Clamped to [0, 1].
// -----------------------------------------------------------------------------

export const CONFIDENCE_COEFFS = {
  coverage: 0.25,
  agreement: 0.20,
  freshness: 0.15,
  historical_certainty: 0.15,
  prior_strength: 0.10,
  contradiction_penalty: 0.15, // subtracted
} as const;

// Sum of positive coefficients = 0.85; gate-triggers cap output further.
{
  const sumPositive =
    CONFIDENCE_COEFFS.coverage +
    CONFIDENCE_COEFFS.agreement +
    CONFIDENCE_COEFFS.freshness +
    CONFIDENCE_COEFFS.historical_certainty +
    CONFIDENCE_COEFFS.prior_strength;
  if (Math.abs(sumPositive - 0.85) > 1e-9) {
    throw new Error(
      `CONFIDENCE_COEFFS positive sum is ${sumPositive}; must be 0.85`,
    );
  }
}

// -----------------------------------------------------------------------------
// Learning adjustment bounds. n>=3 required. Adjustment is signed points.
// -----------------------------------------------------------------------------

export const LEARNING_MIN_N = 3;
export const LEARNING_MAX_ABS_POINTS = 10;
// uplift% to points: clamp(mean_uplift_pct * 0.5, -10, +10). Saturates fast.
export const LEARNING_UPLIFT_TO_POINTS = 0.5;

// -----------------------------------------------------------------------------
// Reason-code registry (scoring-layer additions). The commercial-intent layer
// has its own registry; this one is consumed by score components.
//
// Adding/removing entries requires MODEL_VERSION bump.
// -----------------------------------------------------------------------------

export const REASON_CODES_SCORING = {
  // buyer_intent
  RC_HIGH_BUYER_INTENT: "Buyer-intent score indicates ready-to-buy",
  RC_MID_BUYER_INTENT: "Buyer-intent score indicates evaluation stage",
  RC_LOW_BUYER_INTENT: "Buyer-intent score indicates research stage",

  // business_fit
  RC_SERVICE_PRIORITY_HIGH: "Mapped to high-priority service",
  RC_SERVICE_PRIORITY_MID: "Mapped to mid-priority service",
  RC_SERVICE_PRIORITY_LOW: "Mapped to low-priority service",
  RC_NO_SERVICE_MAPPING: "No explicit service mapping; using project default",

  // conversion_likelihood
  RC_HIGH_CONVERSION_LIKELIHOOD: "Conversion likelihood above profile baseline",
  RC_MID_CONVERSION_LIKELIHOOD: "Conversion likelihood near profile baseline",
  RC_LOW_CONVERSION_LIKELIHOOD: "Conversion likelihood below profile baseline",
  RC_LEAD_QUALITY_BIAS: "Score biased by lead_quality_target",

  // serp_weakness
  RC_SERP_WEAK: "SERP has low competitiveness; room to enter",
  RC_SERP_NEUTRAL: "SERP competitiveness is mid-range",
  RC_SERP_STRONG: "SERP dominated by strong incumbents",
  RC_SERP_COMMODITIZED: "SERP heavily commoditized by aggregators",

  // commercial_value
  RC_HIGH_VALUE_P50: "Estimated p50 commercial value is high",
  RC_MID_VALUE_P50: "Estimated p50 commercial value is mid-range",
  RC_LOW_VALUE_P50: "Estimated p50 commercial value is low",
  RC_VALUE_UNCERTAINTY_WIDE: "p10/p90 spread is wide; treat value with caution",

  // historical_performance
  RC_HISTORICAL_POSITIVE: "Historical learnings show positive uplift",
  RC_HISTORICAL_NEGATIVE: "Historical learnings show negative uplift",
  RC_HISTORICAL_NEUTRAL: "Historical learnings are neutral",
  RC_HISTORICAL_INSUFFICIENT: "Insufficient historical sample (n<3); using neutral",

  // strategic_value
  RC_STRATEGIC_CORE: "Theme classified as core",
  RC_STRATEGIC_GROWTH: "Theme classified as growth",
  RC_STRATEGIC_DEFENSIVE: "Theme classified as defensive",
  RC_STRATEGIC_EXPLORATORY: "Theme classified as exploratory",
  RC_STRATEGIC_LOCK_APPLIED: "Operator strategic lock applied",

  // operational_feasibility
  RC_CAPACITY_UNCONSTRAINED: "Fulfillment capacity unconstrained",
  RC_CAPACITY_CONSTRAINED: "Fulfillment capacity constrained",
  RC_CAPACITY_AT_CAPACITY: "Fulfillment at capacity; deprioritized",
  RC_CAPACITY_SUSPENDED: "Fulfillment suspended; veto",

  // competition_quality
  RC_COMPETITION_HIGH_QUALITY: "Competitors are strong, trusted brands",
  RC_COMPETITION_MID_QUALITY: "Competitor quality is mid-range",
  RC_COMPETITION_LOW_QUALITY: "Competitors are weak or thin",

  // landing_page_fit
  RC_LANDING_PAGE_MATCH: "Existing landing page matches intent well",
  RC_LANDING_PAGE_NEUTRAL: "Landing-page match is partial",
  RC_LANDING_PAGE_MISMATCH: "No landing page matches intent",
  RC_LANDING_PAGE_UNKNOWN: "Landing-page signal unavailable; using neutral",

  // operator-control reasons
  RC_OPERATOR_THEME_BOOST: "Operator boosted this theme",
  RC_OPERATOR_THEME_DEPRIO: "Operator deprioritized this theme",
  RC_OPERATOR_VETO: "Operator vetoed this scope",
  RC_OPERATOR_CAPACITY_OVERRIDE: "Operator overrode capacity",
  RC_OPERATOR_APPROACH_OVERRIDE: "Operator overrode suggested approach",

  // shared
  RC_INSUFFICIENT_SIGNAL: "Insufficient signal coverage; using neutral fallback",
  RC_AGGRESSIVENESS_BIAS: "Score globally scaled by aggressiveness profile",
} as const;

export type ReasonCodeScoring = keyof typeof REASON_CODES_SCORING;

// -----------------------------------------------------------------------------
// Neutral fallback. Components with no usable signal return this raw value with
// RC_INSUFFICIENT_SIGNAL.
// -----------------------------------------------------------------------------

export const NEUTRAL_RAW = 0.5;
