/**
 * DecisionContext v1 — locked constants.
 *
 * Versioning:
 *  - MODEL_VERSION bumps on selection/algorithm changes.
 *  - SIGNALS_VERSION is shared with the rest of the platform.
 *
 * No LLM in any of these constants. The lever table maps each scoring
 * component to an operator-facing recommended-next-step phrase (Swedish).
 * Phrasing is owned by code, not by the LLM.
 */

export const MODEL_VERSION = "decision-context-v1.0.0";
export const SIGNALS_VERSION = "signals-v1.0.0";

// ---- Gates / thresholds ----------------------------------------------------

/** Narrative is omitted when confidence < this. */
export const NARRATIVE_CONFIDENCE_GATE = 0.3;

/** Context surfaces a "stale" badge after this many days. */
export const STALE_DAYS = 7;

/** what_changed: minimum |delta_pct| (0..1, i.e. 0.10 = 10%) to qualify. */
export const WHAT_CHANGED_MIN_DELTA_PCT = 0.10;
/** what_changed: cap. */
export const WHAT_CHANGED_MAX_ITEMS = 3;

/** causal_signals: cap. */
export const CAUSAL_MAX_ITEMS = 3;
/** causal_signals: recency window in days. */
export const CAUSAL_RECENCY_WINDOW_DAYS = 30;

/** related_signals: target 3..5 items. */
export const RELATED_MIN_ITEMS = 3;
export const RELATED_MAX_ITEMS = 5;
/** related_signals: hard cap per source (GSC/GA4/Ads/SERP) to force cross-source. */
export const RELATED_MAX_PER_SOURCE = 2;

/** recent_changes: cap. */
export const RECENT_CHANGES_MAX_ITEMS = 5;
/** recent_changes: window in days. */
export const RECENT_CHANGES_WINDOW_DAYS = 30;

/** historical_analogs: cap. */
export const ANALOG_MAX_ITEMS = 3;
/** historical_analogs: min similarity (0..1) to qualify. */
export const ANALOG_MIN_SIMILARITY = 0.78;
/** historical_analogs: min sample size on an outcome rollup. */
export const ANALOG_MIN_N = 3;

/** evidence: dedupe cap. */
export const EVIDENCE_MAX_ITEMS = 8;

/** Recommended next step requires operational_feasibility ≥ this. */
export const NEXT_STEP_MIN_FEASIBILITY = 0.3;

/** DecisionConfidence band thresholds. */
export const DC_CONFIDENCE_BANDS = {
  low: 0.4,    // < 0.4 → low
  high: 0.7,   // ≥ 0.7 → high
} as const;

// ---- DC reason / gate code registry ----------------------------------------

export const DC_GATE_CODES = {
  RC_DC_LOW_COVERAGE: "Få signaler täcker scopet",
  RC_DC_STALE_SIGNALS: "Signaler är äldre än freshness-mål",
  RC_DC_SCORING_LOW_CONFIDENCE: "Underliggande opportunity_score har låg konfidens",
  RC_DC_LIMITED_CROSS_SOURCE: "Färre än tre korssignaler tillgängliga",
  RC_DC_NARRATIVE_DISABLED: "Narrativ avstängt (env eller konfidensgrind)",
  RC_DC_NARRATIVE_VALIDATION_FAILED: "Narrativ åberopade evidens som inte finns",
  RC_DC_NO_OPPORTUNITY_SCORE: "Saknar opportunity_score för scopet",
  RC_DC_NO_ANALOGS: "Inga historiska analoger uppfyllde kriterierna",
} as const;

export type DcGateCode = keyof typeof DC_GATE_CODES;

// ---- Risk derivation table -------------------------------------------------
//
// Inputs come from OpportunityScore.components. We map a small number of
// signal patterns onto a {band, drivers[]} structure. Deterministic.

export interface RiskRule {
  /** When this predicate is true on the components map, add the driver. */
  predicate: (c: Record<string, number>, vetoes: string[]) => boolean;
  driver: string;
  /** Severity added to the running risk total. */
  severity: number;
}

export const RISK_RULES: RiskRule[] = [
  {
    predicate: (c) => (c.serp_weakness ?? 0.5) < 0.3 && (c.competition_quality ?? 0.5) > 0.7,
    driver: "Stark SERP-konkurrens",
    severity: 0.30,
  },
  {
    predicate: (c) => (c.operational_feasibility ?? 0.5) < 0.4,
    driver: "Låg exekveringsgenomförbarhet",
    severity: 0.25,
  },
  {
    predicate: (c) => (c.landing_page_fit ?? 0.5) < 0.3,
    driver: "Landningssida saknas eller matchar dåligt",
    severity: 0.20,
  },
  {
    predicate: (c) => (c.historical_performance ?? 0.5) < 0.3,
    driver: "Tidigare resultat på liknande scope är svaga",
    severity: 0.20,
  },
  {
    predicate: (_c, vetoes) => vetoes.length > 0,
    driver: "Veto registrerat på scopet",
    severity: 0.50,
  },
  {
    predicate: (c) => (c.business_fit ?? 0.5) < 0.3,
    driver: "Svag ICP-/affärsmatchning",
    severity: 0.15,
  },
];

export const RISK_BAND_THRESHOLDS = {
  low: 0.20,    // < 0.20 → low
  medium: 0.45, // < 0.45 → medium
  high: 0.75,   // < 0.75 → high; ≥ → critical
} as const;

// ---- Lever table -----------------------------------------------------------
//
// Maps each component → an operator-facing "what would raise this score" line.
// Only the top-1 lever (lowest raw component subject to feasibility) is used
// for `recommended_next_step`. Phrasing is canonical Swedish.

export const COMPONENT_LEVERS: Record<string, { label: string; max_points: number }> = {
  buyer_intent: { label: "Justera målgruppen mot transaktionella sökmönster.", max_points: 18 },
  business_fit: { label: "Koppla scopet till en prioriterad tjänst innan budgetökning.", max_points: 20 },
  conversion_likelihood: { label: "Höj kvalifikationsfilter och CTA-relevans innan skalning.", max_points: 14 },
  serp_weakness: { label: "Identifiera SERP-glapp innan content/ads-investering.", max_points: 14 },
  commercial_value: { label: "Verifiera margin/AOV/LTV-antaganden för segmentet.", max_points: 18 },
  historical_performance: { label: "Validera mot tidigare utfall — kör pilot innan opskalning.", max_points: 10 },
  strategic_value: { label: "Be operatören prioritera tema/kluster om det matchar strategi.", max_points: 8 },
  operational_feasibility: { label: "Säkerställ kapacitet/leveransflöde innan investering.", max_points: 8 },
  competition_quality: { label: "Kartlägg konkurrenters position innan angrepp.", max_points: 6 },
  landing_page_fit: { label: "Bygg eller skärp landningssida för scopet innan trafikkanaler ökas.", max_points: 4 },
};

// ---- Sources for diversity capping ----------------------------------------

export const KNOWN_SOURCES = [
  "gsc",
  "ga4",
  "google_ads",
  "ads",
  "semrush",
  "serp",
  "lp",
  "operator",
  "model",
  "outcome",
] as const;

export type KnownSource = typeof KNOWN_SOURCES[number];
