/**
 * validateNarrative — pure check that every claim id referenced in the
 * narrative text exists in the evidence set.
 *
 * The narrative is expected to embed evidence ids using the syntax
 *   [[ev:<id>]]
 * which is stripped at render time. Any unknown id ⇒ rejection.
 *
 * No LLM here. The LLM call lives in the worker; this is the safety gate.
 */

const CLAIM_REGEX = /\[\[ev:([A-Za-z0-9_\-:.]+)\]\]/g;

export interface NarrativeValidation {
  ok: boolean;
  missing_ids: string[];
  /** True when at least one [[ev:…]] reference was found. Strictly: a narrative
   *  must reference ≥ 1 evidence id or it is considered ungrounded. */
  has_citations: boolean;
}

export function extractClaimIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CLAIM_REGEX)) out.push(m[1]);
  return out;
}

export function validateNarrative(text: string, evidenceIds: Iterable<string>): NarrativeValidation {
  const allowed = new Set(evidenceIds);
  const cited = extractClaimIds(text);
  const missing = cited.filter((id) => !allowed.has(id));
  return {
    ok: cited.length > 0 && missing.length === 0,
    missing_ids: [...new Set(missing)],
    has_citations: cited.length > 0,
  };
}
