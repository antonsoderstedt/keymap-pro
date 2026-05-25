// -----------------------------------------------------------------------------
// scoreOpportunity — PURE composition of the v1 scoring pipeline.
//
// Inputs:
//   - ScoreInput (verdict + business_model + mappings + learnings + lp_fit)
//   - Operator controls (filtered to project; matched here by scope)
//
// Pipeline (locked, 3 stages):
//   1. Compute 10 component raws (components.ts).
//   2. Apply profile weights → weighted_score in 0..100.
//   3. Apply:
//        a. aggressiveness multiplier (global; bounded)
//        b. operator-control multipliers (bounded per kind; combined clamped)
//        c. veto check (sets score=0 if any veto)
//        d. learning_adjustment (bounded ±10 points)
//
// Stamps MODEL_VERSION + SIGNALS_VERSION + workspace_profile on output.
// Reproducible from stored components + weights + multipliers + learning +
// model_version.
// -----------------------------------------------------------------------------

import {
  AGGRESSIVENESS_MULT,
  MODEL_VERSION,
  PROFILE_WEIGHTS,
  SCORE_BAND_THRESHOLDS,
  SCORE_COMPONENTS,
  SIGNALS_VERSION,
  type AggressivenessProfile,
  type ScoreComponentName,
  type WorkspaceProfile,
} from "./constants.ts";
import {
  scoreAllComponents,
  type EvidenceRefLite,
  type ScoreInput,
} from "./components.ts";
import { computeConfidence, type ConfidenceResult } from "./confidence.ts";
import {
  applyOperatorControls,
  type OperatorControlLite,
} from "./operator_controls.ts";
import { computeLearningAdjustment, type LearningAdjustmentResult } from "./learning.ts";
import { buildContributionTrace, type ComponentContribution } from "./trace.ts";

export type ScoreBand = "veto" | "low" | "medium" | "high" | "critical";

export interface OpportunityScoreResult {
  scope_kind: "keyword" | "cluster" | "opportunity";
  scope_id: string;
  score: number;
  score_band: ScoreBand;
  confidence: number;
  confidence_band: "low" | "medium" | "high";
  components: Record<ScoreComponentName, number>;
  weights_applied: Record<ScoreComponentName, number>;
  multipliers_applied: Record<string, number>;
  vetoes_triggered: string[];
  contribution_trace: ComponentContribution[];
  freshness: {
    oldest_signal_days?: number;
    newest_signal_days?: number;
    per_component?: Partial<Record<ScoreComponentName, number>>;
  };
  learning_adjustment?: LearningAdjustmentResult;
  expected_impact?: {
    p10: number;
    p50: number;
    p90: number;
    currency: string;
    horizon_days: number;
  };
  risk?: {
    band: "low" | "medium" | "high";
    drivers: string[];
  };
  workspace_profile: WorkspaceProfile;
  model_version: string;
  signals_version: string;
  computed_at: string;
  // Operator-derived metadata (kept for downstream display; not authoritative)
  approach_override?: string;
  confidence_details?: ConfidenceResult;
}

function bandFor(score: number, vetoed: boolean): ScoreBand {
  if (vetoed) return "veto";
  if (score >= SCORE_BAND_THRESHOLDS.critical) return "critical";
  if (score >= SCORE_BAND_THRESHOLDS.high) return "high";
  if (score >= SCORE_BAND_THRESHOLDS.medium) return "medium";
  return "low";
}

function freshnessDays(signals: EvidenceRefLite[]): {
  oldest?: number;
  newest?: number;
} {
  let oldest: number | undefined;
  let newest: number | undefined;
  for (const s of signals) {
    if (typeof s.freshness_days === "number" && Number.isFinite(s.freshness_days)) {
      if (oldest === undefined || s.freshness_days > oldest) oldest = s.freshness_days;
      if (newest === undefined || s.freshness_days < newest) newest = s.freshness_days;
    }
  }
  return { oldest, newest };
}

// -----------------------------------------------------------------------------
// Coverage / agreement / freshness derivation for confidence.
// Coverage = fraction of components without RC_INSUFFICIENT_SIGNAL.
// Agreement = 1 - (stddev of component raws) * 2, clamped.
// Freshness = 1 - normalized(oldest_signal_days/90), clamped.
// Contradiction = fraction of components flagged with insufficient or
//                 with raw value strongly opposing the median.
// Historical_certainty = present only if learnings exist; else 0.
// Prior_strength = 0.5 baseline (proportional to fraction of business-model
//                  inputs supplied).
// -----------------------------------------------------------------------------

function deriveConfidenceInputs(
  components: Record<ScoreComponentName, { raw: number; reason_codes: string[]; supporting_signals: EvidenceRefLite[] }>,
  hasLearnings: boolean,
  priorStrength: number,
): {
  coverage: number;
  agreement: number;
  freshness: number;
  historical_certainty: number;
  prior_strength: number;
  contradiction_penalty: number;
} {
  const rs = SCORE_COMPONENTS.map((c) => components[c]);

  const covered = rs.filter(
    (r) => !r.reason_codes.includes("RC_INSUFFICIENT_SIGNAL"),
  ).length;
  const coverage = covered / SCORE_COMPONENTS.length;

  const raws = rs.map((r) => r.raw);
  const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
  const variance =
    raws.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / raws.length;
  const stddev = Math.sqrt(variance);
  const agreement = Math.max(0, Math.min(1, 1 - stddev * 2));

  const allEvidence = rs.flatMap((r) => r.supporting_signals);
  const { oldest } = freshnessDays(allEvidence);
  const freshness =
    oldest === undefined ? 0.5 : Math.max(0, Math.min(1, 1 - oldest / 90));

  // Contradiction: components flagged insufficient OR very far from median.
  const sorted = [...raws].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const contradicting = rs.filter((r) => Math.abs(r.raw - median) >= 0.5).length;
  const contradiction_penalty = contradicting / rs.length;

  return {
    coverage,
    agreement,
    freshness,
    historical_certainty: hasLearnings ? 0.6 : 0,
    prior_strength: priorStrength,
    contradiction_penalty,
  };
}

function deriveRisk(
  contradictionPenalty: number,
  vetoed: boolean,
  commoditization: number,
  capacityFlag: boolean,
): { band: "low" | "medium" | "high"; drivers: string[] } {
  const drivers: string[] = [];
  if (vetoed) drivers.push("veto_triggered");
  if (commoditization >= 0.6) drivers.push("commoditized_serp");
  if (capacityFlag) drivers.push("capacity_constraint");
  if (contradictionPenalty >= 0.3) drivers.push("contradicting_signals");

  let band: "low" | "medium" | "high" = "low";
  if (drivers.length >= 2 || vetoed) band = "high";
  else if (drivers.length === 1) band = "medium";
  return { band, drivers };
}

function priorStrengthFromBM(bm: ScoreInput["business_model"], sid?: string): number {
  // Count which of the four service-keyed maps have an entry for this service.
  if (!sid) return 0.4; // baseline when no service mapping
  let count = 0;
  if (typeof bm.service_priority?.[sid] === "number") count++;
  if (typeof bm.service_margin_pct?.[sid] === "number") count++;
  if (typeof bm.close_rate_est?.[sid] === "number") count++;
  if (bm.fulfillment_capacity?.[sid]) count++;
  return Math.max(0.3, Math.min(1, count / 4));
}

// -----------------------------------------------------------------------------
// Main entrypoint.
// -----------------------------------------------------------------------------

export interface ScoreOpportunityArgs {
  input: ScoreInput;
  operator_controls: OperatorControlLite[];
  // For deterministic tests; defaults to new Date().toISOString() in the
  // worker. The pure function takes it as an explicit input.
  now_iso: string;
}

export function scoreOpportunity(
  args: ScoreOpportunityArgs,
): OpportunityScoreResult {
  const { input, operator_controls, now_iso } = args;
  const profile = input.business_model.workspace_profile as WorkspaceProfile;
  const weights = PROFILE_WEIGHTS[profile];
  if (!weights) {
    throw new Error(`Unknown workspace_profile: ${profile}`);
  }

  // 1. Components.
  const compResults = scoreAllComponents(input);

  // 2. Weighted sum (0..100).
  let weighted = 0;
  for (const c of SCORE_COMPONENTS) {
    weighted += compResults[c].raw * weights[c];
  }

  // 3a. Aggressiveness multiplier.
  const agg = input.business_model.aggressiveness_profile as AggressivenessProfile;
  const aggMult = AGGRESSIVENESS_MULT[agg] ?? 1.0;

  // 3b. Operator controls.
  const op = applyOperatorControls(
    {
      scope_kind: input.scope_kind,
      scope_id: input.scope_id,
      mapped_theme_id: input.mapped_theme_id,
      mapped_service_id: input.mapped_service_id,
    },
    operator_controls,
  );

  const multipliers_applied: Record<string, number> = {
    aggressiveness: aggMult,
    ...op.multipliers_applied,
  };

  // 3c. Veto check (also: capacity=suspended in components flips to 0 raw, but
  //     the explicit veto must surface in vetoes_triggered to bypass scoring).
  const vetoes_triggered = [...op.vetoes_triggered];
  // Auto-veto on capacity=suspended even without an operator control.
  if (
    compResults.operational_feasibility.reason_codes.includes("RC_CAPACITY_SUSPENDED") &&
    !vetoes_triggered.includes("capacity_suspended")
  ) {
    vetoes_triggered.push("capacity_suspended");
  }
  const vetoed = vetoes_triggered.length > 0;

  // 3d. Apply multipliers, then learning adjustment.
  let score = vetoed ? 0 : weighted * aggMult * op.multiplier;
  // Add aggressiveness reason code if it shifted.
  const componentExtraCodes: Record<string, string[]> = {};
  if (aggMult !== 1.0 && !vetoed) {
    componentExtraCodes.buyer_intent = ["RC_AGGRESSIVENESS_BIAS"];
  }

  // Learning adjustment (bounded ±10 points). Disabled when vetoed.
  const learning = vetoed
    ? { applied: 0, reason: "vetoed", n: 0 } satisfies LearningAdjustmentResult
    : computeLearningAdjustment(input.matching_learnings ?? []);
  if (!vetoed) score += learning.applied;

  // Final clamp 0..100.
  score = Math.max(0, Math.min(100, score));

  // Contribution trace uses raw component values & weights (not multipliers).
  // This keeps the trace reproducible across model versions; multipliers are
  // recorded separately.
  const trace = buildContributionTrace(compResults, weights);

  // Append extra reason codes onto the right contributions (e.g. aggressiveness
  // bias is attributed to buyer_intent as the canonical anchor component).
  for (const [comp, codes] of Object.entries(componentExtraCodes)) {
    const t = trace.find((x) => x.component === comp);
    if (t) t.reason_codes = [...t.reason_codes, ...codes];
  }
  // Operator-control reasons land on the highest-ranked contribution as
  // generic metadata.
  if (op.reason_codes_added.length > 0 && trace.length > 0) {
    trace[0].reason_codes = [...trace[0].reason_codes, ...op.reason_codes_added];
  }

  // Confidence — pure derivation from component coverage / agreement /
  // freshness / learnings / priors / contradictions.
  const priorStrength = priorStrengthFromBM(input.business_model, input.mapped_service_id);
  const confInputs = deriveConfidenceInputs(
    compResults,
    (input.matching_learnings ?? []).length > 0,
    priorStrength,
  );
  const confidence = computeConfidence(confInputs);

  // Freshness summary across all evidence.
  const allEvidence: EvidenceRefLite[] = SCORE_COMPONENTS.flatMap(
    (c) => compResults[c].supporting_signals,
  );
  const fdays = freshnessDays(allEvidence);
  const perComp: Partial<Record<ScoreComponentName, number>> = {};
  for (const c of SCORE_COMPONENTS) {
    const f = freshnessDays(compResults[c].supporting_signals);
    if (f.oldest !== undefined) perComp[c] = f.oldest;
  }

  // Risk derivation.
  const capFlag =
    compResults.operational_feasibility.reason_codes.includes("RC_CAPACITY_AT_CAPACITY") ||
    compResults.operational_feasibility.reason_codes.includes("RC_CAPACITY_CONSTRAINED");
  const risk = deriveRisk(
    confInputs.contradiction_penalty,
    vetoed,
    input.verdict.commoditization_score ?? 0,
    capFlag,
  );

  const components: Record<ScoreComponentName, number> = {} as Record<ScoreComponentName, number>;
  for (const c of SCORE_COMPONENTS) components[c] = compResults[c].raw;

  return {
    scope_kind: input.scope_kind,
    scope_id: input.scope_id,
    score,
    score_band: bandFor(score, vetoed),
    confidence: confidence.value,
    confidence_band: confidence.band,
    components,
    weights_applied: { ...weights },
    multipliers_applied,
    vetoes_triggered,
    contribution_trace: trace,
    freshness: {
      oldest_signal_days: fdays.oldest,
      newest_signal_days: fdays.newest,
      per_component: perComp,
    },
    learning_adjustment: learning.applied !== 0 || learning.reason !== "no_learnings"
      ? learning
      : undefined,
    expected_impact: input.verdict.estimated_commercial_value
      ? {
          p10: input.verdict.estimated_commercial_value.p10,
          p50: input.verdict.estimated_commercial_value.p50,
          p90: input.verdict.estimated_commercial_value.p90,
          currency: input.verdict.estimated_commercial_value.currency,
          horizon_days: 90,
        }
      : undefined,
    risk,
    workspace_profile: profile,
    model_version: MODEL_VERSION,
    signals_version: SIGNALS_VERSION,
    computed_at: now_iso,
    approach_override: op.approach_override,
    confidence_details: confidence,
  };
}
