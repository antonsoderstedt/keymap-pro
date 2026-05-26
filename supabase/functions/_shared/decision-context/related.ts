/**
 * selectRelatedSignals — 3..5 supporting cross-source signals.
 *
 * Diversity rule (locked):
 *   No more than `RELATED_MAX_PER_SOURCE` signals from the same source. This
 *   forces the panel to show genuinely independent corroboration.
 *
 * Ranking formula (locked):
 *   rel_score = scope_proximity × signal_quality
 *             × (movement_present ? 1.4 : 1.0)
 *             + (contradicts_thesis ? 0.3 : 0.0)
 *
 * Tie-break (deterministic):
 *   1. higher scope_proximity
 *   2. higher signal_quality
 *   3. lexicographic id
 */

import {
  RELATED_MAX_ITEMS,
  RELATED_MAX_PER_SOURCE,
  RELATED_MIN_ITEMS,
} from "./constants.ts";
import type { RelatedSignalLite, SignalCandidate } from "./types.ts";

export interface RelatedOpts {
  /** Sources to exclude (e.g. ones already used in what_changed/causal). */
  exclude_evidence_ids?: Set<string>;
}

export interface RelatedResult {
  signals: RelatedSignalLite[];
  /** True when fewer than RELATED_MIN_ITEMS could be found — caller adds a gate code. */
  limited_cross_source: boolean;
}

export function selectRelatedSignals(
  candidates: SignalCandidate[],
  opts: RelatedOpts = {},
): RelatedResult {
  const exclude = opts.exclude_evidence_ids ?? new Set<string>();
  const ranked = candidates
    .filter((c) => !exclude.has(c.id))
    .map((c) => {
      const quality = c.signal_quality ?? 1.0;
      const movementPresent = c.direction === "up" || c.direction === "down";
      const base = c.scope_proximity * quality * (movementPresent ? 1.4 : 1.0);
      const contradictBonus = c.contradicts_thesis ? 0.3 : 0;
      return { c, score: base + contradictBonus };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.c.scope_proximity !== a.c.scope_proximity) return b.c.scope_proximity - a.c.scope_proximity;
      const aq = a.c.signal_quality ?? 1.0;
      const bq = b.c.signal_quality ?? 1.0;
      if (bq !== aq) return bq - aq;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    });

  const perSource = new Map<string, number>();
  const out: RelatedSignalLite[] = [];
  for (const { c, score } of ranked) {
    const used = perSource.get(c.source) ?? 0;
    if (used >= RELATED_MAX_PER_SOURCE) continue;
    perSource.set(c.source, used + 1);
    const hasDelta =
      typeof c.delta_pct === "number" ||
      typeof c.value === "number" ||
      typeof c.baseline === "number";
    const metric_delta = hasDelta
      ? {
          metric: c.metric,
          from: c.baseline,
          to: c.value,
          delta:
            typeof c.value === "number" && typeof c.baseline === "number"
              ? c.value - c.baseline
              : undefined,
          delta_pct: c.delta_pct,
          unit: c.unit,
          window_days: c.window_days,
          source: c.source,
        }
      : undefined;
    out.push({
      id: c.id,
      label: c.label ?? `${c.source}:${c.metric}`,
      source: c.source,
      relevance: Math.max(0, Math.min(1, score)),
      metric_delta,
      evidence: c.evidence ? [c.evidence] : [],
    });
    if (out.length >= RELATED_MAX_ITEMS) break;
  }

  return {
    signals: out,
    limited_cross_source: out.length < RELATED_MIN_ITEMS,
  };
}
