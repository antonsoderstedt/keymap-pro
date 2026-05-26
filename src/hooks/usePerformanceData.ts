// Hämtar all data Performance Command Center behöver i ett gemensamt anrop.
// Splittar GSC-snapshot i aktuell + jämförelseperiod, bygger rankings, plockar
// top-prioriterade action_items och senaste ads-audit health.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildDailyTrend,
  buildRankings,
  summarizePeriod,
  annotateActions,
  lastNDays,
  type DailyTrendPoint,
  type GscRow,
  type PeriodKpis,
  type RankingRow,
  type ActionAnnotation,
} from "@/lib/performance";

export type Range = "7" | "28" | "90";

export interface PriorityAction {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  expected_impact: string | null;
  expected_impact_sek: number | null;
  source_type: string | null;
  created_at: string;
}

export interface PerformanceBundle {
  loading: boolean;
  error: string | null;

  projectName: string | null;
  range: Range;
  setRange: (r: Range) => void;
  rangeDays: number;

  // SEO
  seo: {
    trendCurrent: DailyTrendPoint[];
    trendFull: DailyTrendPoint[];
    kpisCurrent: PeriodKpis;
    kpisPrevious: PeriodKpis;
    rankings: RankingRow[];
    annotations: ActionAnnotation[];
    snapshotAt: string | null;
    hasData: boolean;
  };

  // GA4
  ga4: {
    totals: Record<string, number | string> | null;
    snapshotAt: string | null;
    hasData: boolean;
  };

  // Ads
  ads: {
    healthScore: number | null;
    auditAt: string | null;
  };

  // Top action_items för "Prioriterade åtgärder"
  priorityActions: PriorityAction[];
}

function rangeToDays(r: Range): number {
  return parseInt(r, 10);
}

export function usePerformanceData(projectId: string | undefined): PerformanceBundle {
  const [range, setRange] = useState<Range>("28");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [gscRows, setGscRows] = useState<GscRow[]>([]);
  const [gscAt, setGscAt] = useState<string | null>(null);
  const [ga4Totals, setGa4Totals] = useState<Record<string, number | string> | null>(null);
  const [ga4At, setGa4At] = useState<string | null>(null);
  const [actions, setActions] = useState<PriorityAction[]>([]);
  const [implementedActions, setImplementedActions] = useState<
    { id: string; title: string; category: string; implemented_at: string }[]
  >([]);
  const [adsHealth, setAdsHealth] = useState<{ score: number | null; at: string | null }>({
    score: null,
    at: null,
  });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [projRes, gscRes, ga4Res, actsHighRes, actsImplRes, auditRes] = await Promise.all([
        supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
        supabase
          .from("gsc_snapshots")
          .select("rows,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("ga4_snapshots")
          .select("totals,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("action_items")
          .select(
            "id,title,description,category,priority,expected_impact,expected_impact_sek,source_type,created_at,status",
          )
          .eq("project_id", projectId)
          .neq("status", "done")
          .order("priority", { ascending: true }) // 'critical' < 'high' < 'medium' alphabetically — refine below
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("action_items")
          .select("id,title,category,implemented_at")
          .eq("project_id", projectId)
          .not("implemented_at", "is", null)
          .order("implemented_at", { ascending: false })
          .limit(20),
        supabase
          .from("ads_audits")
          .select("health_score,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const err =
        gscRes.error?.message ||
        ga4Res.error?.message ||
        actsHighRes.error?.message ||
        actsImplRes.error?.message ||
        null;
      setError(err);
      setProjectName((projRes.data as any)?.name ?? null);
      setGscRows(((gscRes.data?.rows as unknown as GscRow[]) ?? []).filter(Boolean));
      setGscAt(gscRes.data?.created_at ?? null);
      setGa4Totals((ga4Res.data?.totals as any) ?? null);
      setGa4At(ga4Res.data?.created_at ?? null);

      // Re-sortera actions efter explicit prio-rank
      const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const sorted = ((actsHighRes.data as PriorityAction[]) ?? [])
        .map((a) => ({ ...a, _r: rank[a.priority] ?? 99 }))
        .sort((a, b) => (a as any)._r - (b as any)._r)
        .slice(0, 5)
        .map(({ _r, ...rest }: any) => rest as PriorityAction);
      setActions(sorted);
      setImplementedActions((actsImplRes.data as any) ?? []);
      const score = (auditRes.data as any)?.health_score;
      setAdsHealth({
        score: typeof score === "number" ? score : null,
        at: (auditRes.data as any)?.created_at ?? null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const rangeDays = rangeToDays(range);

  // Bygg trend och splittra i aktuell / föregående
  const trendFull = buildDailyTrend(gscRows.filter((r) => r.date));
  const trendCurrent = lastNDays(trendFull, rangeDays);
  const cutoffPrev = trendFull.length
    ? trendFull[Math.max(0, trendFull.length - rangeDays * 2)]?.date
    : null;
  const cutoffCur = trendCurrent[0]?.date ?? null;
  const trendPrevious = cutoffPrev && cutoffCur
    ? trendFull.filter((p) => p.date >= cutoffPrev && p.date < cutoffCur)
    : [];

  // Bygg rankings (query-rader utan datum) för current period
  const queryRows = gscRows.filter((r) => r.query && !r.date);
  const queryDateRows = gscRows.filter((r) => r.query && r.date);
  const pageRows = gscRows.filter((r) => r.page && r.query);
  const rankings = buildRankings(queryRows, queryDateRows, pageRows);

  const kpisCurrent = summarizePeriod(trendCurrent, rankings);
  const kpisPrevious = summarizePeriod(trendPrevious, rankings);

  const annotations = annotateActions(implementedActions, trendFull);

  const ga4HasData =
    !!ga4Totals &&
    (Number(ga4Totals.sessions) > 0 ||
      Number(ga4Totals.totalUsers ?? ga4Totals.users) > 0 ||
      Number(ga4Totals.screenPageViews ?? ga4Totals.pageviews) > 0);

  return {
    loading,
    error,
    projectName,
    range,
    setRange,
    rangeDays,
    seo: {
      trendCurrent,
      trendFull,
      kpisCurrent,
      kpisPrevious,
      rankings,
      annotations,
      snapshotAt: gscAt,
      hasData: trendCurrent.length > 0,
    },
    ga4: {
      totals: ga4Totals,
      snapshotAt: ga4At,
      hasData: ga4HasData,
    },
    ads: {
      healthScore: adsHealth.score,
      auditAt: adsHealth.at,
    },
    priorityActions: actions,
  };
}
