/**
 * assembleEvidence — dedupe and cap the union of evidence used in sections 1-3.
 * Pure.
 */

import { EVIDENCE_MAX_ITEMS } from "./constants.ts";
import type {
  CausalSignalLite,
  EvidenceRefLite,
  MetricDeltaLite,
  RelatedSignalLite,
} from "./types.ts";

export function assembleEvidence(
  whatChanged: MetricDeltaLite[],
  causal: CausalSignalLite[],
  related: RelatedSignalLite[],
  whatChangedEvidence: EvidenceRefLite[] = [],
): EvidenceRefLite[] {
  const out: EvidenceRefLite[] = [];
  const seen = new Set<string>();

  function push(refs: EvidenceRefLite[]) {
    for (const r of refs) {
      const key = `${r.source}|${r.source_id ?? r.id}|${r.observed_at ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
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
  // whatChanged itself carries no extra evidence refs in our lite shape;
  // callers should pass the underlying SignalCandidate.evidence as the
  // `whatChangedEvidence` argument.
  return out;
}
