import { describe, expect, it } from "vitest";

import {
  buildSamples,
  buildSummary,
  countBy,
  histogram,
  mean,
  percentile,
  summarizeDecisionContexts,
  summarizeScores,
  summarizeVerdicts,
  topK,
  type DcRow,
  type ScoreRow,
  type VerdictRow,
} from "../../supabase/functions/_shared/shadow-run/index.ts";

// ---------------------------------------------------------------------------
// Numeric primitives
// ---------------------------------------------------------------------------

describe("percentile", () => {
  it("returns NaN for empty input", () => {
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });

  it("returns the single value for one-element input", () => {
    expect(percentile([42], 0.1)).toBe(42);
    expect(percentile([42], 0.99)).toBe(42);
  });

  it("computes p10/p50/p90 on 1..10 deterministically", () => {
    const vs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(vs, 0.0)).toBe(1);
    expect(percentile(vs, 1.0)).toBe(10);
    expect(percentile(vs, 0.5)).toBeCloseTo(5.5, 5);
    expect(percentile(vs, 0.1)).toBeCloseTo(1.9, 5);
    expect(percentile(vs, 0.9)).toBeCloseTo(9.1, 5);
  });

  it("is stable regardless of input order", () => {
    expect(percentile([3, 1, 4, 1, 5, 9, 2, 6], 0.5)).toEqual(
      percentile([9, 6, 5, 4, 3, 2, 1, 1], 0.5),
    );
  });
});

describe("mean", () => {
  it("returns NaN for empty", () => {
    expect(Number.isNaN(mean([]))).toBe(true);
  });
  it("averages correctly", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("histogram", () => {
  const buckets = [
    { label: "0-20", gte: 0, lt: 20 },
    { label: "20-40", gte: 20, lt: 40 },
    { label: "40-60", gte: 40, lt: 60 },
    { label: "60-80", gte: 60, lt: 80 },
    { label: "80-100", gte: 80, lt: 100 },
  ];

  it("assigns each value to exactly one bucket", () => {
    const h = histogram([0, 19.9, 20, 50, 80, 99.9, 100], buckets);
    expect(h["0-20"]).toBe(2); // 0, 19.9
    expect(h["20-40"]).toBe(1); // 20
    expect(h["40-60"]).toBe(1); // 50
    expect(h["60-80"]).toBe(0);
    expect(h["80-100"]).toBe(3); // 80, 99.9, 100 (last bucket inclusive)
  });

  it("ignores non-finite values", () => {
    const h = histogram([Number.NaN, Number.POSITIVE_INFINITY, 10], buckets);
    expect(h["0-20"]).toBe(1);
  });

  it("returns zero map for empty input", () => {
    const h = histogram([], buckets);
    expect(Object.values(h).every((c) => c === 0)).toBe(true);
  });
});

describe("countBy / topK", () => {
  it("counts categorical keys and skips nullish", () => {
    const out = countBy(
      [{ k: "a" }, { k: "a" }, { k: "b" }, { k: null }, { k: undefined }],
      (r) => r.k as string | null | undefined,
    );
    expect(out).toEqual({ a: 2, b: 1 });
  });

  it("topK ranks by count then key", () => {
    const tk = topK({ z: 2, a: 2, b: 3 }, 2);
    expect(tk).toEqual([
      { key: "b", count: 3 },
      { key: "a", count: 2 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// summarizeScores
// ---------------------------------------------------------------------------

function score(id: string, overrides: Partial<ScoreRow> = {}): ScoreRow {
  return {
    id,
    scope_kind: "keyword",
    scope_id: `kw:${id}`,
    score: 50,
    score_band: "medium",
    confidence: 0.6,
    confidence_band: "medium",
    components: { buyer_intent: 0.5 },
    vetoes_triggered: [],
    contribution_trace: [],
    expected_impact: { p50: 1000, currency: "SEK", horizon_days: 90 },
    risk: { band: "low", drivers: [] },
    ...overrides,
  };
}

describe("summarizeScores", () => {
  it("empty input → zero summary", () => {
    const s = summarizeScores([]);
    expect(s.total).toBe(0);
    expect(s.veto_count).toBe(0);
    expect(s.contribution_trace.rows_with_trace).toBe(0);
    expect(Number.isNaN(s.score_distribution.mean)).toBe(true);
  });

  it("computes score band counts", () => {
    const rows = [
      score("a", { score_band: "high" }),
      score("b", { score_band: "high" }),
      score("c", { score_band: "low" }),
      score("d", { score_band: "veto" }),
    ];
    const s = summarizeScores(rows);
    expect(s.score_bands).toEqual({ high: 2, low: 1, veto: 1 });
    expect(s.total).toBe(4);
  });

  it("counts vetoes and their frequency map", () => {
    const rows = [
      score("a", { vetoes_triggered: ["VETO_LANDING_PAGE", "VETO_BRAND"] }),
      score("b", { vetoes_triggered: ["VETO_LANDING_PAGE"] }),
      score("c", { vetoes_triggered: [] }),
    ];
    const s = summarizeScores(rows);
    expect(s.veto_count).toBe(2);
    expect(s.veto_frequency).toEqual({ VETO_LANDING_PAGE: 2, VETO_BRAND: 1 });
  });

  it("aggregates contribution_trace per component", () => {
    const rows = [
      score("a", {
        contribution_trace: [
          { component: "buyer_intent", points_contributed: 18, weight: 25, rank: 1 },
          { component: "business_fit", points_contributed: 10, weight: 20, rank: 2 },
          { component: "serp_weakness", points_contributed: 6, weight: 15, rank: 3 },
          { component: "conversion_likelihood", points_contributed: 2, weight: 10, rank: 4 },
        ],
      }),
      score("b", {
        contribution_trace: [
          { component: "buyer_intent", points_contributed: 12, weight: 25, rank: 1 },
          { component: "serp_weakness", points_contributed: 9, weight: 15, rank: 2 },
          { component: "business_fit", points_contributed: 3, weight: 20, rank: 3 },
        ],
      }),
    ];
    const s = summarizeScores(rows);
    expect(s.contribution_trace.rows_with_trace).toBe(2);
    expect(s.contribution_trace.mean_points_by_component.buyer_intent).toBeCloseTo(15, 5);
    expect(s.contribution_trace.mean_points_by_component.business_fit).toBeCloseTo(6.5, 5);
    expect(s.contribution_trace.top3_frequency.buyer_intent).toBe(2);
    expect(s.contribution_trace.top3_frequency.serp_weakness).toBe(2);
    // conversion_likelihood is rank 4 in row a; not in top-3 of either row.
    expect(s.contribution_trace.top3_frequency.conversion_likelihood ?? 0).toBe(0);
  });

  it("computes score distribution percentiles", () => {
    const rows = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) =>
      score(`s${i}`, { score: v }),
    );
    const s = summarizeScores(rows);
    expect(s.score_distribution.p50).toBeCloseTo(55, 5);
    expect(s.score_distribution.mean).toBeCloseTo(55, 5);
  });

  it("counts risk bands", () => {
    const rows = [
      score("a", { risk: { band: "low", drivers: [] } }),
      score("b", { risk: { band: "critical", drivers: [] } }),
      score("c", { risk: { band: "low", drivers: [] } }),
    ];
    const s = summarizeScores(rows);
    expect(s.risk_bands).toEqual({ low: 2, critical: 1 });
  });
});

// ---------------------------------------------------------------------------
// summarizeVerdicts
// ---------------------------------------------------------------------------

function verdict(id: string, overrides: Partial<VerdictRow> = {}): VerdictRow {
  return {
    id,
    keyword: `keyword ${id}`,
    search_intent: "commercial",
    buyer_stage: "solution_aware",
    commercial_intent_score: 0.6,
    business_relevance_score: 0.7,
    conversion_likelihood: 0.5,
    serp_competitiveness: 0.4,
    commoditization_score: 0.3,
    lead_quality_proxy: "medium",
    suggested_acquisition_approach: "seo_content",
    estimated_commercial_value: { p10: 500, p50: 2000, p90: 8000, currency: "SEK" },
    confidence: 0.65,
    evidence: [{ source: "serp" }],
    model_version: "v1",
    ...overrides,
  };
}

describe("summarizeVerdicts", () => {
  it("empty input is safe", () => {
    const s = summarizeVerdicts([]);
    expect(s.total).toBe(0);
    expect(s.zero_evidence_count).toBe(0);
    expect(s.expected_value_sek).toBeNull();
  });

  it("counts intent/buyer_stage/lead_quality distributions", () => {
    const rows = [
      verdict("a", { search_intent: "transactional", buyer_stage: "ready_to_buy", lead_quality_proxy: "high" }),
      verdict("b", { search_intent: "commercial", buyer_stage: "solution_aware", lead_quality_proxy: "medium" }),
      verdict("c", { search_intent: "commercial", buyer_stage: "solution_aware", lead_quality_proxy: "medium" }),
      verdict("d", { search_intent: "informational", buyer_stage: "problem_aware", lead_quality_proxy: "low" }),
    ];
    const s = summarizeVerdicts(rows);
    expect(s.search_intent).toEqual({ transactional: 1, commercial: 2, informational: 1 });
    expect(s.buyer_stage.solution_aware).toBe(2);
    expect(s.lead_quality).toEqual({ high: 1, medium: 2, low: 1 });
  });

  it("counts rows with empty evidence as zero_evidence_count", () => {
    const rows = [
      verdict("a", { evidence: [] }),
      verdict("b", { evidence: null as any }),
      verdict("c"),
    ];
    const s = summarizeVerdicts(rows);
    expect(s.zero_evidence_count).toBe(2);
  });

  it("aggregates expected_value_sek p50 distribution", () => {
    const rows = [
      verdict("a", { estimated_commercial_value: { p10: 100, p50: 1000, p90: 5000, currency: "SEK" } }),
      verdict("b", { estimated_commercial_value: { p10: 200, p50: 3000, p90: 8000, currency: "SEK" } }),
    ];
    const s = summarizeVerdicts(rows);
    expect(s.expected_value_sek?.mean_p50).toBeCloseTo(2000, 5);
  });
});

// ---------------------------------------------------------------------------
// summarizeDecisionContexts
// ---------------------------------------------------------------------------

function dc(id: string, overrides: Partial<DcRow> = {}): DcRow {
  return {
    id,
    action_item_id: `ai-${id}`,
    ads_change_proposal_id: null,
    scope: { kind: "site", ids: ["site:1"] },
    why_this_matters: null,
    what_changed: [{ metric: "clicks" }],
    causal_signals: [],
    related_signals: [],
    recent_changes: [],
    historical_analogs: [],
    evidence: [
      { id: "e1", source: "gsc", observed_at: "2026-05-20" },
      { id: "e2", source: "ga4", observed_at: "2026-05-20" },
    ],
    expected_impact: null,
    risk: { band: "low", drivers: [] },
    confidence: { value: 0.6, band: "medium", gate_triggers: [], narrative_status: "skipped" },
    recommended_next_step: "test something",
    ...overrides,
  };
}

describe("summarizeDecisionContexts", () => {
  it("empty input → total 0, zero rates", () => {
    const s = summarizeDecisionContexts([]);
    expect(s.total).toBe(0);
    expect(s.section_fill_rate.what_changed).toBe(0);
    expect(s.evidence_count_distribution.mean).toBeNaN();
  });

  it("computes per-source coverage rates", () => {
    const rows = [
      dc("a", { evidence: [{ id: "e1", source: "gsc" }] }),
      dc("b", { evidence: [{ id: "e1", source: "gsc" }, { id: "e2", source: "ga4" }] }),
      dc("c", { evidence: [] }),
      dc("d", { evidence: [{ id: "e1", source: "operator" }] }),
    ];
    const s = summarizeDecisionContexts(rows);
    expect(s.source_coverage.gsc).toBeCloseTo(2 / 4, 5);
    expect(s.source_coverage.ga4).toBeCloseTo(1 / 4, 5);
    expect(s.source_coverage.operator).toBeCloseTo(1 / 4, 5);
    expect(s.source_coverage.semrush).toBe(0);
    expect(s.zero_evidence_count).toBe(1);
  });

  it("aggregates gate-trigger frequency and bucket counts", () => {
    const rows = [
      dc("a", {
        confidence: {
          value: 0.3,
          band: "low",
          gate_triggers: ["RC_DC_LOW_COVERAGE", "RC_DC_STALE_SIGNALS"],
          narrative_status: "skipped",
        },
      }),
      dc("b", {
        confidence: {
          value: 0.4,
          band: "medium",
          gate_triggers: ["RC_DC_LOW_COVERAGE"],
          narrative_status: "skipped",
        },
      }),
      dc("c", {
        confidence: { value: 0.7, band: "high", gate_triggers: [], narrative_status: "generated" },
      }),
    ];
    const s = summarizeDecisionContexts(rows);
    expect(s.gate_triggers.RC_DC_LOW_COVERAGE).toBe(2);
    expect(s.gate_triggers.RC_DC_STALE_SIGNALS).toBe(1);
    expect(s.coverage_gates_count).toBe(2);
    expect(s.freshness_gates_count).toBe(1);
    expect(s.narrative_status).toEqual({ skipped: 2, generated: 1 });
    expect(s.confidence_bands).toEqual({ low: 1, medium: 1, high: 1 });
  });

  it("computes section fill rates", () => {
    const rows = [
      dc("a", { what_changed: [{}], causal_signals: [], recommended_next_step: "x" }),
      dc("b", { what_changed: [], causal_signals: [{}], recommended_next_step: null }),
      dc("c", { what_changed: [{}], causal_signals: [{}], recommended_next_step: "y" }),
    ];
    const s = summarizeDecisionContexts(rows);
    expect(s.section_fill_rate.what_changed).toBeCloseTo(2 / 3, 5);
    expect(s.section_fill_rate.causal_signals).toBeCloseTo(2 / 3, 5);
    expect(s.section_fill_rate.recommended_next_step).toBeCloseTo(2 / 3, 5);
  });
});

// ---------------------------------------------------------------------------
// buildSamples
// ---------------------------------------------------------------------------

describe("buildSamples", () => {
  it("returns top/bottom non-vetoed scores ordered correctly", () => {
    const rows = [
      score("a", { score: 90 }),
      score("b", { score: 85 }),
      score("c", { score: 10, vetoes_triggered: ["VETO_X"] }),
      score("d", { score: 30 }),
      score("e", { score: 50 }),
    ];
    const samples = buildSamples([], rows, [], 2);
    expect(samples.top_scores.map((r) => r.id)).toEqual(["a", "b"]);
    expect(samples.bottom_scores.map((r) => r.id)).toEqual(["d", "e"]);
    expect(samples.vetoed_scores.map((r) => r.id)).toEqual(["c"]);
  });

  it("low_confidence_scores filters to <0.4 ordered ascending", () => {
    const rows = [
      score("a", { confidence: 0.2 }),
      score("b", { confidence: 0.6 }),
      score("c", { confidence: 0.35 }),
    ];
    const samples = buildSamples([], rows, [], 5);
    expect(samples.low_confidence_scores.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("top_verdicts ranks by commercial_intent_score desc", () => {
    const rows = [
      verdict("a", { commercial_intent_score: 0.4 }),
      verdict("b", { commercial_intent_score: 0.9 }),
      verdict("c", { commercial_intent_score: 0.7 }),
    ];
    const samples = buildSamples(rows, [], [], 2);
    expect(samples.top_verdicts.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("zero_evidence_dcs picks empty-evidence rows; narrative_rejected_dcs filters by status", () => {
    const rows = [
      dc("a", { evidence: [] }),
      dc("b", { evidence: [{ id: "e", source: "gsc" }] }),
      dc("c", { confidence: { value: 0.5, band: "medium", gate_triggers: [], narrative_status: "failed" } }),
      dc("d", { confidence: { value: 0.5, band: "medium", gate_triggers: [], narrative_status: "generated" } }),
    ];
    const samples = buildSamples([], [], rows, 5);
    expect(samples.zero_evidence_dcs.map((r) => r.id)).toEqual(["a"]);
    expect(samples.narrative_rejected_dcs.map((r) => r.id)).toEqual(["c"]);
  });

  it("high/low confidence DCs ordered by confidence.value", () => {
    const rows = [
      dc("a", { confidence: { value: 0.9, band: "high", gate_triggers: [] } }),
      dc("b", { confidence: { value: 0.3, band: "low", gate_triggers: [] } }),
      dc("c", { confidence: { value: 0.5, band: "medium", gate_triggers: [] } }),
    ];
    const samples = buildSamples([], [], rows, 2);
    expect(samples.high_confidence_dcs.map((r) => r.id)).toEqual(["a", "c"]);
    expect(samples.low_confidence_dcs.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("is deterministic across input order (stable id tie-break)", () => {
    const rows1 = [score("a", { score: 50 }), score("b", { score: 50 })];
    const rows2 = [score("b", { score: 50 }), score("a", { score: 50 })];
    const s1 = buildSamples([], rows1, [], 2);
    const s2 = buildSamples([], rows2, [], 2);
    expect(s1.top_scores.map((r) => r.id)).toEqual(s2.top_scores.map((r) => r.id));
  });
});

// ---------------------------------------------------------------------------
// buildSummary cross-section
// ---------------------------------------------------------------------------

describe("buildSummary", () => {
  it("returns a coherent top-level structure", () => {
    const out = buildSummary(
      [verdict("v1"), verdict("v2", { search_intent: "informational" })],
      [score("s1", { score: 80, score_band: "high" })],
      [dc("d1")],
      { action_items_total: 10, action_items_with_dc: 4, scores_missing_confidence_band: 1 },
    );
    expect(out.verdicts.total).toBe(2);
    expect(out.scores.total).toBe(1);
    expect(out.decision_contexts.total).toBe(1);
    expect(out.cross.action_items_total).toBe(10);
    expect(out.cross.action_items_missing_dc).toBe(6);
    expect(out.cross.scores_missing_confidence_band).toBe(1);
  });

  it("handles all-empty input safely", () => {
    const out = buildSummary([], [], [], {
      action_items_total: 0,
      action_items_with_dc: 0,
      scores_missing_confidence_band: 0,
    });
    expect(out.verdicts.total).toBe(0);
    expect(out.scores.total).toBe(0);
    expect(out.decision_contexts.total).toBe(0);
    expect(out.cross.action_items_missing_dc).toBe(0);
  });
});
