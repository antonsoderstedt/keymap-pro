// Hjälpfunktioner för regler
import type { CampaignSnapshot, Evidence, ImpactEstimate } from "./types.ts";

export function microsToSek(m: number): number {
  return Math.round((m ?? 0) / 1_000_000);
}

export function cpa(c: CampaignSnapshot): number | null {
  if (!c.metrics_30d.conversions || c.metrics_30d.conversions <= 0) return null;
  return microsToSek(c.metrics_30d.cost_micros) / c.metrics_30d.conversions;
}

export function targetCpaSek(c: CampaignSnapshot): number | null {
  return c.target_cpa_micros ? microsToSek(c.target_cpa_micros) : null;
}

export function dailyBudgetSek(c: CampaignSnapshot): number {
  return microsToSek(c.daily_budget_micros);
}

export function ev(
  source: Evidence["source"],
  metric: string,
  value: number | string,
  period: Evidence["period"] = "30d",
  comparison?: { value: number | string; label: string },
): Evidence {
  return { source, metric, value, period, comparison };
}

export function impact(
  metric: ImpactEstimate["metric"],
  direction: ImpactEstimate["direction"],
  low: number,
  mid: number,
  high: number,
  horizon_days = 30,
): ImpactEstimate {
  return { metric, direction, low, mid, high, horizon_days };
}

export function clampConfidence(
  base: number,
  hasLowSig: boolean,
  hasRecentChange: boolean,
): number {
  let c = base;
  if (hasLowSig) c *= 0.7;
  if (hasRecentChange) c *= 0.6;
  return Math.max(0.1, Math.min(0.99, c));
}
