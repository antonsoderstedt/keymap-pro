/**
 * buildDecisionContext — pure composition of sections 0–8.
 *
 * The worker assembles candidate lists from project tables and calls this
 * function. Output is fully deterministic for the given input.
 *
 * Sections produced:
 *   0  scope                 — DcScope
 *   1  what_changed          — MetricDelta[1..3]
 *   2  causal_signals        — CausalSignal[1..3]
 *   3  related_signals       — RelatedSignal[3..5] (cross-source diversity)
 *   4  recent_changes        — ChangeEvent[0..5]
 *   5  historical_analogs    — AnalogRef[0..3]   (project_only)
 *   6  risk                  — RiskAssessment
 *   7  evidence              — EvidenceRef[≤8]
 *   8  recommended_next_step — string | null
 *
 *   (why_this_matters narrative is generated *outside* this function.)
 */

import { selectHistoricalAnalogs } from "./analogs.ts";
import { selectCausalSignals } from "./causal.ts";
import { computeDecisionConfidence } from "./confidence.ts";
import { assembleEvidence } from "./evidence.ts";
import { hashCanonical } from "./hash.ts";
import { selectRecommendedNextStep } from "./next_step.ts";
import { selectRecentChanges } from "./recent_changes.ts";
import { selectRelatedSignals } from "./related.ts";
import { deriveRisk } from "./risk.ts";
import { selectWhatChanged } from "./what_changed.ts";
import { MODEL_VERSION, SIGNALS_VERSION } from "./constants.ts";

import type {
  AnalogCandidate,
  AnalogRefLite,
  CausalCandidate,
  CausalSignalLite,
  ChangeCandidate,
  ChangeEventLite,
  DcScope,
  DecisionConfidenceLite,
  EvidenceRefLite,
  MetricDeltaLite,
  RelatedSignalLite,
  RiskAssessmentLite,
  ScoreSummary,
  SignalCandidate,
} from "./types.ts";

export interface BuildDecisionContextInput {
  project_id: string;
  scope: DcScope;
  /** OpportunityScore for this scope (null when missing). */
  opportunity_score: ScoreSummary | null;
  /** ISO timestamp used as "now" — caller-controlled for reproducibility. */
  now_iso: string;

  /** Pre-filtered candidates (scope already applied by the worker). */
  delta_candidates: SignalCandidate[];
  causal_candidates: CausalCandidate[];
  related_candidates: SignalCandidate[];
  change_candidates: ChangeCandidate[];
  analog_candidates: AnalogCandidate[];

  /** Optional direction the action expects (for what_changed bonus). */
  action_intent_direction?: "up" | "down" | "stable";

  /** Oldest material signal age (days) — feeds freshness in confidence. */
  oldest_signal_days?: number;
}

export interface DecisionContextV1 {
  model_version: string;
  signals_version: string;
  generated_at: string;
  scope: DcScope;

  // sections 1..5
  what_changed: MetricDeltaLite[];
  causal_signals: CausalSignalLite[];
  related_signals: RelatedSignalLite[];
  recent_changes: ChangeEventLite[];
  historical_analogs: AnalogRefLite[];

  // sections 6..8
  risk: RiskAssessmentLite | null;
  evidence: EvidenceRefLite[];
  recommended_next_step: string | null;

  // meta
  confidence: DecisionConfidenceLite;
  why_this_matters: null;       // populated by worker after LLM + validation
  narrative_status: "pending";  // worker overrides to "generated"|"skipped"|"failed"
}

export interface BuildDecisionContextResult {
  context: DecisionContextV1;
  inputs_hash: string;
}

export async function buildDecisionContext(
  input: BuildDecisionContextInput,
): Promise<BuildDecisionContextResult> {
  // Section 1
  const whatChanged = selectWhatChanged(input.delta_candidates, {
    action_intent_direction: input.action_intent_direction,
  });
  const whatChangedEvidence: EvidenceRefLite[] = input.delta_candidates
    .filter((c) => whatChanged.some((w) => w.source === c.source && w.metric === c.metric))
    .map((c) => c.evidence)
    .filter((e): e is EvidenceRefLite => Boolean(e));

  // Section 2
  const causal = selectCausalSignals(input.causal_candidates);

  // Section 3 — exclude evidence ids already used in causal to avoid restating
  const excludeIds = new Set<string>();
  for (const c of causal) for (const e of c.evidence) excludeIds.add(e.id);
  const related = selectRelatedSignals(input.related_candidates, {
    exclude_evidence_ids: excludeIds,
  });

  // Section 4 — suppress overlaps with causal
  const suppressChangeIds = new Set<string>(causal.map((c) => c.id));
  const recent = selectRecentChanges(input.change_candidates, {
    now_iso: input.now_iso,
    suppress_ids: suppressChangeIds,
  });

  // Section 5
  const analogs = selectHistoricalAnalogs(input.analog_candidates, { now_iso: input.now_iso });

  // Section 6
  const risk = input.opportunity_score ? deriveRisk(input.opportunity_score) : null;

  // Section 7
  const evidence = assembleEvidence(whatChanged, causal, related.signals, whatChangedEvidence);

  // Section 8
  const nextStep = input.opportunity_score
    ? selectRecommendedNextStep(input.opportunity_score)
    : null;

  // DecisionConfidence
  const confidence = computeDecisionConfidence({
    what_changed_count: whatChanged.length,
    causal_count: causal.length,
    related_count: related.signals.length,
    stale_days: input.oldest_signal_days ?? 0,
    scoring_confidence: input.opportunity_score?.confidence ?? null,
    limited_cross_source: related.limited_cross_source,
  });

  const context: DecisionContextV1 = {
    model_version: MODEL_VERSION,
    signals_version: SIGNALS_VERSION,
    generated_at: input.now_iso,
    scope: input.scope,
    what_changed: whatChanged,
    causal_signals: causal,
    related_signals: related.signals,
    recent_changes: recent,
    historical_analogs: analogs,
    risk,
    evidence,
    recommended_next_step: nextStep,
    confidence,
    why_this_matters: null,
    narrative_status: "pending",
  };

  // inputs_hash — hash the *inputs*, not the output, so a re-run with the same
  // upstream data is skip-eligible. now_iso is intentionally excluded.
  const inputs_hash = await hashCanonical({
    model_version: MODEL_VERSION,
    signals_version: SIGNALS_VERSION,
    project_id: input.project_id,
    scope: input.scope,
    opportunity_score_id: (input.opportunity_score as ScoreSummary & { id?: string } | null)?.id ?? null,
    opportunity_score_value: input.opportunity_score?.score ?? null,
    delta_candidates: input.delta_candidates,
    causal_candidates: input.causal_candidates,
    related_candidates: input.related_candidates,
    change_candidates: input.change_candidates,
    analog_candidates: input.analog_candidates,
    action_intent_direction: input.action_intent_direction ?? null,
  });

  return { context, inputs_hash };
}
