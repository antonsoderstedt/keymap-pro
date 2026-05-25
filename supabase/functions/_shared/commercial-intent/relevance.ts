// Pure business-relevance assessment.
//
// Embeddings are used for grouping/retrieval ONLY. The cosine is passed in as
// an input — this module does not compute or fetch vectors. Term matching is a
// deterministic backup signal.

import { REASON_CODES, type ReasonCode } from "./constants.ts";
import { hasAnyToken, normalizeKeyword } from "./normalize.ts";

export interface RelevanceInputs {
  normalized_keyword: string;
  product_terms?: readonly string[];
  service_terms?: readonly string[];
  material_terms?: readonly string[];
  // Cosine similarity vs the closest landing page embedding for this project.
  // null = no embedding available; we degrade to term-match only.
  embedding_cosine_top?: number | null;
}

export interface RelevanceAssessment {
  business_relevance_score: number; // 0..1
  reason_codes: ReasonCode[];
  matched_terms: string[];
  used_embedding: boolean;
}

export function assessRelevance(inputs: RelevanceInputs): RelevanceAssessment {
  const kw = normalizeKeyword(inputs.normalized_keyword);
  const reasons: ReasonCode[] = [];
  const matched: string[] = [];

  // Term-match component (deterministic)
  const termSets: readonly string[][] = [
    inputs.product_terms ?? [],
    inputs.service_terms ?? [],
    inputs.material_terms ?? [],
  ];
  let termHits = 0;
  for (const set of termSets) {
    const hit = hasAnyToken(kw, set);
    if (hit) {
      termHits++;
      matched.push(hit);
    }
  }
  const termScore = termHits === 0 ? 0 : termHits >= 2 ? 1 : 0.6;
  if (termHits > 0) reasons.push(REASON_CODES.RELEVANCE_TERM_MATCH);

  // Embedding component
  const cos = inputs.embedding_cosine_top;
  const used_embedding = typeof cos === "number" && Number.isFinite(cos);
  let embedScore = 0;
  if (used_embedding) {
    // Map cosine [0,1] with a soft floor so very low similarity contributes ~0.
    embedScore = clamp01((cos! - 0.2) / 0.6);
    if (embedScore >= 0.7) reasons.push(REASON_CODES.RELEVANCE_EMBEDDING_HIGH);
    else if (embedScore <= 0.2) reasons.push(REASON_CODES.RELEVANCE_EMBEDDING_LOW);
  }

  // Combine: embedding 0.6 / term 0.4 when both, otherwise whichever is present
  let business_relevance_score: number;
  if (used_embedding && termScore > 0) {
    business_relevance_score = clamp01(embedScore * 0.6 + termScore * 0.4);
  } else if (used_embedding) {
    business_relevance_score = embedScore;
  } else if (termScore > 0) {
    business_relevance_score = termScore;
  } else {
    business_relevance_score = 0.15; // conservative floor
    reasons.push(REASON_CODES.RELEVANCE_NO_SIGNAL);
  }

  return {
    business_relevance_score,
    reason_codes: reasons,
    matched_terms: Array.from(new Set(matched)),
    used_embedding,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
