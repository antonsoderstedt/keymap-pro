import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Activity, MousePointerClick, Target, Users, ListChecks, ArrowRight,
  Sparkles, TrendingUp, TrendingDown, Search, Megaphone, Layers, Rocket,
} from "lucide-react";
import { useBrandKit } from "@/hooks/useBrandKit";
import { formatMoney } from "@/lib/revenue";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { useProjectGoals } from "@/hooks/useProjectGoals";
import RoiOverview from "@/components/workspace/RoiOverview";
import { OnboardingChecklist } from "@/components/workspace/OnboardingChecklist";
import { cn } from "@/lib/utils";

const CONVERSION_LABEL: Record<string, string> = {
  purchase: "Ordrar",
  lead: "Leads",
  booking: "Bokningar",
  trial: "Trials",
  store_visit: "Butiksbesök",
  signup: "Registreringar",
  contact: "Kontakter",
};

function trendPct(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function TrendBadge({ pct, lowerIsBetter = false }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct == null) return null;
  const isPositive = lowerIsBetter ? pct < 0 : pct >= 0;
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-1 mt-1">
      <Icon className={cn("h-3 w-3", isPositive ? "text-emerald-500" : "text-red-500")} />
      <span className={cn("text-xs font-medium", isPositive ? "text-emerald-500" : "text-red-500")}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
      </span>
      <span className="text-xs text-muted-foreground">vs förra perioden</span>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { palette } = useBrandKit(id);
  const currency = useProjectCurrency(id);
  const { goals: projectGoals } = useProjectGoals(id);
  const [project, setProject] = useState<any>(null);
  const [data, setData] = useState<any>({
    ga4: null, ga4Prev: null,
    gsc: null, gscPrev: null,
    actions: [], targets: [], briefing: null,
    baseline: null, latestBaseline: null,
    topQueries: [], adsCampaigns: [], wastedSpend: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [
        proj, ga4Snaps, gscSnaps, actions, targets, briefing,
        baselines, topQueries, adsCampaigns, wasted,
      ] = await Promise.all([
        supabase.from("projects").select("name, company").eq("id", id).maybeSingle(),
        supabase.from("ga4_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(2),
        supabase.from("gsc_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(2),
        supabase.from("action_items").select("*").eq("project_id", id),
        supabase.from("kpi_targets").select("*").eq("project_id", id).eq("is_active", true),
        supabase.from("weekly_briefings").select("week_start,total_value_at_stake_sek,created_at").eq("project_id", id).order("week_start", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("project_baselines").select("*").eq("project_id", id).order("snapshot_date", { ascending: true }),
        supabase.from("gsc_snapshots").select("rows").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("ads_audits").select("payload, created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("ads_audits").select("payload").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const ga4Rows = ga4Snaps.data || [];
      const gscRows = gscSnaps.data || [];
      const baselineRows = baselines.data || [];
      const baseline = baselineRows.find((b: any) => b.is_baseline) || baselineRows[0] || null;
      const latestBaseline = baselineRows[baselineRows.length - 1] || null;

      // Top queries från senaste GSC-snapshot
      const queryRows = (topQueries.data?.rows as any[]) || [];
      const topQ = queryRows
        .filter((r) => r.query)
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 10);

      // Ads-kampanjer
      const adsPayload: any = adsCampaigns.data?.payload || {};
      const campaigns = adsPayload.campaigns || [];

      setProject(proj.data);
      setData({
        ga4: ga4Rows[0] || null,
        ga4Prev: ga4Rows[1] || null,
        gsc: gscRows[0] || null,
        gscPrev: gscRows[1] || null,
        actions: actions.data || [],
        targets: targets.data || [],
        briefing: briefing.data,
        baseline,
        latestBaseline: latestBaseline && baseline && latestBaseline.id !== baseline.id ? latestBaseline : null,
        topQueries: topQ,
        adsCampaigns: campaigns,
        wastedSpend: adsPayload.wasted_spend_sek || null,
      });
      setLoading(false);
    })();
  }, [id]);

  const ga4Totals = data.ga4?.totals || {};
  const ga4PrevTotals = data.ga4Prev?.totals || {};
  const gscTotals = data.gsc?.totals || {};
  const gscPrevTotals = data.gscPrev?.totals || {};

  const openActions = data.actions.filter((a: any) => a.status !== "done" && a.status !== "archived");
  const doneActions = data.actions.filter((a: any) => a.status === "done");
  const implementedActions = data.actions.filter((a: any) => a.implemented_at);

  // Dynamisk konverteringsetikett
  const conversionLabel = projectGoals.conversion_label
    || CONVERSION_LABEL[projectGoals.conversion_type as string]
    || "Konverteringar";

  const kpis = [
    {
      label: "Organiska klick",
      value: gscTotals.clicks ?? "—",
      icon: MousePointerClick,
      accent: palette.primary,
      trend: trendPct(gscTotals.clicks, gscPrevTotals.clicks),
    },
    {
      label: "Sessioner",
      value: ga4Totals.sessions ?? "—",
      icon: Activity,
      accent: palette.secondary,
      trend: trendPct(ga4Totals.sessions, ga4PrevTotals.sessions),
    },
    {
      label: conversionLabel,
      value: ga4Totals.conversions ?? "—",
      icon: Target,
      accent: palette.accent,
      trend: trendPct(ga4Totals.conversions, ga4PrevTotals.conversions),
    },
    {
      label: "Användare",
      value: ga4Totals.users ?? "—",
      icon: Users,
      accent: palette.success,
      trend: trendPct(ga4Totals.users, ga4PrevTotals.users),
    },
  ];

  // "Sedan start" — kräver baseline + senare snapshot
  const showSinceStart = data.baseline && data.latestBaseline;
  const baselineMetrics = data.baseline?.metrics || {};
  const latestMetrics = data.latestBaseline?.metrics || {};
  const sinceStartItems = showSinceStart ? [
    { label: "Organiska klick", current: latestMetrics.gsc_clicks, prev: baselineMetrics.gsc_clicks },
    { label: conversionLabel, current: latestMetrics.ga4_conversions, prev: baselineMetrics.ga4_conversions },
    { label: "Sessioner", current: latestMetrics.ga4_sessions, prev: baselineMetrics.ga4_sessions },
  ].map((it) => ({ ...it, pct: trendPct(it.current, it.prev) })) : [];

  const baselineDate = data.baseline?.snapshot_date
    ? new Date(data.baseline.snapshot_date).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })
    : "";

  const headerTitle = project?.company || project?.name || "Översikt";

  // Datakällor — för kanal-split
  const hasGSCData = !!data.gsc;
  const hasAdsData = data.adsCampaigns.length > 0 || data.wastedSpend != null;
  const hasGA4Data = !!data.ga4;
  const noChannelData = !hasGSCData && !hasAdsData && !hasGA4Data;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">{headerTitle}</h1>
      </div>

      {id && <OnboardingChecklist projectId={id} />}

      {/* Briefing-band */}
      {data.briefing ? (
        <Card
          className="bg-gradient-to-r from-primary/15 via-card to-card border-primary/30 cursor-pointer hover:border-primary/60 transition-colors"
          onClick={() => navigate(`/clients/${id}/reports`)}
        >
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Senaste briefing — v.{data.briefing.week_start}</div>
                <div className="font-serif text-xl mt-0.5 truncate">
                  Värde att hämta hem: <span className="text-primary">{formatMoney(data.briefing.total_value_at_stake_sek, currency, { compact: true })}</span>
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      ) : (
        <Card
          className="border-dashed border-primary/40 cursor-pointer hover:bg-card/80 transition-colors"
          onClick={() => navigate(`/clients/${id}/reports`)}
        >
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <div className="font-serif text-base">Generera veckans strategibriefing</div>
                <div className="text-xs text-muted-foreground">AI summerar vinster, risker och prioriterade åtgärder med kronvärde.</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Sedan start-kort — visas bara om baseline + senare data finns */}
      {showSinceStart && sinceStartItems.some((i) => i.pct != null) && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="h-4 w-4 text-primary" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Sedan start ({baselineDate})
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {sinceStartItems.filter((i) => i.pct != null).map((item) => (
                <div key={item.label}>
                  <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                  <div className="flex items-center gap-1.5">
                    {item.pct! >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className={cn("font-serif text-2xl", item.pct! >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {item.pct! >= 0 ? "+" : ""}{item.pct!.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {implementedActions.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Baserat på {implementedActions.length} implementerade åtgärder.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI-kort med trendpilar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{k.label}</span>
                  <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${k.accent}20` }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: k.accent }} />
                  </div>
                </div>
                <div className="font-serif text-3xl">
                  {typeof k.value === "number" ? k.value.toLocaleString("sv-SE") : k.value}
                </div>
                <TrendBadge pct={k.trend} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Kanal-split */}
      {noChannelData ? (
        <Card className="border-dashed border-primary/40">
          <CardContent className="p-6 flex items-start gap-3">
            <Layers className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Koppla GA4 och Search Console för att se kanaldata</p>
              <p className="text-sm text-muted-foreground mt-1">Det tar 2 minuter.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/clients/${id}/settings?tab=integrations`)}
              >
                Gå till Inställningar <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Kanaler</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={hasGSCData ? "organic" : hasAdsData ? "paid" : "all"}>
              <TabsList>
                <TabsTrigger value="organic" disabled={!hasGSCData} className="gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Organisk
                </TabsTrigger>
                <TabsTrigger value="paid" disabled={!hasAdsData} className="gap-1.5">
                  <Megaphone className="h-3.5 w-3.5" /> Betald
                </TabsTrigger>
                <TabsTrigger value="all" disabled={!hasGA4Data} className="gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Alla kanaler
                </TabsTrigger>
              </TabsList>

              <TabsContent value="organic" className="mt-4">
                {data.topQueries.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Ingen sökorddata tillgänglig än.</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium pb-2 border-b border-border">
                      <div className="col-span-6">Sökord</div>
                      <div className="col-span-2 text-right">Klick</div>
                      <div className="col-span-2 text-right">Visningar</div>
                      <div className="col-span-2 text-right">Position</div>
                    </div>
                    {data.topQueries.map((q: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-2 text-sm py-1.5 hover:bg-muted/30 rounded">
                        <div className="col-span-6 truncate">{q.query}</div>
                        <div className="col-span-2 text-right font-mono">{(q.clicks || 0).toLocaleString("sv-SE")}</div>
                        <div className="col-span-2 text-right font-mono text-muted-foreground">{(q.impressions || 0).toLocaleString("sv-SE")}</div>
                        <div className="col-span-2 text-right font-mono">{(q.position || 0).toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="paid" className="mt-4">
                <div className="space-y-3">
                  {data.wastedSpend != null && (
                    <div className="flex items-center justify-between p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
                      <span className="text-sm">Wasted spend (30d)</span>
                      <span className="font-mono text-sm text-amber-600 dark:text-amber-400">
                        {formatMoney(data.wastedSpend, currency, { compact: true })}
                      </span>
                    </div>
                  )}
                  {data.adsCampaigns.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium pb-2 border-b border-border">
                        <div className="col-span-6">Kampanj</div>
                        <div className="col-span-3 text-right">Spend</div>
                        <div className="col-span-3 text-right">ROAS</div>
                      </div>
                      {data.adsCampaigns.slice(0, 8).map((c: any, i: number) => (
                        <div key={i} className="grid grid-cols-12 gap-2 text-sm py-1.5 hover:bg-muted/30 rounded">
                          <div className="col-span-6 truncate">{c.name || c.campaign_name || "—"}</div>
                          <div className="col-span-3 text-right font-mono">{formatMoney(c.spend_sek || c.cost || 0, currency, { compact: true })}</div>
                          <div className="col-span-3 text-right font-mono">{c.roas != null ? `${c.roas.toFixed(2)}×` : "—"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">Kör en Ads-audit för att se kampanjdata här.</p>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${id}/google-ads`)} className="gap-1">
                    Öppna Google Ads <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Översikt av all trafik från GA4. För djupare paid vs organic-analys, gå till Google Ads.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Sessioner</div>
                    <div className="font-serif text-2xl">{(ga4Totals.sessions || 0).toLocaleString("sv-SE")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Användare</div>
                    <div className="font-serif text-2xl">{(ga4Totals.users || 0).toLocaleString("sv-SE")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{conversionLabel}</div>
                    <div className="font-serif text-2xl">{(ga4Totals.conversions || 0).toLocaleString("sv-SE")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Engagemang</div>
                    <div className="font-serif text-2xl">
                      {ga4Totals.engagement_rate != null ? `${(ga4Totals.engagement_rate * 100).toFixed(0)}%` : "—"}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* ROI */}
      {id && (
        <RoiOverview
          projectId={id}
          emptyState={
            <Card className="border-dashed">
              <CardContent className="p-6 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Kör din första sökordsanalys för att se estimerat värde per kluster</p>
                  <p className="text-sm text-muted-foreground mt-1">Det tar ~2 minuter.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(`/project/${id}`)}>
                    Kör sökordsanalys <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          }
        />
      )}

      {/* Åtgärder + Mål */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Åtgärder
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat label="Öppna" value={openActions.length} />
              <Stat label="Implementerade" value={implementedActions.length} />
              <Stat label="Klara" value={doneActions.length} />
            </div>
            <Button variant="outline" className="gap-2" onClick={() => navigate(`/clients/${id}/actions`)}>
              Öppna Åtgärder <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Mål & progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.targets.length === 0 ? (
              <div>
                <p className="text-sm text-muted-foreground mb-3">Sätt KPI-mål för att spåra progress.</p>
                <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${id}/settings`)}>
                  Sätt mål
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {data.targets.slice(0, 5).map((t: any) => {
                  const target = Number(t.target_value) || 0;
                  // För enkelhet visar vi bara mål + label här. Full progress-beräkning sker i Settings.
                  return (
                    <div key={t.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{t.label}</span>
                        <Badge variant="secondary" className="shrink-0 font-mono text-xs">{target.toLocaleString("sv-SE")}</Badge>
                      </div>
                      <Progress value={0} className="h-1.5" />
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(`/clients/${id}/settings`)}>
                  Hantera mål →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-serif text-2xl">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
