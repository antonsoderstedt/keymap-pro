// Root-cause tree — om en högnivåorsak slår, nedgradera lägre symptom på samma kampanj.
import type { Diagnosis, TreeLevel } from "./types.ts";

const LEVEL_ORDER: TreeLevel[] = [
  "account",
  "strategy",
  "structure",
  "budget_targets",
  "targeting",
  "creative",
  "keywords",
  "landing",
];

export function applyRootCauseTree(diagnoses: Diagnosis[]): Diagnosis[] {
  const sorted = [...diagnoses].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
  );

  const rootByCampaign = new Map<string, string>();

  for (const d of sorted) {
    const campaignIds = d.scope_ref.map((r) => r.id).filter(Boolean);

    // Account-nivå: rotorsak för ALLA kampanjer
    if (d.level === "account") {
      for (const c of campaignIds) {
        if (!rootByCampaign.has(c)) rootByCampaign.set(c, d.id);
      }
      continue;
    }

    let isSymptom = false;
    for (const cid of campaignIds) {
      if (rootByCampaign.has(cid)) {
        isSymptom = true;
      } else {
        rootByCampaign.set(cid, d.id);
      }
    }
    if (isSymptom) {
      d.is_symptom_of = campaignIds
        .map((c) => rootByCampaign.get(c))
        .find((id) => id && id !== d.id);
      if (d.severity === "critical") d.severity = "warn";
      else if (d.severity === "warn") d.severity = "info";
    }
  }

  return sorted;
}

export function detectBrand(campaignName: string, brandTerms: string[]): boolean {
  if (!brandTerms?.length) return false;
  const lower = campaignName.toLowerCase();
  return brandTerms.some((term) => term && lower.includes(term.toLowerCase()));
}

export function estimateValue(
  impact: { metric: string; direction: string; mid: number },
  goals: { conversion_value: number } | null,
): number {
  if (!goals) return 0;
  if (impact.metric === "conversions") {
    return Math.round(impact.mid * (goals.conversion_value || 0));
  }
  if (impact.metric === "spend" && impact.direction === "down") {
    return Math.round(impact.mid);
  }
  return 0;
}
