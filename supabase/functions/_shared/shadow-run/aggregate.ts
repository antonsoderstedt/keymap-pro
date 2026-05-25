// Step 6 — Shadow-mode calibration: pure aggregation primitives.
//
// Read-only summarizers over existing intelligence rows. No DB access.
// No scoring/formula changes. No mutations. Deterministic given stable input.
//
// Imported by:
//   - supabase/functions/commercial-intelligence-shadow-run/index.ts
//   - src/test/shadow-run.test.ts (Vitest)

// ---------------------------------------------------------------------------
// Row shapes (snapshot from production tables; loose to survive schema drift).
// ---------------------------------------------------------------------------

export interface VerdictRow {
  id: string;
  keyword?: string | null;
  search_intent?: string | null;
  buyer_stage?: string | null;
  commercial_intent_score?: number | null;
  business_relevance_score?: number | null;
  conversion_likelihood?: number | null;
  serp_competitiveness?: number | null;
  commoditization_score?: number | null;
  lead_quality_proxy?: "low" | "medium" | "high" | null;
  suggested_acquisition_approach?: string | null;
  estimated_commercial_value?: { p10?: number; p50?: number; p90?: number; currency?: string } | null;
  confidence?: number | null;
  evidence?: unknown[] | null;
  model_version?: string | null;
}

export interface ScoreRow {
  id: string;
  scope_kind?: string | null;
  scope_id?: string | null;
  score?: number | null;
  score_band?: string | null;
  confidence?: number | null;
  confidence_band?: string | null;
  components?: Record<string, number> | null;
  vetoes_triggered?: string[] | null;
  contribution_trace?: Array<{
    component: string;
    points_contributed: number;
    weight: number;
    rank: number;
  }> | null;
  expected_impact?: { p10?: number; p50?: number; p90?: number; horizon_days?: number; currency?: string } | null;
  risk?: { band?: string; drivers?: unknown[] } | null;
}

export interface DcRow {
  id: string;
  action_item_id?: string | null;
  ads_change_proposal_id?: string | null;
  scope?: { kind?: string; ids?: string[] } | null;
  why_this_matters?: string | null;
  what_changed?: unknown[] | null;
  causal_signals?: unknown[] | null;
  related_signals?: unknown[] | null;
  recent_changes?: unknown[] | null;
  historical_analogs?: unknown[] | null;
  evidence?: Array<{ id?: string; source?: string; source_id?: string; observed_at?: string }> | null;
  expected_impact?: unknown | null;
  risk?: unknown | null;
  confidence?: {
    value?: number;
    band?: string;
    gate_triggers?: string[];
    narrative_status?: string;
  } | null;
  recommended_next_step?: string | null;
}

// ---------------------------------------------------------------------------
// Numeric helpers.
// ---------------------------------------------------------------------------

/** Inclusive percentile of a numeric array. Returns NaN for empty input. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Bucket numeric values into named ranges. Lower bound inclusive; upper exclusive (last bucket inclusive). */
export function histogram(
  values: number[],
  buckets: Array<{ label: string; gte: number; lt: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) out[b.label] = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const isLast = i === buckets.length - 1;
      if (v >= b.gte && (isLast ? v <= b.lt : v < b.lt)) {
        out[b.label]++;
        break;
      }
    }
  }
  return out;
}

/** Count occurrences of a categorical key. */
export function countBy<T>(rows: T[], pick: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Top-K entries of a frequency map. */
export function topK(freq: Record<string, number>, k: number): Array<{ key: string; count: number }> {
  return Object.entries(freq)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, k);
}

const DEFAULT_SCORE_BUCKETS = [
  { label: "0-20", gte: 0, lt: 20 },
  { label: "20-40", gte: 20, lt: 40 },
  { label: "40-60", gte: 40, lt: 60 },
  { label: "60-80", gte: 60, lt: 80 },
  { label: "80-100", gte: 80, lt: 100 },
];

const DEFAULT_CONFIDENCE_BUCKETS = [
  { label: "0.0-0.2", gte: 0, lt: 0.2 },
  { label: "0.2-0.4", gte: 0.2, lt: 0.4 },
  { label: "0.4-0.6", gte: 0.4, lt: 0.6 },
  { label: "0.6-0.8", gte: 0.6, lt: 0.8 },
  { label: "0.8-1.0", gte: 0.8, lt: 1.0 },
];

const DEFAULT_EVIDENCE_COUNT_BUCKETS = [
  { label: "0", gte: 0, lt: 1 },
  { label: "1-2", gte: 1, lt: 3 },
  { label: "3-5", gte: 3, lt: 6 },
  { label: "6-8", gte: 6, lt: 9 },
  { label: "9+", gte: 9, lt: Number.POSITIVE_INFINITY },
];

// ---------------------------------------------------------------------------
// Summaries.
// ---------------------------------------------------------------------------

export interface VerdictSummary {
  total: number;
  search_intent: Record<string, number>;
  buyer_stage: Record<string, number>;
  lead_quality: Record<string, number>;
  acquisition_approach: Record<string, number>;
  commercial_intent: { mean: number; p10: number; p50: number; p90: number; histogram: Record<string, number> };
  confidence: { mean: number; p10: number; p50: number; p90: number; histogram: Record<string, number> };
  expected_value_sek: { mean_p50: number; p10: number; p50: number; p90: number } | null;
  zero_evidence_count: number;
}

export function summarizeVerdicts(rows: VerdictRow[]): VerdictSummary {
  const cis = rows.map((r) => Number(r.commercial_intent_score ?? Number.NaN)).filter(Number.isFinite);
  const confs = rows.map((r) => Number(r.confidence ?? Number.NaN)).filter(Number.isFinite);
  const cisHist = histogram(cis.map((v) => v * 100), DEFAULT_SCORE_BUCKETS); // 0..1 → 0..100 buckets
  const confHist = histogram(confs, DEFAULT_CONFIDENCE_BUCKETS);

  const p50Values: number[] = [];
  for (const r of rows) {
    const ev = r.estimated_commercial_value;
    if (ev && typeof ev.p50 === "number" && Number.isFinite(ev.p50)) p50Values.push(ev.p50);
  }

  return {
    total: rows.length,
    search_intent: countBy(rows, (r) => r.search_intent ?? undefined),
    buyer_stage: countBy(rows, (r) => r.buyer_stage ?? undefined),
    lead_quality: countBy(rows, (r) => r.lead_quality_proxy ?? undefined),
    acquisition_approach: countBy(rows, (r) => r.suggested_acquisition_approach ?? undefined),
    commercial_intent: {
      mean: mean(cis),
      p10: percentile(cis, 0.1),
      p50: percentile(cis, 0.5),
      p90: percentile(cis, 0.9),
      histogram: cisHist,
    },
    confidence: {
      mean: mean(confs),
      p10: percentile(confs, 0.1),
      p50: percentile(confs, 0.5),
      p90: percentile(confs, 0.9),
      histogram: confHist,
    },
    expected_value_sek: p50Values.length === 0
      ? null
      : {
          mean_p50: mean(p50Values),
          p10: percentile(p50Values, 0.1),
          p50: percentile(p50Values, 0.5),
          p90: percentile(p50Values, 0.9),
        },
    zero_evidence_count: rows.filter((r) => !r.evidence || (Array.isArray(r.evidence) && r.evidence.length === 0)).length,
  };
}

export interface ScoreSummary {
  total: number;
  score_bands: Record<string, number>;
  confidence_bands: Record<string, number>;
  score_distribution: { mean: number; p10: number; p50: number; p90: number; histogram: Record<string, number> };
  confidence_distribution: { mean: number; p10: number; p50: number; p90: number; histogram: Record<string, number> };
  veto_count: number;
  veto_frequency: Record<string, number>;
  risk_bands: Record<string, number>;
  contribution_trace: {
    rows_with_trace: number;
    /** Mean points contributed per component across all rows that include it in their trace. */
    mean_points_by_component: Record<string, number>;
    /** Frequency of each component appearing in a row's top-3. */
    top3_frequency: Record<string, number>;
  };
  scope_kinds: Record<string, number>;
}

export function summarizeScores(rows: ScoreRow[]): ScoreSummary {
  const scores = rows.map((r) => Number(r.score ?? Number.NaN)).filter(Number.isFinite);
  const confs = rows.map((r) => Number(r.confidence ?? Number.NaN)).filter(Number.isFinite);

  const vetoFreq: Record<string, number> = {};
  let vetoCount = 0;
  for (const r of rows) {
    if (Array.isArray(r.vetoes_triggered) && r.vetoes_triggered.length > 0) {
      vetoCount++;
      for (const v of r.vetoes_triggered) vetoFreq[v] = (vetoFreq[v] ?? 0) + 1;
    }
  }

  const sumByComponent: Record<string, number> = {};
  const countByComponent: Record<string, number> = {};
  const top3Freq: Record<string, number> = {};
  let rowsWithTrace = 0;

  for (const r of rows) {
    const trace = r.contribution_trace;
    if (!Array.isArray(trace) || trace.length === 0) continue;
    rowsWithTrace++;
    const sortedByRank = [...trace].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    for (const t of sortedByRank) {
      if (!t || typeof t.component !== "string") continue;
      const pts = Number(t.points_contributed ?? 0);
      if (!Number.isFinite(pts)) continue;
      sumByComponent[t.component] = (sumByComponent[t.component] ?? 0) + pts;
      countByComponent[t.component] = (countByComponent[t.component] ?? 0) + 1;
    }
    for (const t of sortedByRank.slice(0, 3)) {
      if (t && typeof t.component === "string") {
        top3Freq[t.component] = (top3Freq[t.component] ?? 0) + 1;
      }
    }
  }

  const meanPointsByComponent: Record<string, number> = {};
  for (const k of Object.keys(sumByComponent)) {
    const c = countByComponent[k] ?? 0;
    meanPointsByComponent[k] = c > 0 ? sumByComponent[k] / c : 0;
  }

  return {
    total: rows.length,
    score_bands: countBy(rows, (r) => r.score_band ?? undefined),
    confidence_bands: countBy(rows, (r) => r.confidence_band ?? undefined),
    score_distribution: {
      mean: mean(scores),
      p10: percentile(scores, 0.1),
      p50: percentile(scores, 0.5),
      p90: percentile(scores, 0.9),
      histogram: histogram(scores, DEFAULT_SCORE_BUCKETS),
    },
    confidence_distribution: {
      mean: mean(confs),
      p10: percentile(confs, 0.1),
      p50: percentile(confs, 0.5),
      p90: percentile(confs, 0.9),
      histogram: histogram(confs, DEFAULT_CONFIDENCE_BUCKETS),
    },
    veto_count: vetoCount,
    veto_frequency: vetoFreq,
    risk_bands: countBy(rows, (r) => r.risk?.band ?? undefined),
    contribution_trace: {
      rows_with_trace: rowsWithTrace,
      mean_points_by_component: meanPointsByComponent,
      top3_frequency: top3Freq,
    },
    scope_kinds: countBy(rows, (r) => r.scope_kind ?? undefined),
  };
}

export interface DcSummary {
  total: number;
  /** % of DCs that have ≥1 evidence row from each source. */
  source_coverage: Record<string, number>;
  evidence_count_histogram: Record<string, number>;
  evidence_count_distribution: { mean: number; p10: number; p50: number; p90: number };
  /** Frequency of confidence.gate_triggers across all DCs. */
  gate_triggers: Record<string, number>;
  narrative_status: Record<string, number>;
  confidence_bands: Record<string, number>;
  risk_bands: Record<string, number>;
  /** Non-empty rate for each major section (0..1). */
  section_fill_rate: {
    what_changed: number;
    causal_signals: number;
    related_signals: number;
    recent_changes: number;
    historical_analogs: number;
    recommended_next_step: number;
    why_this_matters: number;
  };
  /** Count of DCs with zero evidence — should be 0 in a healthy system. */
  zero_evidence_count: number;
  /** Count of DCs that triggered each cross-source / freshness gate. */
  freshness_gates_count: number;
  coverage_gates_count: number;
}

const FRESHNESS_GATES = new Set([
  "RC_DC_STALE_SIGNALS",
  "RC_DC_NO_RECENT_OBSERVATION",
]);
const COVERAGE_GATES = new Set([
  "RC_DC_LOW_COVERAGE",
  "RC_DC_LIMITED_CROSS_SOURCE",
]);

const KNOWN_SOURCES = ["gsc", "ga4", "google_ads", "semrush", "serp", "operator", "model", "ads_mutation", "outcome_learning", "prior_action"];

export function summarizeDecisionContexts(rows: DcRow[]): DcSummary {
  const total = rows.length;
  const safeRate = (n: number) => (total === 0 ? 0 : n / total);

  // Source coverage.
  const sourceHits: Record<string, number> = {};
  for (const src of KNOWN_SOURCES) sourceHits[src] = 0;
  for (const r of rows) {
    const sources = new Set<string>();
    for (const e of r.evidence ?? []) {
      if (e?.source) sources.add(e.source);
    }
    for (const s of sources) sourceHits[s] = (sourceHits[s] ?? 0) + 1;
  }
  const sourceCoverage: Record<string, number> = {};
  for (const k of Object.keys(sourceHits)) sourceCoverage[k] = safeRate(sourceHits[k]);

  // Evidence counts.
  const evidenceCounts = rows.map((r) => (Array.isArray(r.evidence) ? r.evidence.length : 0));
  const evHist = histogram(evidenceCounts, DEFAULT_EVIDENCE_COUNT_BUCKETS);
  const evDist = {
    mean: mean(evidenceCounts),
    p10: percentile(evidenceCounts, 0.1),
    p50: percentile(evidenceCounts, 0.5),
    p90: percentile(evidenceCounts, 0.9),
  };

  // Gate-trigger frequency.
  const gateFreq: Record<string, number> = {};
  let freshnessCount = 0;
  let coverageCount = 0;
  for (const r of rows) {
    const triggers = r.confidence?.gate_triggers ?? [];
    let sawFreshness = false;
    let sawCoverage = false;
    for (const g of triggers) {
      gateFreq[g] = (gateFreq[g] ?? 0) + 1;
      if (FRESHNESS_GATES.has(g)) sawFreshness = true;
      if (COVERAGE_GATES.has(g)) sawCoverage = true;
    }
    if (sawFreshness) freshnessCount++;
    if (sawCoverage) coverageCount++;
  }

  // Section fill rates.
  const has = (v: unknown[] | null | undefined) => Array.isArray(v) && v.length > 0;
  const fill = {
    what_changed: safeRate(rows.filter((r) => has(r.what_changed ?? null)).length),
    causal_signals: safeRate(rows.filter((r) => has(r.causal_signals ?? null)).length),
    related_signals: safeRate(rows.filter((r) => has(r.related_signals ?? null)).length),
    recent_changes: safeRate(rows.filter((r) => has(r.recent_changes ?? null)).length),
    historical_analogs: safeRate(rows.filter((r) => has(r.historical_analogs ?? null)).length),
    recommended_next_step: safeRate(rows.filter((r) => !!r.recommended_next_step).length),
    why_this_matters: safeRate(rows.filter((r) => !!r.why_this_matters).length),
  };

  const narrativeStatus = countBy(rows, (r) => r.confidence?.narrative_status ?? undefined);

  return {
    total,
    source_coverage: sourceCoverage,
    evidence_count_histogram: evHist,
    evidence_count_distribution: evDist,
    gate_triggers: gateFreq,
    narrative_status: narrativeStatus,
    confidence_bands: countBy(rows, (r) => r.confidence?.band ?? undefined),
    risk_bands: countBy(rows, (r) => {
      const raw = r.risk;
      if (raw && typeof raw === "object" && "band" in (raw as Record<string, unknown>)) {
        const b = (raw as { band?: unknown }).band;
        return typeof b === "string" ? b : undefined;
      }
      return undefined;
    }),
    section_fill_rate: fill,
    zero_evidence_count: rows.filter((r) => !Array.isArray(r.evidence) || r.evidence.length === 0).length,
    freshness_gates_count: freshnessCount,
    coverage_gates_count: coverageCount,
  };
}

// ---------------------------------------------------------------------------
// Sampling (deterministic).
// ---------------------------------------------------------------------------

export interface CalibrationSamples {
  top_scores: ScoreRow[];
  bottom_scores: ScoreRow[];
  vetoed_scores: ScoreRow[];
  low_confidence_scores: ScoreRow[];
  top_verdicts: VerdictRow[];
  zero_evidence_dcs: DcRow[];
  narrative_rejected_dcs: DcRow[];
  high_confidence_dcs: DcRow[];
  low_confidence_dcs: DcRow[];
}

export function buildSamples(
  verdicts: VerdictRow[],
  scores: ScoreRow[],
  dcs: DcRow[],
  n: number,
): CalibrationSamples {
  const numeric = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : Number.NEGATIVE_INFINITY);
  const dcConfidenceValue = (r: DcRow) =>
    typeof r.confidence?.value === "number" && Number.isFinite(r.confidence.value)
      ? r.confidence.value
      : Number.NEGATIVE_INFINITY;
  const nonVetoed = scores.filter((s) => !(Array.isArray(s.vetoes_triggered) && s.vetoes_triggered.length > 0));

  return {
    top_scores: [...nonVetoed].sort((a, b) => numeric(b.score) - numeric(a.score) || a.id.localeCompare(b.id)).slice(0, n),
    bottom_scores: [...nonVetoed].sort((a, b) => numeric(a.score) - numeric(b.score) || a.id.localeCompare(b.id)).slice(0, n),
    vetoed_scores: scores.filter((s) => Array.isArray(s.vetoes_triggered) && s.vetoes_triggered.length > 0).slice(0, n),
    low_confidence_scores: [...scores]
      .filter((s) => typeof s.confidence === "number" && (s.confidence as number) < 0.4)
      .sort((a, b) => numeric(a.confidence) - numeric(b.confidence) || a.id.localeCompare(b.id))
      .slice(0, n),
    top_verdicts: [...verdicts]
      .sort((a, b) => numeric(b.commercial_intent_score) - numeric(a.commercial_intent_score) || a.id.localeCompare(b.id))
      .slice(0, n),
    zero_evidence_dcs: dcs.filter((r) => !Array.isArray(r.evidence) || r.evidence.length === 0).slice(0, n),
    narrative_rejected_dcs: dcs
      .filter((r) => r.confidence?.narrative_status === "failed")
      .slice(0, n),
    high_confidence_dcs: [...dcs]
      .sort((a, b) => dcConfidenceValue(b) - dcConfidenceValue(a) || a.id.localeCompare(b.id))
      .slice(0, n),
    low_confidence_dcs: [...dcs]
      .sort((a, b) => dcConfidenceValue(a) - dcConfidenceValue(b) || a.id.localeCompare(b.id))
      .slice(0, n),
  };
}

// ---------------------------------------------------------------------------
// Top-level summary builder.
// ---------------------------------------------------------------------------

export interface ShadowRunSummary {
  verdicts: VerdictSummary;
  scores: ScoreSummary;
  decision_contexts: DcSummary;
  cross: {
    /** Action items missing a decision_context row. */
    action_items_total: number;
    action_items_with_dc: number;
    action_items_missing_dc: number;
    /** Opportunity scores missing a confidence band. */
    scores_missing_confidence_band: number;
  };
}

export function buildSummary(
  verdicts: VerdictRow[],
  scores: ScoreRow[],
  dcs: DcRow[],
  cross: {
    action_items_total: number;
    action_items_with_dc: number;
    scores_missing_confidence_band: number;
  },
): ShadowRunSummary {
  return {
    verdicts: summarizeVerdicts(verdicts),
    scores: summarizeScores(scores),
    decision_contexts: summarizeDecisionContexts(dcs),
    cross: {
      action_items_total: cross.action_items_total,
      action_items_with_dc: cross.action_items_with_dc,
      action_items_missing_dc: Math.max(0, cross.action_items_total - cross.action_items_with_dc),
      scores_missing_confidence_band: cross.scores_missing_confidence_band,
    },
  };
}
