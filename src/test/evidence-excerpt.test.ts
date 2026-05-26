import { describe, expect, it } from "vitest";

import {
  assembleEvidence,
  buildExcerptMap,
  formatSignalExcerpt,
  type CausalCandidate,
  type SignalCandidate,
} from "../../supabase/functions/_shared/decision-context/index.ts";

const NOW = "2026-05-18T12:00:00.000Z";

function signal(): SignalCandidate {
  return {
    id: "ga4:sessions",
    source: "ga4",
    metric: "sessions",
    value: 893,
    baseline: 1240,
    delta_pct: -0.28,
    window_days: 28,
    scope_proximity: 0.9,
    signal_quality: 0.9,
    direction: "down",
    observed_at: NOW,
    evidence: { id: "ga4:sessions:ev", source: "ga4", source_id: "snap1", observed_at: NOW },
    label: "GA4 sessions",
  };
}

describe("assembleEvidence — excerpts", () => {
  it("fills excerpt for signal-based evidence refs", () => {
    const s = signal();
    const excerpts = buildExcerptMap([s], []);
    const ev = assembleEvidence(
      [],
      [],
      [],
      [s.evidence!],
      excerpts,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].excerpt).toMatch(/sessions/);
    expect(ev[0].excerpt).toMatch(/-28%/);
    expect(ev[0].excerpt).toMatch(/28d/);
  });

  it("trims excerpts longer than 120 characters", () => {
    const evidenceId = "long:1";
    const long = "x".repeat(500);
    const excerpts = new Map<string, string>([[evidenceId, long]]);
    const ev = assembleEvidence(
      [],
      [],
      [],
      [{ id: evidenceId, source: "ads" }],
      excerpts,
    );
    expect(ev[0].excerpt).toBeDefined();
    expect(ev[0].excerpt!.length).toBeLessThanOrEqual(120);
  });

  it("leaves excerpt empty when candidate has no numeric data", () => {
    const bare: SignalCandidate = {
      id: "x",
      source: "ads",
      metric: "noop",
      scope_proximity: 0.5,
      evidence: { id: "ev:x", source: "ads" },
    };
    expect(formatSignalExcerpt(bare)).toBeUndefined();
    const excerpts = buildExcerptMap([bare], [] as CausalCandidate[]);
    expect(excerpts.has("ev:x")).toBe(false);
  });
});
