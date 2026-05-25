// Commercial Intelligence v1 — constants
//
// These are LOCKED. Bump `MODEL_VERSION` for any change that alters output for
// the same input (weights, thresholds, formula, normalization, intent rules).
// Bump `SIGNALS_VERSION` for any change to which signal columns are read or
// how they are aggregated (independent from scoring).
//
// `EMBEDDING_MODEL_VERSION` must be bumped together with `EMBEDDING_DIMS`.

export const MODEL_VERSION = "commercial-intent-v1.0.0";
export const SIGNALS_VERSION = "signals-v1.0.0";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_MODEL_VERSION = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

// Default fallbacks used only when business-model inputs are missing entirely.
// These are intentionally conservative; not a substitute for project_business_model.
export const FALLBACK_CPC_SEK = 12;
export const FALLBACK_DEAL_SIZE_SEK = 25000;
export const FALLBACK_CLOSE_RATE = 0.05;
export const FALLBACK_LTV_MULTIPLIER = 1.5;

// Coverage / freshness gates for confidence.
export const CONFIDENCE_GATE_LOW_COVERAGE = 0.5;     // <50% expected signals present
export const FRESHNESS_STALE_DAYS = 90;

// -----------------------------------------------------------------------------
// Reason code registry — exhaustive. Adding a code requires MODEL_VERSION bump.
// -----------------------------------------------------------------------------
export const REASON_CODES = {
  // Intent classification
  INTENT_TRANSACTIONAL_MODIFIER: "RC_INTENT_TRANSACTIONAL_MODIFIER",
  INTENT_COMMERCIAL_MODIFIER: "RC_INTENT_COMMERCIAL_MODIFIER",
  INTENT_INFORMATIONAL_MODIFIER: "RC_INTENT_INFORMATIONAL_MODIFIER",
  INTENT_NAVIGATIONAL_BRAND_TOKEN: "RC_INTENT_NAVIGATIONAL_BRAND_TOKEN",
  INTENT_NEUTRAL_DEFAULT: "RC_INTENT_NEUTRAL_DEFAULT",
  // Buyer stage
  STAGE_READY_TO_BUY_TOKEN: "RC_STAGE_READY_TO_BUY_TOKEN",
  STAGE_PRODUCT_AWARE_TOKEN: "RC_STAGE_PRODUCT_AWARE_TOKEN",
  STAGE_SOLUTION_AWARE_TOKEN: "RC_STAGE_SOLUTION_AWARE_TOKEN",
  STAGE_PROBLEM_AWARE_TOKEN: "RC_STAGE_PROBLEM_AWARE_TOKEN",
  STAGE_UNAWARE_DEFAULT: "RC_STAGE_UNAWARE_DEFAULT",
  // Commercial value
  VALUE_CPC_PRESENT: "RC_VALUE_CPC_PRESENT",
  VALUE_CPC_FALLBACK: "RC_VALUE_CPC_FALLBACK",
  VALUE_VOLUME_PRESENT: "RC_VALUE_VOLUME_PRESENT",
  VALUE_VOLUME_FALLBACK: "RC_VALUE_VOLUME_FALLBACK",
  VALUE_HIGH_LEAD_QUALITY: "RC_VALUE_HIGH_LEAD_QUALITY",
  VALUE_LOW_LEAD_QUALITY: "RC_VALUE_LOW_LEAD_QUALITY",
  // SERP
  SERP_KD_HIGH: "RC_SERP_KD_HIGH",
  SERP_KD_MEDIUM: "RC_SERP_KD_MEDIUM",
  SERP_KD_LOW: "RC_SERP_KD_LOW",
  SERP_COMMODITIZED_FEATURES: "RC_SERP_COMMODITIZED_FEATURES",
  SERP_NICHE_DOMAINS: "RC_SERP_NICHE_DOMAINS",
  SERP_NO_DATA: "RC_SERP_NO_DATA",
  // Relevance
  RELEVANCE_TERM_MATCH: "RC_RELEVANCE_TERM_MATCH",
  RELEVANCE_EMBEDDING_HIGH: "RC_RELEVANCE_EMBEDDING_HIGH",
  RELEVANCE_EMBEDDING_LOW: "RC_RELEVANCE_EMBEDDING_LOW",
  RELEVANCE_NO_SIGNAL: "RC_RELEVANCE_NO_SIGNAL",
  // Confidence gates
  CONFIDENCE_LOW_COVERAGE: "RC_CONFIDENCE_LOW_COVERAGE",
  CONFIDENCE_STALE_SIGNALS: "RC_CONFIDENCE_STALE_SIGNALS",
  CONFIDENCE_OK: "RC_CONFIDENCE_OK",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];

// -----------------------------------------------------------------------------
// Intent modifier dictionaries (Swedish + English)
// Match against tokenized normalized keyword; word-boundary aware.
// -----------------------------------------------------------------------------
export const TRANSACTIONAL_TOKENS = [
  // Swedish
  "köp", "köpa", "beställ", "beställa", "pris", "priser", "kostnad", "kostar",
  "offert", "offerter", "rabatt", "kampanj", "leverans", "frakt", "boka",
  // English
  "buy", "purchase", "order", "price", "pricing", "cost", "quote", "discount",
  "checkout", "deal",
];

export const COMMERCIAL_TOKENS = [
  // Swedish
  "bäst", "bästa", "jämför", "jämförelse", "test", "recension", "recensioner",
  "alternativ", "alternativen", "leverantör", "leverantörer", "tjänst", "tjänster",
  "företag", "byrå", "byråer", "konsult", "konsulter",
  // English
  "best", "compare", "comparison", "vs", "versus", "review", "reviews",
  "alternative", "alternatives", "vendor", "vendors", "agency", "agencies",
  "consultant", "consultants", "top",
];

export const INFORMATIONAL_TOKENS = [
  // Swedish
  "vad", "hur", "varför", "när", "vem", "vilka", "guide", "tips", "exempel",
  "definition", "betyder", "innebär",
  // English
  "what", "how", "why", "when", "who", "which", "guide", "tutorial", "examples",
  "definition", "meaning",
];

// Stage tokens — most decisive go first; first hit wins.
export const READY_TO_BUY_TOKENS = [
  "köp", "köpa", "beställ", "offert", "boka", "buy", "order", "quote",
];

export const PRODUCT_AWARE_TOKENS = [
  "bäst", "bästa", "jämför", "vs", "versus", "review", "recension", "test",
  "best", "compare",
];

export const SOLUTION_AWARE_TOKENS = [
  "lösning", "lösningar", "system", "verktyg", "plattform", "tjänst",
  "solution", "platform", "tool", "service",
];

export const PROBLEM_AWARE_TOKENS = [
  "problem", "fel", "varför", "fungerar inte", "hur", "issue", "broken",
  "why", "how", "fix",
];
