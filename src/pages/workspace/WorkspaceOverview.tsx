import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ListChecks,
  BarChart3,
  Search,
  Layers,
  Sparkles,
  ArrowRight,
  PlayCircle,
  Calendar,
} from "lucide-react";

interface OverviewStats {
  total_analyses: number;
  total_keywords: number;
  total_segments: number;
  open_actions: number;
  done_actions: number;
  last_analysis: { id: string; created_at: string } | null;
}

export default function WorkspaceOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: analyses }, { data: actions }] = await Promise.all([
        supabase.from("analyses").select("id, created_at, result_json").eq("project_id", id).order("created_at", { ascending: false }),
        supabase.from("action_items").select("status").eq("project_id", id),
      ]);

      const lastAnalysis = (analyses || [])[0] ?? null;
      const lastResult = lastAnalysis?.result_json as any;

      setStats({
        total_analyses: (analyses || []).length,
        total_keywords: lastResult?.totalKeywords ?? 0,
        total_segments: lastResult?.segments?.length ?? 0,
        open_actions: (actions || []).filter((a: any) => a.status !== "done" && a.status !== "archived").length,
        done_actions: (actions || []).filter((a: any) => a.status === "done").length,
        last_analysis: lastAnalysis ? { id: lastAnalysis.id, created_at: lastAnalysis.created_at } : null,
      });
      setLoading(false);
    })();
  }, [id]);

  const kpis = [
    { label: "Analyser", value: stats?.total_analyses ?? 0, icon: BarChart3 },
    { label: "Sökord (senaste)", value: stats?.total_keywords ?? 0, icon: Search },
    { label: "Segment", value: stats?.total_segments ?? 0, icon: Layers },
    { label: "Öppna åtgärder", value: stats?.open_actions ?? 0, icon: ListChecks, accent: true },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Översikt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allt som händer för den här kunden — på en plats.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/project/${id}`)}
            className="gap-2"
          >
            <PlayCircle className="h-4 w-4" />
            Kör ny analys
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className={kpi.accent ? "border-primary/30 bg-primary/5" : ""}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {kpi.label}
                  </span>
                  <Icon className={`h-4 w-4 ${kpi.accent ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="font-serif text-3xl">
                  {loading ? <span className="text-muted-foreground/30">—</span> : kpi.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Senaste analys
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.last_analysis ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(stats.last_analysis.created_at).toLocaleString("sv-SE")}
                </div>
                <Button
                  variant="default"
                  className="gap-2 w-full sm:w-auto"
                  onClick={() => navigate(`/project/${id}/results?analysis=${stats.last_analysis!.id}`)}
                >
                  Öppna resultat
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ingen analys körd ännu. Starta en för att fylla dashboards och få åtgärdsförslag.
                </p>
                <Button onClick={() => navigate(`/project/${id}`)} className="gap-2">
                  <PlayCircle className="h-4 w-4" />
                  Kör första analysen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Action Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{stats?.open_actions ?? 0} öppna</Badge>
              <Badge variant="outline">{stats?.done_actions ?? 0} klara</Badge>
            </div>
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={() => navigate(`/clients/${id}/actions`)}
            >
              Öppna tracker
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Coming soon banner */}
      <Card className="border-dashed border-border bg-muted/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Kommer i kommande faser</p>
              <p className="text-muted-foreground mt-1">
                Always-on dashboards (SEO, Google Ads, GA4, Paid vs Organic), Auction Insights,
                AI-alerts, SEO-audit med checkbox-actions, Brand Kit, schemalagda rapporter och
                effektmätning på implementerade åtgärder. Allt knyts till samma kund-hem.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
