// Deterministic mapping from band → display tokens.
// Pure module: same input → same output, no React, no side effects.

import type { ConfidenceBand, RiskBand, ScoreBand } from "@/lib/types";

// Risk band tolerates "critical" coming from the writer even though the
// frontend RiskBand union does not include it — keep this map permissive.
type RiskBandWide = RiskBand | "critical";

const RISK_TONE: Record<RiskBandWide, { dot: string; label: string; sr: string }> = {
  low: { dot: "bg-emerald-500/70", label: "Låg risk", sr: "Risk: låg" },
  medium: { dot: "bg-amber-500/70", label: "Medel risk", sr: "Risk: medel" },
  high: { dot: "bg-orange-500/80", label: "Hög risk", sr: "Risk: hög" },
  critical: { dot: "bg-destructive", label: "Kritisk risk", sr: "Risk: kritisk" },
};

const CONFIDENCE_TONE: Record<ConfidenceBand, { dot: string; label: string; sr: string }> = {
  low: { dot: "bg-muted-foreground/40", label: "Låg tillförlitlighet", sr: "Tillförlitlighet: låg" },
  medium: { dot: "bg-muted-foreground/70", label: "Medel tillförlitlighet", sr: "Tillförlitlighet: medel" },
  high: { dot: "bg-foreground/80", label: "Hög tillförlitlighet", sr: "Tillförlitlighet: hög" },
};

const SCORE_TONE: Record<ScoreBand, { dot: string; label: string }> = {
  veto: { dot: "bg-destructive", label: "Vetad" },
  low: { dot: "bg-muted-foreground/40", label: "Låg" },
  medium: { dot: "bg-muted-foreground/70", label: "Medel" },
  high: { dot: "bg-foreground/80", label: "Hög" },
  critical: { dot: "bg-primary", label: "Kritisk" },
};

export function riskTone(band: string | undefined) {
  if (!band) return null;
  const key = band as RiskBandWide;
  return RISK_TONE[key] ?? null;
}

export function confidenceTone(band: ConfidenceBand) {
  return CONFIDENCE_TONE[band];
}

export function scoreTone(band: ScoreBand) {
  return SCORE_TONE[band];
}

// Gate-trigger → Swedish short label (used only when present).
const GATE_LABEL: Record<string, string> = {
  RC_DC_LOW_COVERAGE: "Få signaler",
  RC_DC_STALE_SIGNALS: "Inaktuella signaler",
  RC_DC_SCORING_LOW_CONFIDENCE: "Låg score-tillförlitlighet",
  RC_DC_LIMITED_CROSS_SOURCE: "Begränsad triangulering",
  RC_DC_PRIMARILY_GENERIC_CONTEXT: "Primärt generell kontext",
  RC_DC_NO_OPPORTUNITY_SCORE: "Saknar score",
  RC_DC_NARRATIVE_DISABLED: "Narrativ avstängd",
  RC_DC_NARRATIVE_VALIDATION_FAILED: "Narrativ förkastad",
  low_coverage: "Få signaler",
  stale_signals: "Inaktuella signaler",
  strong_contradiction: "Motsägelser",
};

export function gateLabel(code: string): string {
  return GATE_LABEL[code] ?? code;
}

// Source → Swedish label for evidence rendering.
const SOURCE_LABEL: Record<string, string> = {
  gsc: "GSC",
  ga4: "GA4",
  google_ads: "Google Ads",
  semrush: "Semrush",
  serp: "SERP",
  operator: "Operatör",
  model: "Modell",
  ads_mutation: "Ads-ändring",
  outcome_learning: "Lärdom",
  prior_action: "Tidigare åtgärd",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}
