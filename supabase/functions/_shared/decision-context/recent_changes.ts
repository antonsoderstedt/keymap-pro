/**
 * selectRecentChanges — chronological cap-5 list of discrete events in scope.
 *
 * Dedupe by `entity_id` (or `kind|label` fallback) — for each entity, keep
 * the most recent change. Caller passes pre-filtered window of 30d.
 */

import {
  RECENT_CHANGES_MAX_ITEMS,
  RECENT_CHANGES_WINDOW_DAYS,
} from "./constants.ts";
import type { ChangeCandidate, ChangeEventLite } from "./types.ts";

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

export interface RecentChangesOpts {
  now_iso: string;
  /** Evidence ids already represented in causal_signals — suppress overlap. */
  suppress_ids?: Set<string>;
}

export function selectRecentChanges(
  candidates: ChangeCandidate[],
  opts: RecentChangesOpts,
): ChangeEventLite[] {
  const suppress = opts.suppress_ids ?? new Set<string>();
  const withinWindow = candidates.filter(
    (c) =>
      !suppress.has(c.id) && daysBetween(c.occurred_at, opts.now_iso) <= RECENT_CHANGES_WINDOW_DAYS,
  );

  // Dedupe by entity_id || (kind|label) — keep newest per entity.
  const byEntity = new Map<string, ChangeCandidate>();
  for (const c of withinWindow) {
    const key = c.entity_id ?? `${c.kind}|${c.label}`;
    const prev = byEntity.get(key);
    if (!prev || Date.parse(c.occurred_at) > Date.parse(prev.occurred_at)) {
      byEntity.set(key, c);
    }
  }

  // Sort newest-first, deterministic id tie-break.
  const sorted = [...byEntity.values()].sort((a, b) => {
    const da = Date.parse(a.occurred_at);
    const db = Date.parse(b.occurred_at);
    if (db !== da) return db - da;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return sorted.slice(0, RECENT_CHANGES_MAX_ITEMS).map((c) => ({
    id: c.id,
    kind: c.kind,
    label: c.label,
    occurred_at: c.occurred_at,
    actor: c.actor,
    url: c.url,
  }));
}
