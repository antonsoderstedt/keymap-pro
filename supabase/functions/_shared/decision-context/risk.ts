/**
 * deriveRisk — RISK_RULES applied to opportunity-score components.
 *
 * Pure. Risk total is the sum of triggered severities, clamped to [0, 1].
 * Band is derived from RISK_BAND_THRESHOLDS.
 */

import { RISK_BAND_THRESHOLDS, RISK_RULES } from "./constants.ts";
import type { RiskAssessmentLite, ScoreSummary } from "./types.ts";

export function deriveRisk(score: ScoreSummary): RiskAssessmentLite {
  const components = score.components ?? {};
  const vetoes = score.vetoes_triggered ?? [];

  let total = 0;
  const drivers: string[] = [];
  for (const rule of RISK_RULES) {
    if (rule.predicate(components, vetoes)) {
      total += rule.severity;
      drivers.push(rule.driver);
    }
  }
  const clamped = Math.max(0, Math.min(1, total));

  let band: RiskAssessmentLite["band"];
  if (clamped < RISK_BAND_THRESHOLDS.low) band = "low";
  else if (clamped < RISK_BAND_THRESHOLDS.medium) band = "medium";
  else if (clamped < RISK_BAND_THRESHOLDS.high) band = "high";
  else band = "critical";

  return { band, drivers };
}
