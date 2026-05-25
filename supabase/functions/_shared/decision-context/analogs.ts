/**
 * selectHistoricalAnalogs — pure same-project analog selection.
 *
 * Hard rules (locked):
 *   - same project_only — caller MUST pre-filter to current project.
 *   - similarity ≥ ANALOG_MIN_SIMILARITY (0.78)
 *   - n ≥ ANALOG_MIN_N (3)
 *   - cap ANALOG_MAX_ITEMS (3)
 *
 * Ranking:
 *   analog_score = 0.5 × similarity + 0.3 × recency_decay + 0.2 × scope_kind_match
 *
 *   recency_decay = clamp(1 − days_since_update / 180, 0, 1)
 *
 * Tie-break: higher similarity → newer last_updated → lex id.
 */

import { ANALOG_MAX_ITEMS, ANALOG_MIN_N, ANALOG_MIN_SIMILARITY } from "./constants.ts";
import type { AnalogCandidate, AnalogRefLite } from "./types.ts";

const RECENCY_HALFLIFE_DAYS = 180;

function recencyDecay(lastUpdatedIso: string, nowIso: string): number {
  const a = Date.parse(lastUpdatedIso);
  const b = Date.parse(nowIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const days = Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.min(1, 1 - days / RECENCY_HALFLIFE_DAYS));
}

export interface AnalogOpts {
  now_iso: string;
}

export function selectHistoricalAnalogs(
  candidates: AnalogCandidate[],
  opts: AnalogOpts,
): AnalogRefLite[] {
  const eligible = candidates.filter(
    (c) => c.similarity >= ANALOG_MIN_SIMILARITY && c.n >= ANALOG_MIN_N && c.scope === "project_only",
  );

  const ranked = eligible
    .map((c) => ({
      c,
      score:
        0.5 * c.similarity +
        0.3 * recencyDecay(c.last_updated, opts.now_iso) +
        0.2 * (c.scope_kind_match ? 1 : 0),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.c.similarity !== a.c.similarity) return b.c.similarity - a.c.similarity;
      const at = Date.parse(a.c.last_updated);
      const bt = Date.parse(b.c.last_updated);
      if (bt !== at) return bt - at;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    });

  return ranked.slice(0, ANALOG_MAX_ITEMS).map(({ c }) => ({
    id: c.id,
    label: c.label ?? c.cluster_family,
    cluster_family: c.cluster_family,
    suggested_acquisition_approach: c.suggested_acquisition_approach,
    n: c.n,
    mean_uplift_pct: c.mean_uplift_pct,
    variance: c.variance,
    scope: "project_only" as const,
  }));
}

/**
 * Token-Jaccard similarity helper for callers that need a deterministic,
 * embedding-free similarity for `cluster_family` strings. Lower-cases,
 * tokenizes on non-word chars, drops empties.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{Letter}\p{Number}]+/u)
      .filter((t) => t.length > 0),
  );
}
