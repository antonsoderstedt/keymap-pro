/**
 * computeDecisionConfidence — combines coverage, scoring confidence, and freshness.
 *
 * Pure. DecisionConfidence is *distinct* from OpportunityScore.confidence —
 * it reflects how well the supporting Context is grounded, not how reliable
 * the score itself is.
 *
 *   dc.value = 0.45·coverage + 0.35·scoring_confidence + 0.20·freshness
 *
 *   coverage     = clamp((#what_changed/3)·0.4 + (#causal/3)·0.3 + (#related/5)·0.3, 0, 1)
 *   freshness    = clamp(1 − stale_days/STALE_DAYS, 0, 1)
 *
 * Gate codes (any can fire):
 *   RC_DC_LOW_COVERAGE           — coverage < 0.5
 *   RC_DC_STALE_SIGNALS          — freshness < 0.5
 *   RC_DC_SCORING_LOW_CONFIDENCE — scoring_confidence < 0.5
 *   RC_DC_LIMITED_CROSS_SOURCE   — related.length < 3
 *   RC_DC_NO_OPPORTUNITY_SCORE   — when caller has no score
 */

import { DC_CONFIDENCE_BANDS, STALE_DAYS } from "./constants.ts";
import type { DecisionConfidenceLite } from "./types.ts";

export interface ConfidenceInput {
  what_changed_count: number;
  causal_count: number;
  related_count: number;
  /** Age of the oldest material signal in days. */
  stale_days: number;
  /** opportunity_score.confidence (0..1) or null when score is missing. */
  scoring_confidence: number | null;
  limited_cross_source: boolean;
}

export function computeDecisionConfidence(input: ConfidenceInput): DecisionConfidenceLite {
  const coverage = Math.max(
    0,
    Math.min(
      1,
      (Math.min(input.what_changed_count, 3) / 3) * 0.4 +
        (Math.min(input.causal_count, 3) / 3) * 0.3 +
        (Math.min(input.related_count, 5) / 5) * 0.3,
    ),
  );
  const freshness = Math.max(0, Math.min(1, 1 - input.stale_days / STALE_DAYS));
  const scoringConf = input.scoring_confidence ?? 0;

  const value = Math.max(0, Math.min(1, 0.45 * coverage + 0.35 * scoringConf + 0.2 * freshness));

  const gates: string[] = [];
  if (coverage < 0.5) gates.push("RC_DC_LOW_COVERAGE");
  if (freshness < 0.5) gates.push("RC_DC_STALE_SIGNALS");
  if (scoringConf < 0.5) gates.push("RC_DC_SCORING_LOW_CONFIDENCE");
  if (input.limited_cross_source) gates.push("RC_DC_LIMITED_CROSS_SOURCE");
  if (input.scoring_confidence === null) gates.push("RC_DC_NO_OPPORTUNITY_SCORE");

  let band: DecisionConfidenceLite["band"];
  if (value < DC_CONFIDENCE_BANDS.low) band = "low";
  else if (value < DC_CONFIDENCE_BANDS.high) band = "medium";
  else band = "high";

  return { value, band, gate_triggers: gates };
}
