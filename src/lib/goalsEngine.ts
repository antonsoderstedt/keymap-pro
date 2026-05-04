// Goals-engine: värdeformler, strategi-klassificering och språk-etiketter
// per konverteringstyp. Ersätter delvis project_revenue_settings.

import type { ConversionType } from "./workspaceConfig";

export interface ProjectGoals {
  conversion_type: ConversionType;
  conversion_label: string | null;
  conversion_value: number;
  conversion_rate_pct: number;
  primary_goal: "acquisition" | "retention" | "awareness";
  strategy_split: { acquisition: number; retention: number; awareness: number };
  brand_terms: string[];
  currency: string;
}

export const DEFAULT_GOALS: ProjectGoals = {
  conversion_type: "purchase",
  conversion_label: null,
  conversion_value: 1000,
  conversion_rate_pct: 2,
  primary_goal: "acquisition",
  strategy_split: { acquisition: 70, retention: 20, awareness: 10 },
  brand_terms: [],
  currency: "SEK",
};

// CTR-kurva från Advanced Web Ranking 2024
const CTR_CURVE = [0, 0.319, 0.247, 0.187, 0.137, 0.099, 0.072, 0.054, 0.04, 0.031, 0.025];

export function ctrAtPosition(position: number | null | undefined): number {
  if (!position || position < 1) return 0.03;
  const r = Math.max(1, Math.round(position));
  if (r <= 10) return CTR_CURVE[r];
  if (r <= 20) return 0.012;
  if (r <= 30) return 0.005;
  return 0.001;
}

/**
 * Beräknar uppskattat månadsvärde i kronor för ett sökord
 * baserat på volym, position och projektets goals.
 */
export function monthlyKeywordValue(
  searchVolume: number,
  position: number | null | undefined,
  goals: ProjectGoals,
): number {
  if (!searchVolume || searchVolume <= 0) return 0;
  const ctr = ctrAtPosition(position);
  const monthlyClicks = searchVolume * ctr;
  const conversions = monthlyClicks * (goals.conversion_rate_pct / 100);
  return Math.round(conversions * goals.conversion_value);
}

export type StrategyQuadrant =
  | "acquire_nonbrand"
  | "acquire_brand"
  | "retain_nonbrand"
  | "retain_brand";

const RETENTION_TERMS = [
  "logga in", "login", "mitt konto", "min sida", "kundtjänst",
  "support", "boka om", "avbeställ", "returnera", "spårning",
];

export function classifyKeyword(
  keyword: string,
  brandTerms: string[],
  intent?: string,
): StrategyQuadrant {
  const kw = keyword.toLowerCase();
  const isBrand = brandTerms.some(term => term && kw.includes(term.toLowerCase()));
  const isNavigational = intent === "navigational";
  const isRetentionPattern = RETENTION_TERMS.some(t => kw.includes(t));
  const isRetention = isNavigational || isRetentionPattern;

  if (isBrand && isRetention) return "retain_brand";
  if (isBrand) return "acquire_brand";
  if (isRetention) return "retain_nonbrand";
  return "acquire_nonbrand";
}

export const STRATEGY_QUADRANT_LABELS: Record<StrategyQuadrant, { label: string; short: string; description: string; color: string }> = {
  acquire_nonbrand: {
    label: "Erövra marknaden",
    short: "Nykund / Non-brand",
    description: "Hög volym, hög CPC. Content + Ads. KPI: nya leads, CAC.",
    color: "lime", // primary
  },
  acquire_brand: {
    label: "Försvara varumärket",
    short: "Nykund / Brand",
    description: "Billig CPC, hög konv. Brand-bidding. KPI: brand CTR, position 1.",
    color: "blue",
  },
  retain_nonbrand: {
    label: "Upsell / Cross-sell",
    short: "Befintlig / Non-brand",
    description: "Relaterade produkter, retargeting. KPI: AOV-ökning.",
    color: "purple",
  },
  retain_brand: {
    label: "Lojalitet / Retention",
    short: "Befintlig / Brand",
    description: "Navigations-intent. Nästan gratis trafik. KPI: retention, NPS.",
    color: "amber",
  },
};

export const CONVERSION_LABELS: Record<ConversionType, { singular: string; plural: string; verb: string; valueLabel: string }> = {
  purchase:    { singular: "order", plural: "ordrar", verb: "köpa", valueLabel: "AOV" },
  lead:        { singular: "lead", plural: "leads", verb: "konvertera", valueLabel: "Lead-värde" },
  booking:     { singular: "bokning", plural: "bokningar", verb: "boka", valueLabel: "Snittintäkt/besök" },
  trial:       { singular: "trial", plural: "trials", verb: "starta trial", valueLabel: "LTV × konv.grad" },
  store_visit: { singular: "butiksbesök", plural: "butiksbesök", verb: "besöka butik", valueLabel: "Snittköp × fotfall" },
};

export function conversionLabel(goals: Pick<ProjectGoals, "conversion_type" | "conversion_label">): { singular: string; plural: string; verb: string; valueLabel: string } {
  if (goals.conversion_label) {
    return {
      singular: goals.conversion_label,
      plural: goals.conversion_label + (goals.conversion_label.endsWith("s") ? "" : "ar"),
      verb: "konvertera",
      valueLabel: "Värde/" + goals.conversion_label,
    };
  }
  return CONVERSION_LABELS[goals.conversion_type] || CONVERSION_LABELS.purchase;
}
