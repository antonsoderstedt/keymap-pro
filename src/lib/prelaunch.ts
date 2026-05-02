/**
 * Pre-launch Blueprint helpers — forecast, slugify, prio-scoring.
 */
import { ctrAtPosition, estimateKeywordValue, type RevenueSettings } from "./revenue";

export const prelaunchSlugify = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type SitemapPage = {
  slug: string;
  h1: string;
  meta_title?: string;
  meta_description?: string;
  primary_kw: string;
  secondary_kws: string[];
  intent: "informational" | "commercial" | "transactional" | "navigational";
  priority: "high" | "medium" | "low";
  parent_slug?: string;
  primary_volume?: number;
  est_clicks_top3?: number;
  est_clicks_top10?: number;
  est_yearly_value?: number;
};

export type ForecastPoint = {
  month: number;        // 1..12
  avgPosition: number;
  monthlyClicks: number;
  monthlyConversions: number;
  monthlyRevenue: number;
  cumulativeRevenue: number;
};

export type Forecast = {
  pessimistic: ForecastPoint[];
  realistic: ForecastPoint[];
  optimistic: ForecastPoint[];
};

/**
 * Standard ramp-up curve for new sites: starts near pos 30, gradually
 * climbs to a target position over `months`. Pessimistic/realistic/optimistic
 * differ in target position and ramp speed.
 */
function rampPositions(months: number, targetPos: number, startPos = 30): number[] {
  const arr: number[] = [];
  for (let m = 1; m <= months; m++) {
    // Logarithmic decay
    const t = Math.min(1, Math.log(m + 1) / Math.log(months + 1));
    arr.push(startPos - (startPos - targetPos) * t);
  }
  return arr;
}

export function buildForecast(
  pages: SitemapPage[],
  settings: RevenueSettings,
  months = 12,
): Forecast {
  const totalMonthlyVolume = pages.reduce(
    (sum, p) => sum + (p.primary_volume || 0),
    0,
  );

  const scenarios: { key: keyof Forecast; targetPos: number }[] = [
    { key: "pessimistic", targetPos: 12 },
    { key: "realistic", targetPos: 6 },
    { key: "optimistic", targetPos: 3 },
  ];

  const out: Forecast = { pessimistic: [], realistic: [], optimistic: [] };

  for (const sc of scenarios) {
    const positions = rampPositions(months, sc.targetPos);
    let cum = 0;
    out[sc.key] = positions.map((pos, i) => {
      const clicks = totalMonthlyVolume * ctrAtPosition(pos);
      const conversions = clicks * (settings.conversion_rate_pct / 100);
      const revenue = Math.round(
        conversions * settings.avg_order_value * (settings.gross_margin_pct / 100),
      );
      cum += revenue;
      return {
        month: i + 1,
        avgPosition: Math.round(pos * 10) / 10,
        monthlyClicks: Math.round(clicks),
        monthlyConversions: Math.round(conversions * 10) / 10,
        monthlyRevenue: revenue,
        cumulativeRevenue: cum,
      };
    });
  }
  return out;
}

export function enrichSitemap(
  pages: SitemapPage[],
  settings: RevenueSettings,
): SitemapPage[] {
  return pages.map((p) => {
    const v = p.primary_volume || 0;
    return {
      ...p,
      slug: p.slug || prelaunchSlugify(p.h1 || p.primary_kw),
      est_clicks_top3: Math.round(v * ctrAtPosition(2)),
      est_clicks_top10: Math.round(v * ctrAtPosition(7)),
      est_yearly_value: estimateKeywordValue(v, 6, settings),
    };
  });
}

export function priorityScore(p: SitemapPage): number {
  const v = p.primary_volume || 0;
  const intentBoost =
    p.intent === "transactional" ? 2.0 :
    p.intent === "commercial" ? 1.5 :
    p.intent === "informational" ? 1.0 : 0.7;
  return Math.round(v * intentBoost);
}

export type PrelaunchStatus = "draft" | "researching" | "complete" | "failed";
