/**
 * selectWhatChanged — pure top-1..3 metric-delta selection.
 *
 * Inputs are pre-filtered `SignalCandidate[]` (scope already applied by the
 * worker). Ranking is purely deterministic.
 */

import { WHAT_CHANGED_MAX_ITEMS, WHAT_CHANGED_MIN_DELTA_PCT } from "./constants.ts";
import type { MetricDeltaLite, SignalCandidate } from "./types.ts";

/**
 * Ranking formula (locked):
 *   rank = |delta_pct| × log10(1 + |absolute_change|) × signal_quality
 *        × (direction matches action_intent_direction ? 1.2 : 1.0)
 *        × scope_proximity
 *
 * Tie-break (deterministic, stable):
 *   1. larger |delta_pct|
 *   2. higher scope_proximity
 *   3. lexicographically smaller `id`
 */
export interface WhatChangedOpts {
  /** Optional direction the action expects (e.g. "down" if action is about a drop). */
  action_intent_direction?: "up" | "down" | "stable";
}

export function selectWhatChanged(
  candidates: SignalCandidate[],
  opts: WhatChangedOpts = {},
): MetricDeltaLite[] {
  const ranked = candidates
    .filter((c) => typeof c.delta_pct === "number" && Math.abs(c.delta_pct!) >= WHAT_CHANGED_MIN_DELTA_PCT)
    .map((c) => {
      const absDelta = Math.abs(c.delta_pct ?? 0);
      const magnitude = Math.log10(1 + Math.abs(c.absolute_change ?? 0));
      const quality = c.signal_quality ?? 1.0;
      const directionMatch =
        opts.action_intent_direction && c.direction && opts.action_intent_direction === c.direction
          ? 1.2
          : 1.0;
      const score = absDelta * (magnitude > 0 ? magnitude : 1) * quality * directionMatch * c.scope_proximity;
      return { c, score, absDelta };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.absDelta !== a.absDelta) return b.absDelta - a.absDelta;
      if (b.c.scope_proximity !== a.c.scope_proximity) return b.c.scope_proximity - a.c.scope_proximity;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    });

  // Anti-redundancy: collapse same (source, metric) by keeping the highest-ranked.
  const seen = new Set<string>();
  const out: MetricDeltaLite[] = [];
  for (const { c } of ranked) {
    const key = `${c.source}:${c.metric}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      metric: c.metric,
      from: c.baseline,
      to: c.value,
      delta:
        typeof c.value === "number" && typeof c.baseline === "number" ? c.value - c.baseline : undefined,
      delta_pct: c.delta_pct,
      unit: c.unit,
      window_days: c.window_days,
      source: c.source,
    });
    if (out.length >= WHAT_CHANGED_MAX_ITEMS) break;
  }
  return out;
}
