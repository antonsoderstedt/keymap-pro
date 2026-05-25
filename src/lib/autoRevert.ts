// Auto-revert policy: pure helper mirrored in cron-ads-outcomes edge function.
// Operatören sätter policy på en batch av proposals; efter mätning utvärderar
// cron om revert ska köras.

export type AutoRevertMetric = "ctr" | "clicks" | "cost" | "conversions";

export type AutoRevertPolicy = {
  metric: AutoRevertMetric;
  threshold_pct: number; // negative (e.g. -20 = revert if drops 20%)
  window_days: 7 | 14 | 30;
  enabled: boolean;
};

export function evaluateAutoRevert(
  policy: AutoRevertPolicy,
  deltaPctByMetric: Partial<Record<AutoRevertMetric, number | null | undefined>>,
): { revert: boolean; reason: string } {
  if (!policy.enabled) return { revert: false, reason: "disabled" };
  const delta = deltaPctByMetric[policy.metric];
  if (typeof delta !== "number") return { revert: false, reason: "no_measurement" };
  if (delta <= policy.threshold_pct) {
    return {
      revert: true,
      reason: `${policy.metric} ${delta}% (threshold ${policy.threshold_pct}%)`,
    };
  }
  return { revert: false, reason: "within_threshold" };
}

export const DEFAULT_AUTO_REVERT_POLICY: AutoRevertPolicy = {
  metric: "ctr",
  threshold_pct: -20,
  window_days: 7,
  enabled: false,
};

export const METRIC_LABEL: Record<AutoRevertMetric, string> = {
  ctr: "CTR",
  clicks: "Klick",
  cost: "Kostnad",
  conversions: "Konverteringar",
};
