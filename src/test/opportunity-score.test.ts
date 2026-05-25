import { describe, it, expect } from "vitest";

import {
  MODEL_VERSION,
  PROFILE_WEIGHTS,
  SCORE_COMPONENTS,
  SIGNALS_VERSION,
  AGGRESSIVENESS_MULT,
  LEARNING_MAX_ABS_POINTS,
} from "../../supabase/functions/_shared/scoring/constants.ts";
import {
  scoreAllComponents,
  type ScoreInput,
} from "../../supabase/functions/_shared/scoring/components.ts";
import { computeConfidence } from "../../supabase/functions/_shared/scoring/confidence.ts";
import { buildContributionTrace } from "../../supabase/functions/_shared/scoring/trace.ts";
import { applyOperatorControls } from "../../supabase/functions/_shared/scoring/operator_controls.ts";
import { computeLearningAdjustment } from "../../supabase/functions/_shared/scoring/learning.ts";
import { scoreOpportunity } from "../../supabase/functions/_shared/scoring/score.ts";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function baseVerdict(overrides: Partial<ScoreInput["verdict"]> = {}): ScoreInput["verdict"] {
  return {
    keyword: "ekonomisystem för byggföretag",
    normalized_keyword: "ekonomisystem för byggföretag",
    search_intent: "commercial",
    buyer_stage: "solution_aware",
    commercial_intent_score: 0.7,
    business_relevance_score: 0.8,
    conversion_likelihood: 0.5,
    serp_competitiveness: 0.4,
    commoditization_score: 0.2,
    estimated_commercial_value: { p10: 200, p50: 1000, p90: 5000, currency: "SEK" },
    evidence: [
      { id: "kw_metrics:1", source: "keyword_metrics", freshness_days: 7 },
      { id: "semrush:1", source: "semrush", freshness_days: 14 },
    ],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    scope_kind: "keyword",
    scope_id: "ekonomisystem för byggföretag",
    verdict: baseVerdict(),
    business_model: {
      workspace_profile: "b2b_service",
      aggressiveness_profile: "balanced",
      lead_quality_target: "balanced",
      service_priority: { svc1: 0.8 },
      fulfillment_capacity: { svc1: "unconstrained" },
      strategic_importance: { theme1: "core" },
    },
    mapped_service_id: "svc1",
    mapped_theme_id: "theme1",
    matching_learnings: [],
    ...overrides,
  };
}

const NOW = "2026-05-25T12:00:00.000Z";

// -----------------------------------------------------------------------------
// constants — invariants
// -----------------------------------------------------------------------------

describe("constants", () => {
  it("MODEL_VERSION is opportunity-score-v1.0.0", () => {
    expect(MODEL_VERSION).toBe("opportunity-score-v1.0.0");
  });
  it("SIGNALS_VERSION matches signals-v1.0.0", () => {
    expect(SIGNALS_VERSION).toBe("signals-v1.0.0");
  });
  it("every profile's weights sum to exactly 100", () => {
    for (const [profile, weights] of Object.entries(PROFILE_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
      for (const c of SCORE_COMPONENTS) {
        expect(weights[c]).toBeGreaterThan(0);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// components — every component produces raw 0..1 and reason codes
// -----------------------------------------------------------------------------

describe("scoreAllComponents", () => {
  it("returns one entry per locked component, all raws 0..1", () => {
    const r = scoreAllComponents(baseInput());
    for (const c of SCORE_COMPONENTS) {
      expect(r[c]).toBeDefined();
      expect(r[c].raw).toBeGreaterThanOrEqual(0);
      expect(r[c].raw).toBeLessThanOrEqual(1);
    }
  });

  it("uses NEUTRAL fallback (0.5) + RC_INSUFFICIENT_SIGNAL when landing page missing", () => {
    const r = scoreAllComponents(baseInput({ landing_page_fit: null }));
    expect(r.landing_page_fit.raw).toBe(0.5);
    expect(r.landing_page_fit.reason_codes).toContain("RC_INSUFFICIENT_SIGNAL");
  });

  it("uses NEUTRAL fallback when no matching_learnings", () => {
    const r = scoreAllComponents(baseInput({ matching_learnings: [] }));
    expect(r.historical_performance.raw).toBe(0.5);
    expect(r.historical_performance.reason_codes).toContain("RC_INSUFFICIENT_SIGNAL");
  });

  it("commercial_value monotonically increases with p50", () => {
    const low = scoreAllComponents(baseInput({
      verdict: baseVerdict({ estimated_commercial_value: { p10: 10, p50: 100, p90: 500, currency: "SEK" } }),
    })).commercial_value.raw;
    const high = scoreAllComponents(baseInput({
      verdict: baseVerdict({ estimated_commercial_value: { p10: 100, p50: 5000, p90: 20000, currency: "SEK" } }),
    })).commercial_value.raw;
    expect(high).toBeGreaterThan(low);
  });

  it("serp_weakness is 1 - competitiveness in the simple case", () => {
    const r = scoreAllComponents(baseInput({
      verdict: baseVerdict({ serp_competitiveness: 0.2, commoditization_score: 0 }),
    }));
    expect(r.serp_weakness.raw).toBeCloseTo(0.8, 5);
  });

  it("operational_feasibility=suspended emits RC_CAPACITY_SUSPENDED", () => {
    const r = scoreAllComponents(baseInput({
      business_model: {
        workspace_profile: "b2b_service",
        aggressiveness_profile: "balanced",
        lead_quality_target: "balanced",
        fulfillment_capacity: { svc1: "suspended" },
      },
    }));
    expect(r.operational_feasibility.reason_codes).toContain("RC_CAPACITY_SUSPENDED");
    expect(r.operational_feasibility.raw).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// computeConfidence — locked formula + gate caps
// -----------------------------------------------------------------------------

describe("computeConfidence", () => {
  it("perfect inputs hit ~0.85 ceiling (sum of positive coeffs)", () => {
    const c = computeConfidence({
      coverage: 1, agreement: 1, freshness: 1,
      historical_certainty: 1, prior_strength: 1, contradiction_penalty: 0,
    });
    expect(c.value).toBeCloseTo(0.85, 6);
    expect(c.band).toBe("high");
    expect(c.gate_triggers).toHaveLength(0);
  });
  it("coverage<0.5 caps value to 0.5 and triggers low_coverage", () => {
    const c = computeConfidence({
      coverage: 0.2, agreement: 1, freshness: 1,
      historical_certainty: 1, prior_strength: 1, contradiction_penalty: 0,
    });
    expect(c.value).toBeLessThanOrEqual(0.5);
    expect(c.gate_triggers).toContain("low_coverage");
  });
  it("contradiction subtracts proportionally", () => {
    const noContra = computeConfidence({
      coverage: 0.8, agreement: 0.8, freshness: 0.8,
      historical_certainty: 0.5, prior_strength: 0.5, contradiction_penalty: 0,
    });
    const withContra = computeConfidence({
      coverage: 0.8, agreement: 0.8, freshness: 0.8,
      historical_certainty: 0.5, prior_strength: 0.5, contradiction_penalty: 0.4,
    });
    expect(withContra.value).toBeLessThan(noContra.value);
  });
});

// -----------------------------------------------------------------------------
// buildContributionTrace — ordering + sum invariants
// -----------------------------------------------------------------------------

describe("buildContributionTrace", () => {
  it("sums points_contributed equals weighted_score (excluding multipliers)", () => {
    const input = baseInput();
    const comps = scoreAllComponents(input);
    const weights = PROFILE_WEIGHTS.b2b_service;
    const trace = buildContributionTrace(comps, weights);
    const total = trace.reduce((s, t) => s + t.points_contributed, 0);
    // direct compute
    const expected = SCORE_COMPONENTS.reduce((s, c) => s + comps[c].raw * weights[c], 0);
    expect(total).toBeCloseTo(expected, 9);
  });

  it("ranks are 1..N, stable, and ordered desc by points_contributed", () => {
    const trace = buildContributionTrace(
      scoreAllComponents(baseInput()),
      PROFILE_WEIGHTS.b2b_service,
    );
    expect(trace.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i - 1].points_contributed).toBeGreaterThanOrEqual(trace[i].points_contributed);
    }
  });

  it("delta_vs_profile_baseline equals raw - 0.5", () => {
    const trace = buildContributionTrace(
      scoreAllComponents(baseInput()),
      PROFILE_WEIGHTS.b2b_service,
    );
    for (const t of trace) {
      expect(t.delta_vs_profile_baseline).toBeCloseTo(t.raw_value - 0.5, 9);
    }
  });
});

// -----------------------------------------------------------------------------
// applyOperatorControls — bounded, logged, never authoritative
// -----------------------------------------------------------------------------

describe("applyOperatorControls", () => {
  const match = { scope_kind: "keyword" as const, scope_id: "x", mapped_theme_id: "t1", mapped_service_id: "s1" };

  it("theme_boost clamps to [1.0, 1.2]", () => {
    const out = applyOperatorControls(match, [
      { id: "c1", control_kind: "theme_boost", scope: { theme_id: "t1" }, value: { multiplier: 5 }, active: true },
    ]);
    expect(out.multiplier).toBeCloseTo(1.2, 6);
    expect(out.multipliers_applied["theme_boost:c1"]).toBe(1.2);
  });

  it("theme_deprioritize clamps to [0.8, 1.0]", () => {
    const out = applyOperatorControls(match, [
      { id: "c2", control_kind: "theme_deprioritize", scope: { theme_id: "t1" }, value: { multiplier: 0.1 }, active: true },
    ]);
    expect(out.multiplier).toBeCloseTo(0.8, 6);
  });

  it("veto adds to vetoes_triggered", () => {
    const out = applyOperatorControls(match, [
      { id: "v1", control_kind: "veto", scope: { theme_id: "t1" }, value: {}, active: true },
    ]);
    expect(out.vetoes_triggered).toContain("v1");
  });

  it("combined multipliers are clamped to [0.5, 1.5]", () => {
    const out = applyOperatorControls(match, [
      { id: "b1", control_kind: "theme_boost", scope: { theme_id: "t1" }, value: { multiplier: 1.2 }, active: true },
      { id: "b2", control_kind: "strategic_lock", scope: { theme_id: "t1" }, value: {}, active: true },
      { id: "b3", control_kind: "theme_boost", scope: { theme_id: "t1" }, value: { multiplier: 1.2 }, active: true },
    ]);
    // 1.2 * 1.15 * 1.2 = 1.656 -> clamped to 1.5
    expect(out.multiplier).toBeCloseTo(1.5, 6);
  });

  it("inactive controls are ignored", () => {
    const out = applyOperatorControls(match, [
      { id: "v1", control_kind: "veto", scope: { theme_id: "t1" }, value: {}, active: false },
    ]);
    expect(out.vetoes_triggered).toHaveLength(0);
    expect(out.multiplier).toBe(1.0);
  });

  it("scope mismatch is ignored", () => {
    const out = applyOperatorControls(match, [
      { id: "b1", control_kind: "theme_boost", scope: { theme_id: "different" }, value: { multiplier: 1.2 }, active: true },
    ]);
    expect(out.multiplier).toBe(1.0);
  });
});

// -----------------------------------------------------------------------------
// computeLearningAdjustment — bounded ±10, n>=3 gate
// -----------------------------------------------------------------------------

describe("computeLearningAdjustment", () => {
  it("returns 0 when no learnings", () => {
    expect(computeLearningAdjustment([]).applied).toBe(0);
  });
  it("returns 0 with n<3 (gate triggered)", () => {
    const r = computeLearningAdjustment([
      { cluster_family: "x", suggested_acquisition_approach: "y", action_category: "z", n: 2, mean_uplift_pct: 50 },
    ]);
    expect(r.applied).toBe(0);
    expect(r.reason).toBe("insufficient_n");
  });
  it("bounded at +LEARNING_MAX_ABS_POINTS for huge positive uplift", () => {
    const r = computeLearningAdjustment([
      { cluster_family: "x", suggested_acquisition_approach: "y", action_category: "z", n: 10, mean_uplift_pct: 500 },
    ]);
    expect(r.applied).toBe(LEARNING_MAX_ABS_POINTS);
  });
  it("bounded at -LEARNING_MAX_ABS_POINTS for huge negative uplift", () => {
    const r = computeLearningAdjustment([
      { cluster_family: "x", suggested_acquisition_approach: "y", action_category: "z", n: 10, mean_uplift_pct: -500 },
    ]);
    expect(r.applied).toBe(-LEARNING_MAX_ABS_POINTS);
  });
});

// -----------------------------------------------------------------------------
// scoreOpportunity — end-to-end determinism, banding, version stamping
// -----------------------------------------------------------------------------

describe("scoreOpportunity", () => {
  it("stamps locked versions on every output", () => {
    const r = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    expect(r.model_version).toBe("opportunity-score-v1.0.0");
    expect(r.signals_version).toBe("signals-v1.0.0");
    expect(r.workspace_profile).toBe("b2b_service");
  });

  it("score lies in [0, 100]", () => {
    const r = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("deterministic — same inputs produce identical score and trace", () => {
    const a = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    const b = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    expect(a.score).toBe(b.score);
    expect(a.confidence).toBe(b.confidence);
    expect(a.contribution_trace.map((x) => x.component))
      .toEqual(b.contribution_trace.map((x) => x.component));
    expect(a.contribution_trace.map((x) => x.points_contributed))
      .toEqual(b.contribution_trace.map((x) => x.points_contributed));
  });

  it("veto from operator yields score=0 and score_band='veto'", () => {
    const r = scoreOpportunity({
      input: baseInput(),
      operator_controls: [{
        id: "v", control_kind: "veto", scope: { theme_id: "theme1" }, value: {}, active: true,
      }],
      now_iso: NOW,
    });
    expect(r.score).toBe(0);
    expect(r.score_band).toBe("veto");
    expect(r.vetoes_triggered).toContain("v");
  });

  it("capacity=suspended auto-vetoes even without operator control", () => {
    const r = scoreOpportunity({
      input: baseInput({
        business_model: {
          workspace_profile: "b2b_service",
          aggressiveness_profile: "balanced",
          lead_quality_target: "balanced",
          fulfillment_capacity: { svc1: "suspended" },
          strategic_importance: { theme1: "core" },
        },
      }),
      operator_controls: [],
      now_iso: NOW,
    });
    expect(r.score).toBe(0);
    expect(r.score_band).toBe("veto");
    expect(r.vetoes_triggered).toContain("capacity_suspended");
  });

  it("aggressive profile produces higher score than conservative for same inputs", () => {
    const cons = scoreOpportunity({
      input: baseInput({
        business_model: { ...baseInput().business_model, aggressiveness_profile: "conservative" },
      }),
      operator_controls: [],
      now_iso: NOW,
    });
    const aggr = scoreOpportunity({
      input: baseInput({
        business_model: { ...baseInput().business_model, aggressiveness_profile: "aggressive" },
      }),
      operator_controls: [],
      now_iso: NOW,
    });
    expect(aggr.score).toBeGreaterThan(cons.score);
    expect(cons.multipliers_applied.aggressiveness).toBe(AGGRESSIVENESS_MULT.conservative);
    expect(aggr.multipliers_applied.aggressiveness).toBe(AGGRESSIVENESS_MULT.aggressive);
  });

  it("learning_adjustment.applied is bounded ±LEARNING_MAX_ABS_POINTS even for extreme uplift", () => {
    const r = scoreOpportunity({
      input: baseInput({
        matching_learnings: [{
          cluster_family: "x",
          suggested_acquisition_approach: "y",
          action_category: "z",
          n: 100,
          mean_uplift_pct: 500,
        }],
      }),
      operator_controls: [],
      now_iso: NOW,
    });
    expect(r.learning_adjustment).toBeDefined();
    expect(Math.abs(r.learning_adjustment!.applied)).toBeLessThanOrEqual(LEARNING_MAX_ABS_POINTS);
    expect(r.learning_adjustment!.applied).toBe(LEARNING_MAX_ABS_POINTS);
  });

  it("contribution_trace points sum equals score before multipliers/learning (modulo veto)", () => {
    const input = baseInput({
      business_model: { ...baseInput().business_model, aggressiveness_profile: "balanced" },
    });
    const r = scoreOpportunity({ input, operator_controls: [], now_iso: NOW });
    const traceSum = r.contribution_trace.reduce((s, t) => s + t.points_contributed, 0);
    // With balanced aggressiveness (1.0), no operator controls, no learning,
    // and no veto, score should equal trace sum.
    expect(r.score).toBeCloseTo(traceSum, 6);
  });

  it("band thresholds: low<40, medium<60, high<80, critical>=80", () => {
    // High-signal input → expect medium-or-better.
    const r = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    if (r.score >= 80) expect(r.score_band).toBe("critical");
    else if (r.score >= 60) expect(r.score_band).toBe("high");
    else if (r.score >= 40) expect(r.score_band).toBe("medium");
    else expect(r.score_band).toBe("low");
  });

  it("every contribution carries reason_codes (no empty arrays for known signals)", () => {
    const r = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    for (const t of r.contribution_trace) {
      expect(Array.isArray(t.reason_codes)).toBe(true);
      // Some components may have zero codes only if exactly mid-range — accept it.
      // Strong constraint: any contribution > 1 point should carry at least one code.
      if (t.points_contributed > 1) {
        expect(t.reason_codes.length).toBeGreaterThan(0);
      }
    }
  });

  it("reproducibility: stored components × weights reconstruct contribution_trace", () => {
    const r = scoreOpportunity({ input: baseInput(), operator_controls: [], now_iso: NOW });
    for (const t of r.contribution_trace) {
      const expected = r.components[t.component] * r.weights_applied[t.component];
      expect(t.points_contributed).toBeCloseTo(expected, 9);
    }
  });
});
