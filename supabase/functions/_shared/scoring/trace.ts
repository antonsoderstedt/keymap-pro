// -----------------------------------------------------------------------------
// buildContributionTrace — PURE.
//
// Produces an ordered ComponentContribution[]:
//   - raw_value: 0..1 from the component scorer
//   - weight: profile weight (0..100; sums to 100)
//   - points_contributed: raw_value * weight  (0..weight)
//   - rank: 1-based after sort by points_contributed desc
//   - reason_codes / supporting_signals: passed through
//   - delta_vs_profile_baseline: raw_value - 0.5 (informational only)
//
// Stable tie-breaker: when points_contributed ties, sort by SCORE_COMPONENTS
// index to keep determinism across runs.
// -----------------------------------------------------------------------------

import { SCORE_COMPONENTS, type ScoreComponentName } from "./constants.ts";
import type { ComponentResult, EvidenceRefLite } from "./components.ts";

export interface ComponentContribution {
  component: ScoreComponentName;
  raw_value: number;
  weight: number;
  points_contributed: number;
  rank: number;
  reason_codes: string[];
  supporting_signals: EvidenceRefLite[];
  delta_vs_profile_baseline: number;
}

export function buildContributionTrace(
  results: Record<ScoreComponentName, ComponentResult>,
  weights: Record<ScoreComponentName, number>,
): ComponentContribution[] {
  const indexOf: Record<string, number> = {};
  SCORE_COMPONENTS.forEach((c, i) => {
    indexOf[c] = i;
  });

  const rows = SCORE_COMPONENTS.map((c) => {
    const r = results[c];
    const w = weights[c];
    const points = r.raw * w;
    return {
      component: c,
      raw_value: r.raw,
      weight: w,
      points_contributed: points,
      rank: 0,
      reason_codes: [...r.reason_codes],
      supporting_signals: [...r.supporting_signals],
      delta_vs_profile_baseline: r.raw - 0.5,
    } satisfies ComponentContribution;
  });

  rows.sort((a, b) => {
    const d = b.points_contributed - a.points_contributed;
    if (d !== 0) return d;
    return indexOf[a.component] - indexOf[b.component];
  });

  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return rows;
}
