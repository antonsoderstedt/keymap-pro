// -----------------------------------------------------------------------------
// computeConfidence — PURE, locked formula.
//
//   confidence =
//        0.25 * coverage
//      + 0.20 * agreement
//      + 0.15 * freshness
//      + 0.15 * historical_certainty
//      + 0.10 * prior_strength
//      - 0.15 * contradiction_penalty
//
// All inputs MUST be 0..1; clamped here defensively. Gate triggers cap the
// output further (mirrors the commercial-intent gates) and are returned for
// downstream display.
// -----------------------------------------------------------------------------

import { CONFIDENCE_BAND_THRESHOLDS, CONFIDENCE_COEFFS } from "./constants.ts";

export interface ConfidenceInput {
  coverage: number;              // 0..1 — share of expected signals present
  agreement: number;             // 0..1 — components agreeing in direction
  freshness: number;             // 0..1 — recency of inputs
  historical_certainty: number;  // 0..1 — variance-derived from learnings; 0 when no learnings
  prior_strength: number;        // 0..1 — strength of business-model priors
  contradiction_penalty: number; // 0..1 — share of strongly-contradicting components
}

export type ConfidenceBand = "low" | "medium" | "high";

export interface ConfidenceResult {
  value: number;                 // 0..1
  band: ConfidenceBand;
  gate_triggers: string[];
  components: Required<ConfidenceInput>;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function bandFor(value: number): ConfidenceBand {
  if (value >= CONFIDENCE_BAND_THRESHOLDS.high) return "high";
  if (value >= CONFIDENCE_BAND_THRESHOLDS.medium) return "medium";
  return "low";
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const c = clamp01(input.coverage);
  const a = clamp01(input.agreement);
  const f = clamp01(input.freshness);
  const h = clamp01(input.historical_certainty);
  const p = clamp01(input.prior_strength);
  const x = clamp01(input.contradiction_penalty);

  let value =
    CONFIDENCE_COEFFS.coverage * c +
    CONFIDENCE_COEFFS.agreement * a +
    CONFIDENCE_COEFFS.freshness * f +
    CONFIDENCE_COEFFS.historical_certainty * h +
    CONFIDENCE_COEFFS.prior_strength * p -
    CONFIDENCE_COEFFS.contradiction_penalty * x;

  const gateTriggers: string[] = [];

  // Gate caps mirror commercial-intent: cannot stamp "high" without coverage.
  if (c < 0.5) {
    gateTriggers.push("low_coverage");
    if (value > 0.5) value = 0.5;
  }
  if (f < 0.5) {
    gateTriggers.push("stale_signals");
    if (value > 0.6) value = 0.6;
  }
  if (x >= 0.5) {
    gateTriggers.push("strong_contradiction");
    if (value > 0.6) value = 0.6;
  }

  value = clamp01(value);

  return {
    value,
    band: bandFor(value),
    gate_triggers: gateTriggers,
    components: {
      coverage: c,
      agreement: a,
      freshness: f,
      historical_certainty: h,
      prior_strength: p,
      contradiction_penalty: x,
    },
  };
}
