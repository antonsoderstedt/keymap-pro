import { describe, expect, it } from "vitest";

import {
  ANALOG_MIN_SIMILARITY,
  COMPONENT_LEVERS,
  DC_CONFIDENCE_BANDS,
  MODEL_VERSION,
  NEXT_STEP_MIN_FEASIBILITY,
  RELATED_MAX_PER_SOURCE,
  RISK_BAND_THRESHOLDS,
  SIGNALS_VERSION,
  WHAT_CHANGED_MAX_ITEMS,
  WHAT_CHANGED_MIN_DELTA_PCT,
  assembleEvidence,
  buildDecisionContext,
  computeDecisionConfidence,
  deriveRisk,
  extractClaimIds,
  hashCanonical,
  jaccardSimilarity,
  resolveScopeForActionItem,
  resolveScopeForAdsProposal,
  selectCausalSignals,
  selectHistoricalAnalogs,
  selectRecentChanges,
  selectRecommendedNextStep,
  selectRelatedSignals,
  selectWhatChanged,
  validateNarrative,
  type AnalogCandidate,
  type CausalCandidate,
  type ChangeCandidate,
  type ScoreSummary,
  type SignalCandidate,
} from "../../supabase/functions/_shared/decision-context/index.ts";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const NOW = "2026-06-01T12:00:00.000Z";

function delta(
  source: string,
  metric: string,
  delta_pct: number,
  opts: Partial<SignalCandidate> = {},
): SignalCandidate {
  return {
    id: `${source}:${metric}`,
    source,
    metric,
    delta_pct,
    absolute_change: Math.abs(delta_pct * 1000),
    scope_proximity: 0.9,
    direction: delta_pct > 0 ? "up" : delta_pct < 0 ? "down" : "stable",
    signal_quality: 1.0,
    observed_at: NOW,
    evidence: { id: `${source}:${metric}:ev`, source, observed_at: NOW },
    label: `${source} ${metric}`,
    ...opts,
  };
}

function baseScore(overrides: Partial<ScoreSummary["components"]> = {}): ScoreSummary {
  const components: Record<string, number> = {
    buyer_intent: 0.7,
    business_fit: 0.6,
    conversion_likelihood: 0.5,
    serp_weakness: 0.5,
    commercial_value: 0.6,
    historical_performance: 0.5,
    strategic_value: 0.5,
    operational_feasibility: 0.7,
    competition_quality: 0.5,
    landing_page_fit: 0.5,
    ...overrides,
  };
  const trace = Object.entries(components).map(([component, raw_value], i) => ({
    component,
    raw_value,
    weight: COMPONENT_LEVERS[component]?.max_points ?? 5,
    points_contributed: raw_value * (COMPONENT_LEVERS[component]?.max_points ?? 5),
    rank: i + 1,
    reason_codes: [],
  }));
  return {
    score: 65,
    score_band: "medium",
    confidence: 0.7,
    confidence_band: "medium",
    components,
    vetoes_triggered: [],
    contribution_trace: trace,
    model_version: MODEL_VERSION,
    signals_version: SIGNALS_VERSION,
  };
}

// -----------------------------------------------------------------------------
// scope.ts
// -----------------------------------------------------------------------------

describe("resolveScopeForActionItem", () => {
  it("ads_alert + ads category resolves to ads scope with campaign/ad_group ids", () => {
    const s = resolveScopeForActionItem({
      id: "a1",
      category: "ads",
      source_type: "ads_alert",
      source_payload: { campaign_id: "c1", ad_group_id: "ag1", keyword_ids: ["kw1", "kw2"] },
    });
    expect(s.kind).toBe("ads");
    expect(s.ids).toContain("campaign:c1");
    expect(s.ids).toContain("ad_group:ag1");
    expect(s.ids).toContain("keyword:kw1");
  });

  it("seo + url → page scope", () => {
    const s = resolveScopeForActionItem({
      id: "a2",
      category: "seo",
      source_type: "analysis",
      source_payload: { url: "https://x.test/p" },
    });
    expect(s.kind).toBe("page");
    expect(s.ids).toEqual(["url:https://x.test/p"]);
  });

  it("technical → site scope", () => {
    const s = resolveScopeForActionItem({ id: "a3", category: "technical", source_type: "audit" });
    expect(s.kind).toBe("site");
  });

  it("audit + cluster hint → cluster scope", () => {
    const s = resolveScopeForActionItem({
      id: "a4",
      category: "general",
      source_type: "audit",
      source_payload: { cluster_id: "cl1" },
    });
    expect(s.kind).toBe("cluster");
    expect(s.ids).toContain("cluster:cl1");
  });

  it("manual unknown → open scope", () => {
    const s = resolveScopeForActionItem({ id: "a5", category: "general", source_type: "manual" });
    expect(s.kind).toBe("open");
  });
});

describe("resolveScopeForAdsProposal", () => {
  it("always returns kind=ads and includes campaign id", () => {
    const s = resolveScopeForAdsProposal({
      id: "p1",
      rule_id: "RULE_A",
      payload: { campaign_id: "c1", ad_group_id: "ag1", keyword_id: "kw1" },
    });
    expect(s.kind).toBe("ads");
    expect(s.ids).toEqual(["campaign:c1", "ad_group:ag1", "keyword:kw1"]);
    expect(s.hints?.rule_id).toBe("RULE_A");
  });
});

// -----------------------------------------------------------------------------
// what_changed.ts
// -----------------------------------------------------------------------------

describe("selectWhatChanged", () => {
  it("filters out movements below WHAT_CHANGED_MIN_DELTA_PCT", () => {
    const cands: SignalCandidate[] = [
      delta("gsc", "clicks", WHAT_CHANGED_MIN_DELTA_PCT - 0.01),
      delta("ga4", "sessions", -0.5),
    ];
    const out = selectWhatChanged(cands);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("ga4");
  });

  it("caps at WHAT_CHANGED_MAX_ITEMS", () => {
    const cands: SignalCandidate[] = [
      delta("gsc", "clicks", 0.3),
      delta("gsc", "impressions", -0.4),
      delta("ga4", "sessions", 0.5),
      delta("ads", "cost", -0.6),
      delta("serp", "position", 0.7),
    ];
    const out = selectWhatChanged(cands);
    expect(out.length).toBeLessThanOrEqual(WHAT_CHANGED_MAX_ITEMS);
  });

  it("dedupes by (source,metric) keeping the highest-ranked", () => {
    const cands: SignalCandidate[] = [
      delta("gsc", "clicks", 0.2, { id: "a", scope_proximity: 0.3 }),
      delta("gsc", "clicks", 0.5, { id: "b", scope_proximity: 0.9 }),
    ];
    const out = selectWhatChanged(cands);
    expect(out).toHaveLength(1);
    expect(out[0].delta_pct).toBe(0.5);
  });

  it("is deterministic for identical inputs (stable tie-break)", () => {
    const cands: SignalCandidate[] = [
      delta("ga4", "sessions", 0.5, { id: "z" }),
      delta("gsc", "clicks", 0.5, { id: "a" }),
    ];
    const a = selectWhatChanged(cands);
    const b = selectWhatChanged([...cands].reverse());
    expect(a).toEqual(b);
  });
});

// -----------------------------------------------------------------------------
// causal.ts
// -----------------------------------------------------------------------------

describe("selectCausalSignals", () => {
  it("prefers recent + in-scope + high magnitude + high prior", () => {
    const cands: CausalCandidate[] = [
      { id: "c1", label: "old", days_ago: 25, scope_proximity: 0.3, magnitude: 0.3, prior_likelihood: 0.3, evidence: [] },
      { id: "c2", label: "fresh", days_ago: 1, scope_proximity: 0.9, magnitude: 0.8, prior_likelihood: 0.9, evidence: [] },
    ];
    const out = selectCausalSignals(cands);
    expect(out[0].id).toBe("c2");
  });

  it("caps at 3", () => {
    const cands: CausalCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      label: `c${i}`,
      days_ago: i,
      scope_proximity: 0.5,
      magnitude: 0.5,
      prior_likelihood: 0.5,
      evidence: [],
    }));
    expect(selectCausalSignals(cands)).toHaveLength(3);
  });
});

// -----------------------------------------------------------------------------
// related.ts
// -----------------------------------------------------------------------------

describe("selectRelatedSignals", () => {
  it("never exceeds RELATED_MAX_PER_SOURCE per source", () => {
    const cands: SignalCandidate[] = [
      delta("gsc", "a", 0.1, { id: "g1" }),
      delta("gsc", "b", 0.1, { id: "g2" }),
      delta("gsc", "c", 0.1, { id: "g3" }),
      delta("gsc", "d", 0.1, { id: "g4" }),
      delta("ga4", "e", 0.1, { id: "x1" }),
      delta("ga4", "f", 0.1, { id: "x2" }),
      delta("ads", "g", 0.1, { id: "y1" }),
    ];
    const out = selectRelatedSignals(cands);
    const bySource: Record<string, number> = {};
    for (const s of out.signals) bySource[s.source] = (bySource[s.source] ?? 0) + 1;
    for (const c of Object.values(bySource)) expect(c).toBeLessThanOrEqual(RELATED_MAX_PER_SOURCE);
  });

  it("flags limited_cross_source when fewer than 3 found", () => {
    const cands: SignalCandidate[] = [delta("gsc", "a", 0.1)];
    const out = selectRelatedSignals(cands);
    expect(out.limited_cross_source).toBe(true);
  });

  it("rewards contradicting signals (contradicts_thesis bonus)", () => {
    const cands: SignalCandidate[] = [
      delta("gsc", "a", 0.1, { id: "g1", contradicts_thesis: true, scope_proximity: 0.5 }),
      delta("ga4", "b", 0.1, { id: "x1", scope_proximity: 0.5 }),
    ];
    const out = selectRelatedSignals(cands);
    expect(out.signals[0].id).toBe("g1");
  });
});

// -----------------------------------------------------------------------------
// recent_changes.ts
// -----------------------------------------------------------------------------

describe("selectRecentChanges", () => {
  it("filters out changes older than the window", () => {
    const cands: ChangeCandidate[] = [
      { id: "old", kind: "x", label: "old", occurred_at: "2026-04-01T00:00:00.000Z" },
      { id: "new", kind: "x", label: "new", occurred_at: "2026-05-30T00:00:00.000Z" },
    ];
    const out = selectRecentChanges(cands, { now_iso: NOW });
    expect(out.map((o) => o.id)).toEqual(["new"]);
  });

  it("dedupes by entity_id keeping newest", () => {
    const cands: ChangeCandidate[] = [
      { id: "a", kind: "ads_mutation", label: "old", occurred_at: "2026-05-10T00:00:00.000Z", entity_id: "campaign:1" },
      { id: "b", kind: "ads_mutation", label: "newer", occurred_at: "2026-05-25T00:00:00.000Z", entity_id: "campaign:1" },
    ];
    const out = selectRecentChanges(cands, { now_iso: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });
});

// -----------------------------------------------------------------------------
// analogs.ts
// -----------------------------------------------------------------------------

describe("selectHistoricalAnalogs", () => {
  function analog(over: Partial<AnalogCandidate> = {}): AnalogCandidate {
    return {
      id: "an1",
      cluster_family: "construction_accounting",
      suggested_acquisition_approach: "seo_content",
      action_category: "seo",
      n: 5,
      mean_uplift_pct: 12,
      last_updated: "2026-05-20T00:00:00.000Z",
      similarity: 0.85,
      scope_kind_match: true,
      scope: "project_only",
      ...over,
    };
  }

  it("requires similarity ≥ ANALOG_MIN_SIMILARITY", () => {
    const out = selectHistoricalAnalogs(
      [analog({ similarity: ANALOG_MIN_SIMILARITY - 0.01 })],
      { now_iso: NOW },
    );
    expect(out).toHaveLength(0);
  });

  it("requires n ≥ ANALOG_MIN_N", () => {
    const out = selectHistoricalAnalogs([analog({ n: 1 })], { now_iso: NOW });
    expect(out).toHaveLength(0);
  });

  it("excludes non-project_only scopes", () => {
    const out = selectHistoricalAnalogs([analog({ scope: "org_only" })], { now_iso: NOW });
    expect(out).toHaveLength(0);
  });

  it("ranks higher-similarity first", () => {
    const out = selectHistoricalAnalogs(
      [analog({ id: "a", similarity: 0.8 }), analog({ id: "b", similarity: 0.95 })],
      { now_iso: NOW },
    );
    expect(out[0].id).toBe("b");
  });
});

describe("jaccardSimilarity", () => {
  it("is 1.0 for identical inputs", () => {
    expect(jaccardSimilarity("foo bar baz", "baz foo bar")).toBe(1);
  });
  it("is 0 for disjoint inputs", () => {
    expect(jaccardSimilarity("alpha", "omega")).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// risk.ts
// -----------------------------------------------------------------------------

describe("deriveRisk", () => {
  it("returns low for neutral components", () => {
    const r = deriveRisk(baseScore());
    expect(r.band).toBe("low");
    expect(r.drivers).toHaveLength(0);
  });

  it("returns critical when vetoes present (severity 0.50)", () => {
    const s = baseScore();
    s.vetoes_triggered = ["BAN_LIST_HIT"];
    const r = deriveRisk(s);
    expect(["high", "critical"]).toContain(r.band);
    expect(r.drivers).toContain("Veto registrerat på scopet");
  });

  it("respects band thresholds", () => {
    expect(RISK_BAND_THRESHOLDS.low).toBeLessThan(RISK_BAND_THRESHOLDS.medium);
    expect(RISK_BAND_THRESHOLDS.medium).toBeLessThan(RISK_BAND_THRESHOLDS.high);
  });
});

// -----------------------------------------------------------------------------
// evidence.ts
// -----------------------------------------------------------------------------

describe("assembleEvidence", () => {
  it("dedupes by (source, source_id, observed_at) and caps at 8", () => {
    const refs = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      source: "gsc",
      source_id: `${i % 5}`,
      observed_at: NOW,
    }));
    const out = assembleEvidence([], [], [], refs);
    expect(out.length).toBeLessThanOrEqual(8);
    // 5 distinct source_ids → exactly 5 unique
    expect(out.length).toBe(5);
  });
});

// -----------------------------------------------------------------------------
// next_step.ts
// -----------------------------------------------------------------------------

describe("selectRecommendedNextStep", () => {
  it("returns null when feasibility below threshold", () => {
    const s = baseScore({ operational_feasibility: NEXT_STEP_MIN_FEASIBILITY - 0.01 });
    expect(selectRecommendedNextStep(s)).toBeNull();
  });

  it("picks the lever phrase for the weakest component", () => {
    const s = baseScore({ landing_page_fit: 0.05 });
    const phrase = selectRecommendedNextStep(s);
    expect(phrase).toBe(COMPONENT_LEVERS.landing_page_fit.label);
  });
});

// -----------------------------------------------------------------------------
// confidence.ts
// -----------------------------------------------------------------------------

describe("computeDecisionConfidence", () => {
  it("returns high band when coverage + confidence + freshness are strong", () => {
    const c = computeDecisionConfidence({
      what_changed_count: 3,
      causal_count: 3,
      related_count: 5,
      stale_days: 0,
      scoring_confidence: 0.9,
      limited_cross_source: false,
    });
    expect(c.band).toBe("high");
    expect(c.value).toBeGreaterThanOrEqual(DC_CONFIDENCE_BANDS.high);
    expect(c.gate_triggers).toHaveLength(0);
  });

  it("fires gates when coverage/freshness/scoring are weak", () => {
    const c = computeDecisionConfidence({
      what_changed_count: 0,
      causal_count: 0,
      related_count: 1,
      stale_days: 30,
      scoring_confidence: 0.1,
      limited_cross_source: true,
    });
    expect(c.band).toBe("low");
    expect(c.gate_triggers).toContain("RC_DC_LOW_COVERAGE");
    expect(c.gate_triggers).toContain("RC_DC_STALE_SIGNALS");
    expect(c.gate_triggers).toContain("RC_DC_SCORING_LOW_CONFIDENCE");
    expect(c.gate_triggers).toContain("RC_DC_LIMITED_CROSS_SOURCE");
  });

  it("fires RC_DC_NO_OPPORTUNITY_SCORE when scoring_confidence is null", () => {
    const c = computeDecisionConfidence({
      what_changed_count: 3,
      causal_count: 3,
      related_count: 5,
      stale_days: 0,
      scoring_confidence: null,
      limited_cross_source: false,
    });
    expect(c.gate_triggers).toContain("RC_DC_NO_OPPORTUNITY_SCORE");
  });
});

// -----------------------------------------------------------------------------
// narrative.ts
// -----------------------------------------------------------------------------

describe("validateNarrative", () => {
  it("accepts narrative that cites only known evidence ids", () => {
    const r = validateNarrative("Clicks ned [[ev:gsc1]] medan sessions ner [[ev:ga41]].", ["gsc1", "ga41"]);
    expect(r.ok).toBe(true);
    expect(r.has_citations).toBe(true);
  });

  it("rejects narrative that invents an id", () => {
    const r = validateNarrative("Lögn [[ev:fake]].", ["gsc1"]);
    expect(r.ok).toBe(false);
    expect(r.missing_ids).toEqual(["fake"]);
  });

  it("rejects ungrounded narrative without any citation", () => {
    const r = validateNarrative("Generisk text utan källa.", ["gsc1"]);
    expect(r.ok).toBe(false);
    expect(r.has_citations).toBe(false);
  });

  it("extractClaimIds returns all distinct ids", () => {
    expect(extractClaimIds("a [[ev:x]] b [[ev:y]] c [[ev:x]]")).toEqual(["x", "y", "x"]);
  });
});

// -----------------------------------------------------------------------------
// build.ts — end-to-end determinism + idempotency hash
// -----------------------------------------------------------------------------

describe("buildDecisionContext", () => {
  function input() {
    return {
      project_id: "p1",
      scope: { kind: "ads", ids: ["campaign:c1"] },
      opportunity_score: baseScore(),
      now_iso: NOW,
      delta_candidates: [
        delta("gsc", "clicks", -0.30, { id: "gsc1" }),
        delta("ga4", "sessions", -0.25, { id: "ga41" }),
        delta("ads", "cost", 0.15, { id: "ads1" }),
      ] as SignalCandidate[],
      causal_candidates: [
        {
          id: "c1",
          label: "LP-uppdatering",
          days_ago: 5,
          scope_proximity: 0.9,
          magnitude: 0.6,
          prior_likelihood: 0.7,
          evidence: [{ id: "lp1", source: "lp", source_id: "u1" }],
        },
      ] as CausalCandidate[],
      related_candidates: [
        delta("gsc", "ctr", -0.12, { id: "gsc2" }),
        delta("ga4", "conversions", -0.20, { id: "ga42" }),
        delta("serp", "volatility", 0.30, { id: "serp1" }),
      ] as SignalCandidate[],
      change_candidates: [
        {
          id: "m1",
          kind: "ads_mutation",
          label: "Budhöjning",
          occurred_at: "2026-05-30T00:00:00.000Z",
          entity_id: "campaign:c1",
        },
      ] as ChangeCandidate[],
      analog_candidates: [
        {
          id: "an1",
          cluster_family: "construction_accounting",
          suggested_acquisition_approach: "seo_content",
          action_category: "seo",
          n: 5,
          mean_uplift_pct: 12,
          last_updated: "2026-05-20T00:00:00.000Z",
          similarity: 0.9,
          scope_kind_match: true,
          scope: "project_only" as const,
        },
      ] as AnalogCandidate[],
      action_intent_direction: "down" as const,
      oldest_signal_days: 0,
    };
  }

  it("produces all required sections", async () => {
    const { context } = await buildDecisionContext(input());
    expect(context.model_version).toBe(MODEL_VERSION);
    expect(context.signals_version).toBe(SIGNALS_VERSION);
    expect(context.what_changed.length).toBeGreaterThan(0);
    expect(context.causal_signals.length).toBeGreaterThan(0);
    expect(context.related_signals.length).toBeGreaterThan(0);
    expect(context.historical_analogs.length).toBeGreaterThan(0);
    expect(context.risk).not.toBeNull();
    expect(context.evidence.length).toBeGreaterThan(0);
  });

  it("is reproducible — same inputs produce identical inputs_hash and section content", async () => {
    const a = await buildDecisionContext(input());
    const b = await buildDecisionContext(input());
    expect(a.inputs_hash).toBe(b.inputs_hash);
    expect(a.context.what_changed).toEqual(b.context.what_changed);
    expect(a.context.causal_signals).toEqual(b.context.causal_signals);
    expect(a.context.related_signals).toEqual(b.context.related_signals);
  });

  it("different inputs yield different inputs_hash", async () => {
    const a = await buildDecisionContext(input());
    const mutated = input();
    mutated.delta_candidates[0].delta_pct = -0.45;
    const b = await buildDecisionContext(mutated);
    expect(a.inputs_hash).not.toBe(b.inputs_hash);
  });

  it("excludes narrative content (worker concern, not pure-build concern)", async () => {
    const { context } = await buildDecisionContext(input());
    expect(context.why_this_matters).toBeNull();
    expect(context.narrative_status).toBe("pending");
  });

  it("emits gate codes when signal coverage is poor", async () => {
    const sparse = input();
    sparse.delta_candidates = [];
    sparse.causal_candidates = [];
    sparse.related_candidates = [];
    sparse.oldest_signal_days = 14;
    const { context } = await buildDecisionContext(sparse);
    expect(context.confidence.band).toBe("low");
    expect(context.confidence.gate_triggers).toContain("RC_DC_LOW_COVERAGE");
    expect(context.confidence.gate_triggers).toContain("RC_DC_STALE_SIGNALS");
  });

  it("flags primarily generic context for scope-specific rows without scope anchors", async () => {
    const scoped = input();
    scoped.scope = { kind: "page", ids: ["url:https://x.test/p"] };
    scoped.causal_candidates = [];
    scoped.change_candidates = [];
    scoped.analog_candidates = [];
    scoped.delta_candidates = [
      delta("ga4", "sessions", -0.22, { id: "ga4-s1" }),
    ];
    scoped.related_candidates = [
      delta("gsc", "clicks", -0.18, { id: "gsc-r1" }),
      delta("ga4", "users", -0.2, { id: "ga4-r2" }),
      delta("gsc", "impressions", -0.11, { id: "gsc-r3" }),
    ];

    const { context } = await buildDecisionContext(scoped);
    expect(context.confidence.gate_triggers).toContain("RC_DC_PRIMARILY_GENERIC_CONTEXT");
  });
});

describe("hashCanonical (re-exported)", () => {
  it("is stable for object key reordering", async () => {
    const a = await hashCanonical({ a: 1, b: 2, c: [1, 2] });
    const b = await hashCanonical({ c: [1, 2], b: 2, a: 1 });
    expect(a).toBe(b);
  });
});
