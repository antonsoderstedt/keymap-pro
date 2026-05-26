// R5 — pure helpers för Account Intelligence-vyn.
// Inga side effects, ingen DB-access. Importeras av AccountHealthCard,
// CampaignComparisonMatrix och ChangeTimeline.

export type CampaignHealth = "good" | "warn" | "bad" | "unknown";

export interface CampaignHealthInput {
  metrics_30d?: {
    roas?: number | null;
    cpa_sek?: number | null;
    cost_sek?: number | null;
  };
  target_roas?: number | null;
  target_cpa_sek?: number | null;
}

export function deriveCampaignHealth(campaign: CampaignHealthInput): CampaignHealth {
  const roas = campaign.metrics_30d?.roas;
  const cpa = campaign.metrics_30d?.cpa_sek;
  const cost = campaign.metrics_30d?.cost_sek ?? 0;
  if (cost < 100) return "unknown";
  if (campaign.target_roas != null && typeof roas === "number") {
    return roas >= campaign.target_roas ? "good" : "bad";
  }
  if (campaign.target_cpa_sek != null && typeof cpa === "number") {
    return cpa <= campaign.target_cpa_sek ? "good" : "bad";
  }
  return "warn";
}

export interface OutcomeRowLike {
  applied_at?: string | null;
  measured_7d?: any;
  measured_14d?: any;
  measured_30d?: any;
  auto_reverted_at?: string | null;
}

export interface OutcomeSummary {
  applied: number;
  measured: number;
  positive: number;
  negative: number;
  autoReverted: number;
}

/** Prioritetsordning: measured_14d > measured_7d > measured_30d. */
function pickMeasured(o: OutcomeRowLike): any | null {
  return o.measured_14d ?? o.measured_7d ?? o.measured_30d ?? null;
}

export function summarizeOutcomes(
  outcomes: OutcomeRowLike[],
  windowDays: 30 | 90 = 30,
): OutcomeSummary {
  const cutoff = Date.now() - windowDays * 86400000;
  const inWindow = outcomes.filter(
    (o) => o.applied_at && new Date(o.applied_at).getTime() >= cutoff,
  );
  let applied = 0, measured = 0, positive = 0, negative = 0, autoReverted = 0;
  for (const o of inWindow) {
    applied++;
    const m = pickMeasured(o);
    if (m) {
      measured++;
      const conv = m?.delta_pct?.conversions;
      if (typeof conv === "number") {
        if (conv > 0) positive++;
        else if (conv < 0) negative++;
      }
    }
    if (o.auto_reverted_at) autoReverted++;
  }
  return { applied, measured, positive, negative, autoReverted };
}

export function pickTopCampaignsByBudget<
  T extends { name: string; daily_budget_sek?: number | null },
>(campaigns: T[], topN = 5): { top: T[]; otherTotal: number } {
  const sorted = [...campaigns].sort(
    (a, b) => (b.daily_budget_sek ?? 0) - (a.daily_budget_sek ?? 0),
  );
  const top = sorted.slice(0, topN);
  const otherTotal = sorted.slice(topN).reduce(
    (sum, c) => sum + (c.daily_budget_sek ?? 0),
    0,
  );
  return { top, otherTotal };
}
