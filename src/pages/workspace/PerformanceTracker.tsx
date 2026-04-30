import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { formatMoney, type RevenueSettings, DEFAULT_REVENUE } from "@/lib/revenue";
import {
  buildDailyTrend,
  buildRankings,
  summarizePeriod,
  splitPeriods,
  evaluateGoals,
  annotateActions,
  winnersAndLosers,
  type GscRow,
  type KpiTarget,
} from "@/lib/performance";
import { PerformanceKpis } from "@/components/workspace/PerformanceKpis";
import { PerformanceTrendChart } from "@/components/workspace/PerformanceTrendChart";
import { GoalsProgress } from "@/components/workspace/GoalsProgress";
import { RankingTrackerTable } from "@/components/workspace/RankingTrackerTable";

export default function PerformanceTracker() {
  const { id } = useParams<{ id: string }>();
  const currency = useProjectCurrency(id);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [revenue, setRevenue] = useState<RevenueSettings>(DEFAULT_REVENUE);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: snap }, { data: acts }, { data: tgs }, { data: rev }, { data: gs }] = await Promise.all([
      supabase.from("gsc_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("action_items").select("id,title,category,implemented_at").eq("project_id", id).not("implemented_at", "is", null).order("implemented_at", { ascending: false }).limit(50),
      supabase.from("kpi_targets").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      supabase.from("project_revenue_settings").select("*").eq("project_id", id).maybeSingle(),
      supabase.from("project_google_settings").select("gsc_site_url").eq("project_id", id).maybeSingle(),
    ]);
    setSnapshot(snap);
    setActions(acts ?? []);
    setTargets((tgs ?? []) as any);
    if (rev) setRevenue(rev as any);
    setSiteUrl(gs?.gsc_site_url ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onFetchHistory = async () => {
    if (!id || !siteUrl) {
      toast.error("Koppla ett GSC-konto i Inställningar först.");
      return;
    }
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("gsc-fetch-history", {
        body: { projectId: id, siteUrl, days: 180 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Historik hämtad — 180 dagars data sparad.");
      await load();
    } catch (e: any) {
      toast.error(`Kunde inte hämta historik: ${e.message ?? e}`);
    } finally {
      setRefreshing(false);
    }
  };

  const { trend, rankings, kpisCurrent, kpisPrevious, annotations, goals, wl } = useMemo(() => {
    const rows: GscRow[] = (snapshot?.rows as GscRow[]) ?? [];
    const dailyRows = rows.filter((r) => r.date && !r.query && !r.page);
    const queryDateRows = rows.filter((r) => r.date && r.query);
    const queryRows = rows.filter((r) => r.query && !r.date && !r.page);
    const pageRows = rows.filter((r) => r.query && r.page && !r.date);

    const trend = buildDailyTrend(dailyRows.length ? dailyRows : queryDateRows);
    const rankings = buildRankings(queryRows.length ? queryRows : aggregateFromQueryDate(queryDateRows), queryDateRows, pageRows, revenue);
    const { current, previous } = splitPeriods(trend);
    const kpisCurrent = summarizePeriod(current, rankings);
    const kpisPrevious = summarizePeriod(previous, rankings);
    const annotations = annotateActions(actions, trend);
    const goals = evaluateGoals(targets, kpisCurrent, rankings);
    const wl = winnersAndLosers(rankings);
    return { trend, rankings, kpisCurrent, kpisPrevious, annotations, goals, wl };
  }, [snapshot, actions, targets, revenue]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Laddar performance-data…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <TrendingUp className="h-3.5 w-3.5" /> Performance & rankings
          </div>
          <h1 className="font-serif text-3xl mt-1">Trend, effekt & mål</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Se hur den organiska trafiken utvecklas, vilka åtgärder som faktiskt rörde nålen, och hur ni ligger till mot målen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {snapshot && (
            <Badge variant="outline" className="text-[11px]">
              Senaste hämtning {new Date(snapshot.created_at).toLocaleDateString("sv-SE")}
            </Badge>
          )}
          <Button onClick={onFetchHistory} disabled={refreshing || !siteUrl} size="sm">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Hämtar…" : "Hämta 180 dgr historik"}
          </Button>
        </div>
      </header>

      {!snapshot ? (
        <Card className="border-border/60">
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium">Ingen GSC-data ännu</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {siteUrl ? "Klicka 'Hämta historik' för att importera 180 dagars trend och rankings." : "Koppla ett Google Search Console-konto under Inställningar för att börja."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <PerformanceKpis current={kpisCurrent} previous={kpisPrevious} />

          <PerformanceTrendChart trend={trend} annotations={annotations} />

          <GoalsProgress projectId={id!} goals={goals} onChanged={load} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUp className="h-4 w-4 text-primary" /> Vinnare
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {wl.winners.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Behöver mer historik för att se rörelser.</p>
                ) : wl.winners.map((w) => (
                  <div key={w.query} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{w.query}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="font-mono text-[11px] border-primary/40 text-primary">
                        +{w.delta?.toFixed(1)} pos
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">{formatMoney(w.yearlyValue, currency, { compact: true })}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDown className="h-4 w-4 text-destructive" /> Förlorare
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {wl.losers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Inga större ras — bra jobbat.</p>
                ) : wl.losers.map((w) => (
                  <div key={w.query} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{w.query}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="font-mono text-[11px] border-destructive/40 text-destructive">
                        {w.delta?.toFixed(1)} pos
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">{formatMoney(w.yearlyValue, currency, { compact: true })}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <RankingTrackerTable rows={rankings} currency={currency} />
        </>
      )}
    </div>
  );
}

// Om snapshoten saknar separata query-rader, aggregera från query+date
function aggregateFromQueryDate(rows: GscRow[]): GscRow[] {
  const m = new Map<string, GscRow>();
  for (const r of rows) {
    if (!r.query) continue;
    const cur = m.get(r.query) ?? { query: r.query, clicks: 0, impressions: 0, ctr: 0, position: 0 };
    cur.clicks += r.clicks || 0;
    cur.impressions += r.impressions || 0;
    cur.position = ((cur.position * (cur.impressions - (r.impressions || 0))) + (r.position || 0) * (r.impressions || 0)) / Math.max(1, cur.impressions);
    m.set(r.query, cur);
  }
  for (const v of m.values()) v.ctr = v.impressions ? v.clicks / v.impressions : 0;
  return Array.from(m.values());
}
