import type { ProjectGoals, ClusterSummary, GscRow } from "./types.ts";

const CTR_BY_POS: Record<number, number> = {
  1: 0.319, 2: 0.247, 3: 0.187, 4: 0.137, 5: 0.099,
  6: 0.072, 7: 0.054, 8: 0.04, 9: 0.031, 10: 0.025,
};

export function ctrAtPosition(pos: number): number {
  const r = Math.max(1, Math.round(pos));
  if (r <= 10) return CTR_BY_POS[r] ?? 0.025;
  if (r <= 20) return 0.012;
  if (r <= 30) return 0.005;
  return 0.001;
}

/** Kronvärde per månad för ett sökord vid given position */
export function monthlyKeywordValue(
  volume: number,
  position: number,
  goals: ProjectGoals | null
): number {
  if (!goals || !volume) return 0;
  const clicks = volume * ctrAtPosition(position);
  const convs = clicks * (goals.conversion_rate_pct / 100);
  return Math.round(convs * goals.conversion_value);
}

/** Uplift-värde per månad om position förbättras */
export function monthlyUplift(
  volume: number,
  fromPos: number,
  toPos: number,
  goals: ProjectGoals | null
): number {
  return Math.max(
    0,
    monthlyKeywordValue(volume, toPos, goals) -
      monthlyKeywordValue(volume, fromPos, goals)
  );
}

export function isBrandTerm(keyword: string, brandTerms: string[]): boolean {
  const lower = keyword.toLowerCase();
  return brandTerms.some((t) => t && lower.includes(t.toLowerCase()));
}

export function matchGscToCluster(
  cluster: ClusterSummary,
  gscRows: GscRow[]
): GscRow[] {
  const clusterKws = new Set(cluster.keywords.map((k) => k.keyword.toLowerCase()));
  return gscRows.filter((r) => clusterKws.has(r.keyword.toLowerCase()));
}

export function calcSiteHealthScore(issues: { severity: string }[]): number {
  const weights: Record<string, number> = { high: 10, medium: 4, low: 1 };
  const penalty = issues.reduce(
    (sum, i) => sum + (weights[i.severity] || 0),
    0
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}
