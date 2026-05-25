// Pure intent + buyer-stage classifier.
//
// Deterministic. Output depends only on (normalized keyword, brand tokens).
// No LLM, no embeddings. Embeddings inform `business_relevance` separately.
//
// Invariants:
//   - same inputs → same outputs
//   - every output carries reason_codes from REASON_CODES
//   - every output carries supporting tokens for traceability

import {
  COMMERCIAL_TOKENS,
  INFORMATIONAL_TOKENS,
  PRODUCT_AWARE_TOKENS,
  PROBLEM_AWARE_TOKENS,
  REASON_CODES,
  READY_TO_BUY_TOKENS,
  SOLUTION_AWARE_TOKENS,
  TRANSACTIONAL_TOKENS,
  type ReasonCode,
} from "./constants.ts";
import { hasAnyToken, normalizeKeyword, tokenize } from "./normalize.ts";

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export type BuyerStage =
  | "unaware"
  | "problem_aware"
  | "solution_aware"
  | "product_aware"
  | "ready_to_buy";

export interface IntentClassification {
  search_intent: SearchIntent;
  buyer_stage: BuyerStage;
  commercial_intent_score: number;   // 0..1
  reason_codes: ReasonCode[];
  matched_tokens: string[];
}

export interface IntentInputs {
  normalized_keyword: string;
  brand_tokens?: readonly string[];  // own + competitor brand/domain tokens
}

export function classifyIntent(inputs: IntentInputs): IntentClassification {
  const kw = normalizeKeyword(inputs.normalized_keyword);
  const tokens = tokenize(kw);
  const reasons: ReasonCode[] = [];
  const matched: string[] = [];

  // 1. Navigational — brand/domain token present
  const brandHit = inputs.brand_tokens && inputs.brand_tokens.length > 0
    ? hasAnyToken(kw, inputs.brand_tokens)
    : null;

  // 2. Intent dictionary lookups
  const transHit = hasAnyToken(kw, TRANSACTIONAL_TOKENS);
  const commHit = hasAnyToken(kw, COMMERCIAL_TOKENS);
  const infoHit = hasAnyToken(kw, INFORMATIONAL_TOKENS);

  let search_intent: SearchIntent;
  if (transHit) {
    search_intent = "transactional";
    reasons.push(REASON_CODES.INTENT_TRANSACTIONAL_MODIFIER);
    matched.push(transHit);
  } else if (brandHit) {
    // Brand without transactional modifier → navigational
    search_intent = "navigational";
    reasons.push(REASON_CODES.INTENT_NAVIGATIONAL_BRAND_TOKEN);
    matched.push(brandHit);
  } else if (commHit) {
    search_intent = "commercial";
    reasons.push(REASON_CODES.INTENT_COMMERCIAL_MODIFIER);
    matched.push(commHit);
  } else if (infoHit) {
    search_intent = "informational";
    reasons.push(REASON_CODES.INTENT_INFORMATIONAL_MODIFIER);
    matched.push(infoHit);
  } else {
    // Default: short non-question multi-noun phrases lean commercial in B2B;
    // single-token vague queries lean informational. Use a deterministic rule.
    search_intent = tokens.length >= 2 ? "commercial" : "informational";
    reasons.push(REASON_CODES.INTENT_NEUTRAL_DEFAULT);
  }

  // 3. Buyer stage — first hit wins by decisiveness
  let buyer_stage: BuyerStage;
  const readyHit = hasAnyToken(kw, READY_TO_BUY_TOKENS);
  const productHit = hasAnyToken(kw, PRODUCT_AWARE_TOKENS);
  const solutionHit = hasAnyToken(kw, SOLUTION_AWARE_TOKENS);
  const problemHit = hasAnyToken(kw, PROBLEM_AWARE_TOKENS);

  if (readyHit) {
    buyer_stage = "ready_to_buy";
    reasons.push(REASON_CODES.STAGE_READY_TO_BUY_TOKEN);
    matched.push(readyHit);
  } else if (productHit) {
    buyer_stage = "product_aware";
    reasons.push(REASON_CODES.STAGE_PRODUCT_AWARE_TOKEN);
    matched.push(productHit);
  } else if (solutionHit) {
    buyer_stage = "solution_aware";
    reasons.push(REASON_CODES.STAGE_SOLUTION_AWARE_TOKEN);
    matched.push(solutionHit);
  } else if (problemHit) {
    buyer_stage = "problem_aware";
    reasons.push(REASON_CODES.STAGE_PROBLEM_AWARE_TOKEN);
    matched.push(problemHit);
  } else {
    // Default depends on intent: transactional → ready_to_buy implied; else unaware.
    buyer_stage = search_intent === "transactional" ? "ready_to_buy" : "unaware";
    reasons.push(REASON_CODES.STAGE_UNAWARE_DEFAULT);
  }

  // 4. Commercial intent score — deterministic table
  const commercial_intent_score = intentScore(search_intent, buyer_stage);

  return {
    search_intent,
    buyer_stage,
    commercial_intent_score,
    reason_codes: reasons,
    matched_tokens: Array.from(new Set(matched)),
  };
}

function intentScore(intent: SearchIntent, stage: BuyerStage): number {
  // Locked v1 table. Bump MODEL_VERSION to change.
  const intentBase: Record<SearchIntent, number> = {
    transactional: 0.9,
    commercial: 0.65,
    navigational: 0.4,
    informational: 0.2,
  };
  const stageBoost: Record<BuyerStage, number> = {
    ready_to_buy: 0.10,
    product_aware: 0.05,
    solution_aware: 0.0,
    problem_aware: -0.05,
    unaware: -0.10,
  };
  return clamp01(intentBase[intent] + stageBoost[stage]);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
