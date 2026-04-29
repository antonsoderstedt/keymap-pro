import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeGoogleOauth } from "@/lib/googleOAuth";
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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Link2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

  // Google connection status
  const [googleStatus, setGoogleStatus] = useState<{
    loading: boolean;
    connected: boolean;
    scope?: string;
    expires_at?: string;
  }>({ loading: true, connected: false });

  const hasAdsScope = !!googleStatus.scope?.includes("adwords");

  const refreshGoogleStatus = async () => {
    setGoogleStatus((s) => ({ ...s, loading: true }));
    try {
      const d = await invokeGoogleOauth<{ connected?: boolean; scope?: string; expires_at?: string }>("status");
      setGoogleStatus({
        loading: false,
        connected: !!d.connected,
        scope: d.scope,
        expires_at: d.expires_at,
      });
    } catch (error) {
      setGoogleStatus({ loading: false, connected: false });
    }
  };

  const connectGoogle = async () => {
    try {
      const data = await invokeGoogleOauth<{ url?: string }>("start");
      if (!data.url) throw new Error("Kunde inte starta Google-inloggning");
      window.location.href = data.url;
    } catch (error) {
      toast({ title: "Fel", description: error instanceof Error ? error.message : "Kunde inte starta Google-inloggning", variant: "destructive" });
      return;
    }
  };

  const disconnectGoogle = async () => {
    try {
      await invokeGoogleOauth("disconnect");
      toast({ title: "Google frånkopplad" });
      refreshGoogleStatus();
    } catch (error) {
      toast({ title: "Fel", description: error instanceof Error ? error.message : "Kunde inte koppla från Google", variant: "destructive" });
    }
  };

  useEffect(() => {
    refreshGoogleStatus();
  }, []);

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

      {/* Google connection status */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Google-anslutning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleStatus.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Kontrollerar status…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* OAuth */}
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  {googleStatus.connected ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Google OAuth</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {googleStatus.connected ? "Ansluten" : "Inte ansluten"}
                    </div>
                    {googleStatus.connected && googleStatus.expires_at && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Token giltig till {new Date(googleStatus.expires_at).toLocaleString("sv-SE")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ads scope */}
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  {hasAdsScope ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : googleStatus.connected ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Google Ads-behörighet</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {hasAdsScope
                        ? "adwords scope beviljad"
                        : googleStatus.connected
                        ? "Saknas — bocka i 'Hantera Google Ads' vid återanslutning"
                        : "Anslut Google först"}
                    </div>
                  </div>
                </div>
              </div>

              {googleStatus.connected && googleStatus.scope && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Visa alla scopes</summary>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {googleStatus.scope.split(" ").map((s) => (
                      <Badge key={s} variant="outline" className="font-mono text-[10px]">{s}</Badge>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex flex-wrap gap-2">
                {googleStatus.connected ? (
                  <>
                    <Button size="sm" onClick={connectGoogle} className="gap-2">
                      <Link2 className="h-4 w-4" />
                      {hasAdsScope ? "Återanslut Google" : "Bevilja Google Ads-behörighet"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={disconnectGoogle}>
                      Koppla från
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={connectGoogle} className="gap-2">
                    <Link2 className="h-4 w-4" /> Anslut Google
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={refreshGoogleStatus}>
                  Uppdatera status
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Active capabilities checklist */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Vad är aktivt för den här kunden
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            <CapabilityRow ok={googleStatus.connected} label="Search Console-data" />
            <CapabilityRow ok={googleStatus.connected} label="Google Analytics 4" />
            <CapabilityRow ok={hasAdsScope} label="Google Ads (Auction Insights, kannibalisering)" />
            <CapabilityRow ok={(stats?.total_analyses ?? 0) > 0} label="Sökordsuniversum & segment" />
            <CapabilityRow ok={(stats?.open_actions ?? 0) + (stats?.done_actions ?? 0) > 0} label="Action Tracker med åtgärder" />
            <CapabilityRow ok={true} label="AI-alerts (rule-based + LLM)" />
            <CapabilityRow ok={true} label="SEO-audit med findings" />
            <CapabilityRow ok={true} label="Brand Kit & artefakter" />
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Schemalagda rapporter och automation-regler kommer i nästa iteration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CapabilityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
