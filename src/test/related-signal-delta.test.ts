import { describe, expect, it } from "vitest";

import {
  RELATED_MAX_PER_SOURCE,
  selectRelatedSignals,
  type SignalCandidate,
} from "../../supabase/functions/_shared/decision-context/index.ts";

function cand(overrides: Partial<SignalCandidate> & { id: string; source: string; metric: string }): SignalCandidate {
  return {
    scope_proximity: 0.9,
    signal_quality: 0.9,
    ...overrides,
  };
}

describe("selectRelatedSignals — metric_delta population", () => {
  it("populates metric_delta when candidate has value/baseline/delta_pct", () => {
    const out = selectRelatedSignals([
      cand({
        id: "ga4:sessions",
        source: "ga4",
        metric: "sessions",
        value: 893,
        baseline: 1240,
        delta_pct: -0.28,
        window_days: 28,
        direction: "down",
        label: "GA4 sessions",
      }),
    ]);
    expect(out.signals).toHaveLength(1);
    expect(out.signals[0].metric_delta).toBeDefined();
    expect(out.signals[0].metric_delta?.metric).toBe("sessions");
    expect(out.signals[0].metric_delta?.delta_pct).toBeCloseTo(-0.28);
    expect(out.signals[0].metric_delta?.from).toBe(1240);
    expect(out.signals[0].metric_delta?.to).toBe(893);
    expect(out.signals[0].metric_delta?.window_days).toBe(28);
  });

  it("omits metric_delta when candidate is purely static (no value/baseline/delta_pct)", () => {
    const out = selectRelatedSignals([
      cand({
        id: "operator:note",
        source: "operator",
        metric: "note",
        label: "Operator note",
        direction: "stable",
      }),
    ]);
    expect(out.signals).toHaveLength(1);
    expect(out.signals[0].metric_delta).toBeUndefined();
  });

  it("respects per-source diversity cap unchanged", () => {
    const cands: SignalCandidate[] = [];
    for (let i = 0; i < RELATED_MAX_PER_SOURCE + 2; i++) {
      cands.push(cand({
        id: `gsc:m${i}`,
        source: "gsc",
        metric: `m${i}`,
        delta_pct: -0.3,
        value: 100,
        baseline: 143,
        direction: "down",
      }));
    }
    const out = selectRelatedSignals(cands);
    const gscCount = out.signals.filter((s) => s.source === "gsc").length;
    expect(gscCount).toBeLessThanOrEqual(RELATED_MAX_PER_SOURCE);
  });
});
