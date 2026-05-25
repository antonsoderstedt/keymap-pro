// Compose IntelligenceVerdict from pure sub-assessments.
//
// Pure. No I/O, no LLM. Confidence formula and band thresholds are LOCKED v1.

import {
  CONFIDENCE_GATE_LOW_COVERAGE,
  FRESHNESS_STALE_DAYS,
  MODEL_VERSION,
  REASON_CODES,
  SIGNALS_VERSION,
  type ReasonCode,
} from "./constants.ts";
import { classifyIntent, type IntentInputs } from "./intent.ts";
import { assessRelevance, type RelevanceInputs } from "./relevance.ts";
import { assessSerp, type SerpInputs } from "./serp.ts";
import { estimateValue, type ValueInputs } from "./value.ts";

export interface VerdictEvidenceRef {
  id: string;
  source: string;
  source_id?: string;
  observed_at?: string;
  freshness_days?: number;
}

export interface BuildVerdictInputs {
  keyword: string;
  normalized_keyword: string;
  cluster_id?: string | null;
  intent: IntentInputs;
  relevance: RelevanceInputs;
  serp: SerpInputs;
  // Provide volume/cpc/business-model; intent + stage are filled in by us.
  value: Omit<
    ValueInputs,
    "search_intent" | "buyer_stage" | "business_relevance_score"
    | "serp_competitiveness" | "commoditization_score" | "conversion_likelihood"
  >;
  // Optional suggested approach override (operator); otherwise derived.
  suggested_acquisition_approach?: string;
  // Signal observation timestamps for freshness (ISO strings)
  signal_observed_at?: {
    keyword_metrics?: string | null;
    serp?: string | null;
    landing_page?: string | null;
  };
  evidence?: VerdictEvidenceRef[];
}

export interface Verdict {
  keyword: string;
  normalized_keyword: string;
  cluster_id: string | null;
  search_intent: ReturnType<typeof classifyIntent>["search_intent"];
  buyer_stage: ReturnType<typeof classifyIntent>["buyer_stage"];
  commercial_intent_score: number;
  business_relevance_score: number;
  conversion_likelihood: number;
  serp_competitiveness: number;
  commoditization_score: number;
  lead_quality_proxy: ReturnType<typeof estimateValue>["lead_quality_proxy"];
  suggested_acquisition_approach: string;
  estimated_commercial_value: ReturnType<typeof estimateValue>["estimated_commercial_value"];
  confidence: number;
  evidence: VerdictEvidenceRef[];
  reason_codes: ReasonCode[];
  model_version: string;
  signals_version: string;
  computed_at: string;
}

export function buildVerdict(inputs: BuildVerdictInputs): Verdict {
  const intent = classifyIntent(inputs.intent);
  const serp = assessSerp(inputs.serp);
  const relevance = assessRelevance(inputs.relevance);

  // Derived conversion_likelihood used by estimateValue; same value returned.
  const value = estimateValue({
    ...inputs.value,
    search_intent: intent.search_intent,
    buyer_stage: intent.buyer_stage,
    business_relevance_score: relevance.business_relevance_score,
    serp_competitiveness: serp.serp_competitiveness,
    commoditization_score: serp.commoditization_score,
    conversion_likelihood: 0, // recomputed inside; not used as input here
  });

  // Confidence formula (signals coverage + agreement + freshness)
  const coverage = average([
    relevance.used_embedding || (relevance.matched_terms.length > 0) ? 1 : 0,
    typeof inputs.serp.keyword_difficulty === "number" || typeof inputs.serp.competition === "number" ? 1 : 0,
    typeof inputs.value.search_volume === "number" ? 1 : 0,
    typeof inputs.value.cpc_sek === "number" ? 1 : 0,
  ]);

  const agreement = signalAgreement(
    intent.commercial_intent_score,
    relevance.business_relevance_score,
    1 - serp.serp_competitiveness, // lower comp = more opportunity agreement
  );

  const freshness = freshnessScore(inputs.signal_observed_at);

  const reason_codes: ReasonCode[] = [
    ...intent.reason_codes,
    ...serp.reason_codes,
    ...relevance.reason_codes,
    ...value.reason_codes,
  ];

  let confidence = clamp01(0.5 * coverage + 0.3 * agreement + 0.2 * freshness);
  if (coverage < CONFIDENCE_GATE_LOW_COVERAGE) {
    reason_codes.push(REASON_CODES.CONFIDENCE_LOW_COVERAGE);
    confidence = Math.min(confidence, 0.5);
  }
  if (freshness < 0.5) {
    reason_codes.push(REASON_CODES.CONFIDENCE_STALE_SIGNALS);
    confidence = Math.min(confidence, 0.6);
  }
  if (confidence >= 0.7) reason_codes.push(REASON_CODES.CONFIDENCE_OK);

  const suggested_acquisition_approach =
    inputs.suggested_acquisition_approach
    ?? deriveApproach(intent.search_intent, intent.buyer_stage, serp.serp_competitiveness, serp.commoditization_score);

  return {
    keyword: inputs.keyword,
    normalized_keyword: inputs.normalized_keyword,
    cluster_id: inputs.cluster_id ?? null,
    search_intent: intent.search_intent,
    buyer_stage: intent.buyer_stage,
    commercial_intent_score: intent.commercial_intent_score,
    business_relevance_score: relevance.business_relevance_score,
    conversion_likelihood: value.conversion_likelihood,
    serp_competitiveness: serp.serp_competitiveness,
    commoditization_score: serp.commoditization_score,
    lead_quality_proxy: value.lead_quality_proxy,
    suggested_acquisition_approach,
    estimated_commercial_value: value.estimated_commercial_value,
    confidence,
    evidence: inputs.evidence ?? [],
    reason_codes: dedupe(reason_codes),
    model_version: MODEL_VERSION,
    signals_version: SIGNALS_VERSION,
    computed_at: new Date().toISOString(),
  };
}

function deriveApproach(
  intent: ReturnType<typeof classifyIntent>["search_intent"],
  stage: ReturnType<typeof classifyIntent>["buyer_stage"],
  serpComp: number,
  commod: number,
): string {
  if (intent === "transactional" && commod > 0.6) return "paid_search_dominant";
  if (intent === "transactional") return "paid_search_with_seo";
  if (intent === "commercial" && serpComp < 0.5) return "seo_comparison_content";
  if (intent === "commercial") return "paid_search_with_seo";
  if (intent === "informational" && stage === "problem_aware") return "seo_top_of_funnel";
  if (intent === "informational") return "seo_thought_leadership";
  if (intent === "navigational") return "brand_defense";
  return "seo_thought_leadership";
}

function signalAgreement(...vals: number[]): number {
  // Lower variance = higher agreement
  if (vals.length === 0) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return clamp01(1 - Math.sqrt(variance));
}

function freshnessScore(obs?: BuildVerdictInputs["signal_observed_at"]): number {
  if (!obs) return 0.5;
  const ages: number[] = [];
  for (const v of Object.values(obs)) {
    if (!v) continue;
    const dt = new Date(v).getTime();
    if (!Number.isFinite(dt)) continue;
    const days = (Date.now() - dt) / 86400000;
    ages.push(days);
  }
  if (ages.length === 0) return 0.5;
  const maxAge = Math.max(...ages);
  return clamp01(1 - maxAge / FRESHNESS_STALE_DAYS);
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
