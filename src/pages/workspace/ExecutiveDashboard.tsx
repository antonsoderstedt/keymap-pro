import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, MousePointerClick, Target, Users, ListChecks, ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBrandKit } from "@/hooks/useBrandKit";
import { formatMoney } from "@/lib/revenue";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import RoiOverview from "@/components/workspace/RoiOverview";
import { OnboardingChecklist } from "@/components/workspace/OnboardingChecklist";

export default function ExecutiveDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { palette } = useBrandKit(id);
  const currency = useProjectCurrency(id);
  const [data, setData] = useState<any>({ ga4: null, gsc: null, actions: [], targets: [], briefing: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [ga4, gsc, actions, targets, briefing] = await Promise.all([
        supabase.from("ga4_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("gsc_snapshots").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("action_items").select("*").eq("project_id", id),
        supabase.from("kpi_targets").select("*").eq("project_id", id).eq("is_active", true),
        supabase.from("weekly_briefings").select("week_start,total_value_at_stake_sek,created_at").eq("project_id", id).order("week_start", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setData({
        ga4: ga4.data,
        gsc: gsc.data,
        actions: actions.data || [],
        targets: targets.data || [],
        briefing: briefing.data,
      });
      setLoading(false);
    })();
  }, [id]);

  const ga4Totals = data.ga4?.totals || {};
  const gscTotals = data.gsc?.totals || {};
  const openActions = data.actions.filter((a: any) => a.status !== "done" && a.status !== "archived");
  const doneActions = data.actions.filter((a: any) => a.status === "done");
  const implementedActions = data.actions.filter((a: any) => a.implemented_at);

  const kpis = [
    { label: "Organiska klick", value: gscTotals.clicks ?? "—", icon: MousePointerClick, accent: palette.primary },
    { label: "Sessioner", value: ga4Totals.sessions ?? "—", icon: Activity, accent: palette.secondary },
    { label: "Konverteringar", value: ga4Totals.conversions ?? "—", icon: Target, accent: palette.accent },
    { label: "Användare", value: ga4Totals.users ?? "—", icon: Users, accent: palette.success },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Executive</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toppnivå-vy: KPIer, mål-progress och åtgärder. Brand Kit appliceras på exporter.
        </p>
      </div>

      {/* Weekly briefing-band */}
      {data.briefing ? (
        <Card
          className="bg-gradient-to-r from-primary/15 via-card to-card border-primary/30 cursor-pointer hover:border-primary/60 transition-colors"
          onClick={() => navigate(`/clients/${id}/briefing`)}
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
          onClick={() => navigate(`/clients/${id}/briefing`)}
        >
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <div className="font-serif text-base">Generera veckans strategibriefing</div>
                <div className="text-xs text-muted-foreground">AI summerar vinster, risker och prioriterade actions med kronvärde.</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
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
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ROI Intelligence */}
      {id && <RoiOverview projectId={id} />}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Action summary */}
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
              Öppna Action Tracker <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* KPI targets */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Mål</CardTitle>
          </CardHeader>
          <CardContent>
            {data.targets.length === 0 ? (
              <div>
                <p className="text-sm text-muted-foreground mb-3">Inga mål satta.</p>
                <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${id}/settings`)}>
                  Sätt KPI-mål
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {data.targets.slice(0, 5).map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{t.label}</span>
                    <Badge variant="secondary" className="shrink-0">{t.target_value}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(!data.ga4 || !data.gsc) && (
        <Card className="border-dashed">
          <CardContent className="p-5 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Koppla all data för full översikt</p>
              <p className="text-muted-foreground mt-1">
                {!data.ga4 && "GA4-data saknas. "}{!data.gsc && "Search Console saknas. "}
                Anslut under Inställningar för att aktivera dashboards och alerts.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
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
