/**
 * selectRecommendedNextStep — pick the canonical lever phrase for the
 * lowest-raw component above the feasibility floor.
 *
 * Pure.
 */

import { COMPONENT_LEVERS, NEXT_STEP_MIN_FEASIBILITY } from "./constants.ts";
import type { ScoreSummary } from "./types.ts";

export function selectRecommendedNextStep(score: ScoreSummary): string | null {
  const feasibility = score.components?.operational_feasibility ?? 0;
  if (feasibility < NEXT_STEP_MIN_FEASIBILITY) return null;

  const trace = score.contribution_trace ?? [];
  if (trace.length === 0) return null;

  // Pick lowest raw_value among components that have a lever defined.
  // Tie-break: highest weight (= biggest leverage), then lex by component.
  const eligible = trace.filter((t) => Object.prototype.hasOwnProperty.call(COMPONENT_LEVERS, t.component));
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    if (a.raw_value !== b.raw_value) return a.raw_value - b.raw_value;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.component < b.component ? -1 : a.component > b.component ? 1 : 0;
  });

  const top = sorted[0];
  return COMPONENT_LEVERS[top.component].label;
}
