// -----------------------------------------------------------------------------
// computeLearningAdjustment — PURE.
//
// Returns a signed-points adjustment derived from outcome_learnings whose
// (cluster_family, suggested_acquisition_approach) match the scope.
//
// Rules (locked):
//   - Disabled (returns adjustment = 0) when no matching learnings.
//   - Requires combined n >= LEARNING_MIN_N (default 3). If n<3, returns
//     adjustment = 0 with reason "insufficient_n" so it's traceable.
//   - Adjustment = clamp(weighted_mean_uplift_pct * LEARNING_UPLIFT_TO_POINTS,
//                        -LEARNING_MAX_ABS_POINTS, +LEARNING_MAX_ABS_POINTS).
//   - Saturates fast and is bounded ±10 in all cases.
// -----------------------------------------------------------------------------

import {
  LEARNING_MAX_ABS_POINTS,
  LEARNING_MIN_N,
  LEARNING_UPLIFT_TO_POINTS,
} from "./constants.ts";
import type { OutcomeLearningLite } from "./components.ts";

export interface LearningAdjustmentResult {
  applied: number;             // bounded ±LEARNING_MAX_ABS_POINTS
  reason: string;
  n: number;
  cluster_family?: string;
  suggested_acquisition_approach?: string;
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < lo ? lo : x > hi ? hi : x;
}

export function computeLearningAdjustment(
  learnings: OutcomeLearningLite[],
): LearningAdjustmentResult {
  if (!learnings || learnings.length === 0) {
    return { applied: 0, reason: "no_learnings", n: 0 };
  }

  let totalN = 0;
  let weightedSum = 0;
  for (const l of learnings) {
    if (typeof l.mean_uplift_pct === "number" && Number.isFinite(l.mean_uplift_pct)) {
      totalN += l.n;
      weightedSum += l.mean_uplift_pct * l.n;
    }
  }

  if (totalN < LEARNING_MIN_N) {
    return {
      applied: 0,
      reason: "insufficient_n",
      n: totalN,
      cluster_family: learnings[0].cluster_family,
      suggested_acquisition_approach: learnings[0].suggested_acquisition_approach,
    };
  }

  const avgUplift = weightedSum / totalN;
  const applied = clamp(
    avgUplift * LEARNING_UPLIFT_TO_POINTS,
    -LEARNING_MAX_ABS_POINTS,
    +LEARNING_MAX_ABS_POINTS,
  );

  return {
    applied,
    reason: "weighted_mean_uplift",
    n: totalN,
    cluster_family: learnings[0].cluster_family,
    suggested_acquisition_approach: learnings[0].suggested_acquisition_approach,
  };
}
