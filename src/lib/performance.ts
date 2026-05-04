/**
 * Performance helpers — bygg trend, jämför perioder, måluppföljning från GSC-data.
 */
import {
  estimateKeywordValue,
  estimatePositionUplift,
  type RevenueSettings,
  DEFAULT_REVENUE,
} from "./revenue";

export interface GscRow {
  date?: string;
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DailyTrendPoint {
  date: string;
  clicks: number;
  impressions: number;
  position: number; // weighted snitt
  ctr: number;
}

export interface RankingRow {
  query: string;
  position: number;
  positionPrev: number | null;
  delta: number | null;
  clicks: number;
  impressions: number;
  ctr: number;
  url?: string;
  yearlyValue: number;
  upliftToTop3: number;
  trend: number[]; // sparkline (klick per period)
}

export interface PeriodKpis {
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
  topTenShare: number; // andel queries i topp 10 (0-1)
}

/* ---------- Trend ---------- */

export function buildDailyTrend(rows: GscRow[]): DailyTrendPoint[] {
  const byDate = new Map<string, { c: number; i: number; pSum: number; pCount: number }>();
  for (const r of rows) {
    if (!r.date) continue;
    const cur = byDate.get(r.date) ?? { c: 0, i: 0, pSum: 0, pCount: 0 };
    cur.c += r.clicks || 0;
    cur.i += r.impressions || 0;
    if (r.position) {
      cur.pSum += r.position * (r.impressions || 1);
      cur.pCount += r.impressions || 1;
    }
    byDate.set(r.date, cur);
  }
  return Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      clicks: v.c,
      impressions: v.i,
      position: v.pCount ? +(v.pSum / v.pCount).toFixed(1) : 0,
      ctr: v.i ? +(v.c / v.i).toFixed(4) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Begränsa trenden till sista N dagar */
export function lastNDays(trend: DailyTrendPoint[], days: number): DailyTrendPoint[] {
  if (trend.length === 0) return trend;
  const cutoff = new Date(trend[trend.length - 1].date);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return trend.filter((p) => p.date >= cutoffStr);
}

/* ---------- KPI:er och period-jämförelse ---------- */

export function summarizePeriod(
  trend: DailyTrendPoint[],
  rankings: RankingRow[],
): PeriodKpis {
  const clicks = trend.reduce((s, p) => s + p.clicks, 0);
  const impressions = trend.reduce((s, p) => s + p.impressions, 0);
  const ctr = impressions ? clicks / impressions : 0;
  // Vägd snittposition på trend
  const wp = trend.reduce(
    (acc, p) => {
      acc.s += p.position * p.impressions;
      acc.c += p.impressions;
      return acc;
    },
    { s: 0, c: 0 },
  );
  const position = wp.c ? wp.s / wp.c : 0;
  const ranked = rankings.filter((r) => r.position > 0);
  const topTen = ranked.filter((r) => r.position <= 10).length;
  const topTenShare = ranked.length ? topTen / ranked.length : 0;
  return { clicks, impressions, position, ctr, topTenShare };
}

export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/** Dela trend i två lika långa perioder (current = sista halvan) */
export function splitPeriods(trend: DailyTrendPoint[]): {
  current: DailyTrendPoint[];
  previous: DailyTrendPoint[];
} {
  if (trend.length < 4) return { current: trend, previous: [] };
  const mid = Math.floor(trend.length / 2);
  return { previous: trend.slice(0, mid), current: trend.slice(mid) };
}

/* ---------- Rankings per query ---------- */

/**
 * Bygger ranking-rader. Tar både query-rader och query+date-rader om de finns.
 * Använder bara query-rader (utan date) för "nu"-värden, och query+date-raderna
 * för delta + sparkline.
 */
export function buildRankings(
  queryRows: GscRow[],
  queryDateRows: GscRow[],
  pageRows: GscRow[],
  revenue: RevenueSettings = DEFAULT_REVENUE,
  cpcByKeyword?: Map<string, number>, // unused in v1
): RankingRow[] {
  // Best URL per query: ta sidan med flest klick som matchat
  const queryToUrl = new Map<string, string>();
  for (const p of pageRows) {
    if (p.query && p.page && !queryToUrl.has(p.query)) queryToUrl.set(p.query, p.page);
  }

  // Sparkline + delta från queryDateRows (gruppera per query → list per dag)
  const series = new Map<string, Map<string, { c: number; pos: number; imp: number }>>();
  for (const r of queryDateRows) {
    if (!r.query || !r.date) continue;
    if (!series.has(r.query)) series.set(r.query, new Map());
    series.get(r.query)!.set(r.date, {
      c: r.clicks || 0,
      pos: r.position || 0,
      imp: r.impressions || 0,
    });
  }

  return queryRows
    .filter((r) => r.query && (r.impressions || r.clicks))
    .map((r) => {
      const q = r.query!;
      const daily = series.get(q);
      let positionPrev: number | null = null;
      let trend: number[] = [];
      if (daily && daily.size > 1) {
        const sorted = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        trend = sorted.map(([, v]) => v.c);
        // Snittposition första vs senaste tredjedelen
        const third = Math.max(1, Math.floor(sorted.length / 3));
        const first = sorted.slice(0, third);
        const last = sorted.slice(-third);
        const avgFirst =
          first.reduce((s, [, v]) => s + (v.pos || 0) * (v.imp || 1), 0) /
          Math.max(1, first.reduce((s, [, v]) => s + (v.imp || 1), 0));
        const avgLast =
          last.reduce((s, [, v]) => s + (v.pos || 0) * (v.imp || 1), 0) /
          Math.max(1, last.reduce((s, [, v]) => s + (v.imp || 1), 0));
        positionPrev = avgFirst > 0 ? +avgFirst.toFixed(1) : null;
        // Använd avgLast som "current" om finns, annars r.position
        if (avgLast > 0) (r as any).position = +avgLast.toFixed(1);
      }
      const pos = r.position || 0;
      const delta = positionPrev != null ? +(positionPrev - pos).toFixed(1) : null; // +ve = upp i ranking
      // Värde: använd impressions/månad som proxy för volym (impressions ≈ volym för transaktionsord)
      const monthlyVolume = (r.impressions || 0) * (30 / Math.max(1, queryDateRowsSpanDays(queryDateRows)));
      const yearlyValue = estimateKeywordValue(monthlyVolume, pos, revenue);
      const upliftToTop3 = estimatePositionUplift(monthlyVolume, pos, 3, revenue);

      return {
        query: q,
        position: pos,
        positionPrev,
        delta,
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        ctr: r.ctr || 0,
        url: queryToUrl.get(q),
        yearlyValue,
        upliftToTop3,
        trend,
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
}

function queryDateRowsSpanDays(rows: GscRow[]): number {
  let min = "";
  let max = "";
  for (const r of rows) {
    if (!r.date) continue;
    if (!min || r.date < min) min = r.date;
    if (!max || r.date > max) max = r.date;
  }
  if (!min || !max) return 30;
  const d = (new Date(max).getTime() - new Date(min).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(d));
}

/* ---------- Vinnare & förlorare ---------- */

export function winnersAndLosers(rankings: RankingRow[], n = 5): {
  winners: RankingRow[];
  losers: RankingRow[];
} {
  const withDelta = rankings.filter((r) => r.delta != null && r.impressions > 20);
  const winners = [...withDelta].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, n);
  const losers = [...withDelta].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, n);
  return { winners, losers };
}

/* ---------- Mål-progress ---------- */

export interface KpiTarget {
  id: string;
  metric: string; // 'clicks' | 'position' | 'top10_share' | 'top20_count'
  label: string;
  target_value: number;
  direction: "increase" | "decrease";
  timeframe: string;
  channel: string | null;
  is_active: boolean;
}

export interface GoalProgress {
  target: KpiTarget;
  currentValue: number;
  progressPct: number; // 0-100, 100 = nått
  status: "on_track" | "behind" | "achieved";
}

export function evaluateGoals(
  targets: KpiTarget[],
  kpis: PeriodKpis,
  rankings: RankingRow[],
  extraMetrics?: Record<string, number | null | undefined>,
): GoalProgress[] {
  return targets
    .filter((t) => t.is_active)
    .map((t) => {
      let currentValue = 0;
      switch (t.metric) {
        case "clicks":
          currentValue = kpis.clicks;
          break;
        case "impressions":
          currentValue = kpis.impressions;
          break;
        case "position":
          currentValue = kpis.position;
          break;
        case "top10_share":
          currentValue = kpis.topTenShare * 100;
          break;
        case "top20_count":
          currentValue = rankings.filter((r) => r.position > 0 && r.position <= 20).length;
          break;
        default:
          currentValue = Number(extraMetrics?.[t.metric] ?? 0) || 0;
      }
      let progressPct = 0;
      let status: GoalProgress["status"] = "behind";
      if (t.direction === "increase") {
        progressPct = t.target_value ? Math.min(100, (currentValue / t.target_value) * 100) : 0;
        if (currentValue >= t.target_value) status = "achieved";
        else if (progressPct >= 70) status = "on_track";
      } else {
        // decrease: lägre är bättre (t.ex. position)
        if (currentValue <= t.target_value && currentValue > 0) {
          status = "achieved";
          progressPct = 100;
        } else if (currentValue > 0) {
          // progress = hur nära vi är, använd inverst förhållande
          progressPct = Math.min(100, Math.max(0, ((20 - currentValue) / (20 - t.target_value)) * 100));
          if (progressPct >= 70) status = "on_track";
        }
      }
      return { target: t, currentValue, progressPct, status };
    });
}

/* ---------- Effekt av åtgärder ---------- */

export interface ActionAnnotation {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: string;
  beforeClicks?: number;
  afterClicks?: number;
  deltaClicks?: number;
  deltaPct?: number;
}

export function annotateActions(
  actions: { id: string; title: string; category: string; implemented_at: string }[],
  trend: DailyTrendPoint[],
  windowDays = 14,
): ActionAnnotation[] {
  return actions.map((a) => {
    const date = a.implemented_at.slice(0, 10);
    const idx = trend.findIndex((p) => p.date >= date);
    let beforeClicks: number | undefined;
    let afterClicks: number | undefined;
    if (idx > 0) {
      const before = trend.slice(Math.max(0, idx - windowDays), idx);
      const after = trend.slice(idx, Math.min(trend.length, idx + windowDays));
      beforeClicks = before.reduce((s, p) => s + p.clicks, 0);
      afterClicks = after.reduce((s, p) => s + p.clicks, 0);
    }
    const deltaClicks =
      beforeClicks != null && afterClicks != null ? afterClicks - beforeClicks : undefined;
    const deltaPct =
      beforeClicks && afterClicks != null ? ((afterClicks - beforeClicks) / beforeClicks) * 100 : undefined;
    return { id: a.id, date, title: a.title, category: a.category, beforeClicks, afterClicks, deltaClicks, deltaPct };
  });
}
