/**
 * selectCausalSignals — top 1..3 likely causes for the metric deltas in scope.
 *
 * Candidate sources (pre-assembled by the worker):
 *   1. Recent changes in scope (last 30d) — bid changes, LP edits, automation triggers, prior actions.
 *   2. External shifts within scope — SERP volatility, new top-3 competitor, GSC algo proximity.
 *   3. Source diagnostic rule that produced the action (rule_id + evidence).
 */

import { CAUSAL_MAX_ITEMS, CAUSAL_RECENCY_WINDOW_DAYS } from "./constants.ts";
import type { CausalCandidate, CausalSignalLite } from "./types.ts";

/**
 * Locked formula:
 *   causal_score = recency_weight(days_ago) × scope_proximity
 *                × magnitude_weight(magnitude) × prior_likelihood
 *
 * Where:
 *   recency_weight = clamp(1.0 − days_ago / 30, 0, 1) clamped to [0.4, 1.0]
 *                    (1.0 at d=0, 0.4 at d≥30)
 *   magnitude_weight = clamp(magnitude, 0, 1) lifted to [0.5, 1.0] floor (we
 *                      don't want tiny changes to disappear if they're the only
 *                      candidate — but they rank below larger changes)
 *
 * Tie-break (deterministic, stable):
 *   1. higher scope_proximity
 *   2. fewer days_ago
 *   3. lexicographic id
 */
function recencyWeight(daysAgo: number): number {
  if (daysAgo <= 0) return 1.0;
  if (daysAgo >= CAUSAL_RECENCY_WINDOW_DAYS) return 0.4;
  const w = 1.0 - daysAgo / CAUSAL_RECENCY_WINDOW_DAYS;
  return Math.max(0.4, Math.min(1.0, w));
}

function magnitudeWeight(m: number): number {
  const x = Math.max(0, Math.min(1, m));
  return 0.5 + 0.5 * x;
}

export function selectCausalSignals(candidates: CausalCandidate[]): CausalSignalLite[] {
  const ranked = candidates
    .map((c) => {
      const score =
        recencyWeight(c.days_ago) *
        Math.max(0, Math.min(1, c.scope_proximity)) *
        magnitudeWeight(c.magnitude) *
        Math.max(0, Math.min(1, c.prior_likelihood));
      return { c, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.c.scope_proximity !== a.c.scope_proximity) return b.c.scope_proximity - a.c.scope_proximity;
      if (a.c.days_ago !== b.c.days_ago) return a.c.days_ago - b.c.days_ago;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    })
    .slice(0, CAUSAL_MAX_ITEMS);

  return ranked.map(({ c, score }) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    metric_delta: c.metric_delta,
    strength: Math.max(0, Math.min(1, score)),
    evidence: c.evidence,
  }));
}
