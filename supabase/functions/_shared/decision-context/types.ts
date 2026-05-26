/**
 * DecisionContext shared types — lite (self-contained for the _shared module).
 * Mirrors the persisted shape in src/lib/types.ts but kept independent so the
 * worker bundles without app code.
 */

export interface EvidenceRefLite {
  id: string;
  source: string;
  source_id?: string;
  url?: string;
  excerpt?: string;
  observed_at?: string;
  freshness_days?: number;
}

export interface MetricDeltaLite {
  metric: string;
  from?: number;
  to?: number;
  delta?: number;
  delta_pct?: number;
  unit?: string;
  window_days?: number;
  source: string;
}

export interface CausalSignalLite {
  id: string;
  label: string;
  description?: string;
  metric_delta?: MetricDeltaLite;
  strength: number;
  evidence: EvidenceRefLite[];
}

export interface RelatedSignalLite {
  id: string;
  label: string;
  source: string;
  relevance: number;
  metric_delta?: MetricDeltaLite;
  evidence: EvidenceRefLite[];
}

export interface ChangeEventLite {
  id: string;
  kind: string;
  label: string;
  occurred_at: string;
  actor?: string;
  url?: string;
}

export interface AnalogRefLite {
  id: string;
  label: string;
  cluster_family?: string;
  suggested_acquisition_approach?: string;
  n: number;
  mean_uplift_pct?: number;
  variance?: number;
  scope: "project_only" | "org_only" | "network";
}

export interface ExpectedImpactLite {
  p10: number;
  p50: number;
  p90: number;
  currency: string;
  horizon_days: number;
}

export type RiskBandLite = "low" | "medium" | "high" | "critical";

export interface RiskAssessmentLite {
  band: RiskBandLite;
  drivers: string[];
}

export type ConfidenceBandLite = "low" | "medium" | "high";

export interface DecisionConfidenceLite {
  value: number;
  band: ConfidenceBandLite;
  gate_triggers: string[];
}

export type NarrativeStatusLite = "generated" | "skipped" | "failed" | "pending";

export interface DcScope {
  /** "ads" | "cluster" | "page" | "site" | "open" */
  kind: string;
  ids: string[];
  hints?: Record<string, string | undefined>;
}

// ---- Candidate inputs to pure selectors -----------------------------------

export interface SignalCandidate {
  id: string;
  source: string;
  metric: string;
  value?: number;
  baseline?: number;
  /** Signed delta as fraction; 0.1 = +10%. */
  delta_pct?: number;
  /** Absolute change magnitude (numerator for ranking). */
  absolute_change?: number;
  window_days?: number;
  /** 0..1 — same entity 1.0, parent 0.6, sibling 0.3, project 0.1. */
  scope_proximity: number;
  direction?: "up" | "down" | "stable";
  observed_at?: string;
  /** 0..1 — confidence the metric reading is reliable. */
  signal_quality?: number;
  contradicts_thesis?: boolean;
  unit?: string;
  evidence?: EvidenceRefLite;
  label?: string;
}

export interface CausalCandidate {
  id: string;
  label: string;
  description?: string;
  /** Days ago from now_iso. */
  days_ago: number;
  scope_proximity: number;
  /** 0..1 — magnitude of the change relative to baseline. */
  magnitude: number;
  /** 0..1 — static prior per rule/change kind. */
  prior_likelihood: number;
  metric_delta?: MetricDeltaLite;
  evidence: EvidenceRefLite[];
}

export interface ChangeCandidate {
  id: string;
  kind: string;
  label: string;
  occurred_at: string;
  actor?: string;
  url?: string;
  /** Stable entity id for dedupe vs causal_signals. */
  entity_id?: string;
}

export interface AnalogCandidate {
  id: string;
  cluster_family: string;
  suggested_acquisition_approach: string;
  action_category: string;
  n: number;
  mean_uplift_pct?: number;
  variance?: number;
  last_updated: string;
  /** 0..1 — pre-computed similarity to current scope. */
  similarity: number;
  scope_kind_match: boolean;
  label?: string;
  scope: "project_only" | "org_only" | "network";
}

// ---- Opportunity-score subset (input to risk/next-step) -------------------

export interface ScoreSummary {
  score: number;
  score_band: "veto" | "low" | "medium" | "high" | "critical";
  confidence: number;
  confidence_band: ConfidenceBandLite;
  components: Record<string, number>;
  vetoes_triggered: string[];
  contribution_trace: Array<{
    component: string;
    raw_value: number;
    weight: number;
    points_contributed: number;
    rank: number;
    reason_codes: string[];
  }>;
  expected_impact?: ExpectedImpactLite;
  model_version: string;
  signals_version: string;
}
