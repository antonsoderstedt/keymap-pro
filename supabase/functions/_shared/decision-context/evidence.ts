/**
 * assembleEvidence — dedupe and cap the union of evidence used in sections 1-3.
 * Pure.
 *
 * Optional `excerpts` map allows the worker to attach short human-readable
 * summaries (e.g. "sessions 1 240 → 893 (-28%, 28d)") to evidence refs that
 * arrive without one. Lookup key = evidence.id. Excerpts are trimmed to 120
 * characters.
 */

import { EVIDENCE_MAX_ITEMS } from "./constants.ts";
import type {
  CausalSignalLite,
  EvidenceRefLite,
  MetricDeltaLite,
  RelatedSignalLite,
  SignalCandidate,
  CausalCandidate,
} from "./types.ts";

const EXCERPT_MAX_LEN = 120;

function trim(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.length > EXCERPT_MAX_LEN ? `${s.slice(0, EXCERPT_MAX_LEN - 1)}…` : s;
}

export function assembleEvidence(
  whatChanged: MetricDeltaLite[],
  causal: CausalSignalLite[],
  related: RelatedSignalLite[],
  whatChangedEvidence: EvidenceRefLite[] = [],
  excerpts?: Map<string, string>,
): EvidenceRefLite[] {
  const out: EvidenceRefLite[] = [];
  const seen = new Set<string>();

  function push(refs: EvidenceRefLite[]) {
    for (const r of refs) {
      const key = `${r.source}|${r.source_id ?? r.id}|${r.observed_at ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const excerpt = r.excerpt ?? excerpts?.get(r.id);
      out.push(excerpt ? { ...r, excerpt: trim(excerpt) } : r);
      if (out.length >= EVIDENCE_MAX_ITEMS) return;
    }
  }

  push(whatChangedEvidence);
  for (const c of causal) {
    push(c.evidence);
    if (out.length >= EVIDENCE_MAX_ITEMS) break;
  }
  for (const r of related) {
    push(r.evidence);
    if (out.length >= EVIDENCE_MAX_ITEMS) break;
  }
  return out;
}

// ---- Excerpt formatters ----------------------------------------------------

const SV_MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getUTCDate()} ${SV_MONTHS[d.getUTCMonth()]}`;
}

function fmtNum(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  return Math.round(n).toLocaleString("sv-SE");
}

/** Format a SignalCandidate as a Swedish one-liner with numbers. */
export function formatSignalExcerpt(c: SignalCandidate): string | undefined {
  if (typeof c.value !== "number" && typeof c.baseline !== "number" && typeof c.delta_pct !== "number") {
    return undefined;
  }
  const pct =
    typeof c.delta_pct === "number"
      ? `${c.delta_pct >= 0 ? "+" : ""}${(c.delta_pct * 100).toFixed(0)}%`
      : null;
  const win = c.window_days ? `${c.window_days}d` : null;
  const tail = [pct, win].filter(Boolean).join(", ");
  const arrow = `${fmtNum(c.baseline)} → ${fmtNum(c.value)}`;
  return tail ? `${c.metric} ${arrow} (${tail})` : `${c.metric} ${arrow}`;
}

/** Format a CausalCandidate's evidence excerpt. */
export function formatCausalExcerpt(c: CausalCandidate): string | undefined {
  const observed = c.evidence?.[0]?.observed_at;
  const when = shortDate(observed);
  const label = c.label ?? "";
  if (!label) return undefined;
  return when ? `${label} ${when}` : label;
}

/** Build a lookup map: evidence.id → excerpt for the given candidates. */
export function buildExcerptMap(
  signals: SignalCandidate[],
  causal: CausalCandidate[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of signals) {
    if (!c.evidence?.id) continue;
    const ex = formatSignalExcerpt(c);
    if (ex) m.set(c.evidence.id, ex);
  }
  for (const c of causal) {
    const ex = formatCausalExcerpt(c);
    if (!ex) continue;
    for (const e of c.evidence ?? []) {
      if (e?.id && !m.has(e.id)) m.set(e.id, ex);
    }
  }
  return m;
}
