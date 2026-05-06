import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportTemplateView } from "@/components/workspace/ReportTemplateView";
import {
  FileText, Download, Sparkles, BarChart3, Search, Eye, Layers,
  TrendingUp, Zap, AlertCircle, Calendar, Plus, ChevronDown, BookOpen, Megaphone,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: any;
  source: string;
  status: "ready" | "needs_data" | "coming";
}

const REPORTS: ReportType[] = [
  { id: "executive", name: "Executive månadsrapport", description: "Toppnivå-KPIer, trend, mål-progress", icon: BarChart3, source: "GSC + GA4 + Actions", status: "ready" },
  { id: "seo_performance", name: "SEO Performance", description: "Klick, visningar, CTR, position + topp-sökord", icon: TrendingUp, source: "GSC", status: "ready" },
  { id: "ga4_traffic", name: "GA4 trafikrapport", description: "Sessioner, källor, kanaler, konvertering", icon: Eye, source: "GA4", status: "ready" },
  { id: "keyword_universe", name: "Sökordsanalys (universum)", description: "Alla sökord med volym, CPC, kluster", icon: Search, source: "DataForSEO + Semrush", status: "ready" },
  { id: "segments", name: "Segmentrapport", description: "Identifierade segment + paket per segment", icon: Layers, source: "Egen analys", status: "ready" },
  { id: "auction_insights", name: "Auction Insights", description: "Konkurrent-IS, Overlap, trend", icon: Sparkles, source: "Google Ads", status: "ready" },
  { id: "competitor", name: "Konkurrentrapport", description: "Sökord, backlinks, content gap mot konkurrenter", icon: AlertCircle, source: "Semrush + GSC", status: "ready" },
  { id: "share_of_voice", name: "Share of Voice", description: "Din andel av synlighet i nischen", icon: Zap, source: "Semrush + Ads", status: "ready" },
  { id: "content_gap", name: "Content gap", description: "Sidor du saknar mot ranking-konkurrenter", icon: FileText, source: "GSC + Semrush + AI", status: "ready" },
  { id: "cannibalization", name: "Cannibalization (SEO)", description: "Flera sidor som rankar för samma sökord", icon: AlertCircle, source: "GSC", status: "ready" },
  { id: "paid_vs_organic", name: "Paid vs Organic", description: "Brand vs non-brand, kanal-split", icon: Layers, source: "Ads + GSC", status: "ready" },
  { id: "yoy", name: "YoY/MoM trend", description: "Jämför mot förra månaden/året", icon: TrendingUp, source: "Allt", status: "ready" },
  { id: "roi", name: "ROI/Attribution", description: "Spend vs intäkt per kanal", icon: BarChart3, source: "Ads + GA4", status: "ready" },
];

export default function ReportsLibrary() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);

  const generateReportById = async (reportTypeId: string) => {
    const r = REPORTS.find((x) => x.id === reportTypeId);
    if (r) await generateReport(r);
  };

  const downloadPptx = async (artifact: any) => {
    if (!artifact?.id && !artifact?.payload?.template) return;
    setDownloading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-pptx`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(artifact.id ? { artifact_id: artifact.id } : { name: artifact.name, payload: artifact.payload }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") || "";
      const m = dispo.match(/filename="([^"]+)"/);
      const filename = m?.[1] || `${artifact.name || "rapport"}.pptx`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("PPTX nedladdad");
    } catch (e: any) {
      toast.error("Kunde inte skapa PPTX", { description: e.message });
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoadingHistory(true);
      const { data } = await supabase
        .from("workspace_artifacts")
        .select("*")
        .eq("project_id", id)
        .eq("artifact_type", "report")
        .order("created_at", { ascending: false })
        .limit(20);
      setHistory(data || []);
      setLoadingHistory(false);
    })();
  }, [id]);

  const generateReport = async (report: ReportType) => {
    if (!id) return;
    setGenerating(report.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { project_id: id, report_type: report.id, name: `${report.name} — ${new Date().toLocaleDateString("sv-SE")}` },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const status = (data as any)?.artifact?.payload?.overall_status;
      const issues = ((data as any)?.artifact?.payload?.issues || []) as Array<{ section: string; status: string; message: string; fix?: string; fix_url?: string }>;
      const missing = ((data as any)?.artifact?.payload?.missing_fields || []) as string[];
      const blockers = issues.filter((x) => x.status === "missing" || x.status === "error");
      const describe = (xs: typeof issues) => xs.slice(0, 3).map((x) => `${x.message}${x.fix ? ` → ${x.fix}` : ""}`).join("\n");
      if (status === "complete") toast.success(`${report.name} genererad med live-data`);
      else if (status === "partial") toast.warning(`${report.name} delvis genererad — ${blockers.length || missing.length} sektion(er) ofullständiga`, { description: describe(issues) || missing.slice(0, 3).join(" · ") });
      else if (status === "empty") toast.error(`${report.name}: inga datakällor tillgängliga`, { description: describe(blockers) || missing.slice(0, 3).join(" · ") });
      else toast.success(`${report.name} sparad`);
      const artifact = (data as any)?.artifact;
      if (artifact?.payload?.template) setViewing(artifact);
      const { data: hist } = await supabase.from("workspace_artifacts").select("*").eq("project_id", id).eq("artifact_type", "report").order("created_at", { ascending: false }).limit(20);
      setHistory(hist || []);
    } catch (e: any) {
      toast.error(e.message || "Kunde inte generera rapport");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">Rapportbibliotek</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generera rapporter med kundens Brand Kit. Allt sparas som artefakt med tidsstämpel.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Generera ny
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Välj rapporttyp</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => generateReportById("executive")}>
              <BarChart3 className="h-4 w-4 mr-2" /> Månadsrapport (PPTX)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => generateReportById("seo_performance")}>
              <TrendingUp className="h-4 w-4 mr-2" /> SEO-rapport (PPTX)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => generateReportById("competitor")}>
              <AlertCircle className="h-4 w-4 mr-2" /> Konkurrentrapport (PPTX)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`/clients/${id}/keywords?tab=briefs`)}>
              <BookOpen className="h-4 w-4 mr-2" /> Content brief (i Sökord)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/clients/${id}/keywords?tab=ads-export`)}>
              <Megaphone className="h-4 w-4 mr-2" /> Google Ads-export (i Sökord)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <WeeklyReportPanel projectId={id!} />

      {/* Available report types */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const isReady = r.status === "ready";
          return (
            <Card key={r.id} className={!isReady ? "opacity-70" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <h3 className="font-medium text-sm">{r.name}</h3>
                      {r.status === "needs_data" && <Badge variant="outline" className="text-[9px]">behöver Ads-koppling</Badge>}
                      {r.status === "coming" && <Badge variant="outline" className="text-[9px]">snart</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Källa: {r.source}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isReady ? "default" : "outline"}
                  disabled={!isReady || generating === r.id}
                  onClick={() => generateReport(r)}
                  className="gap-1 w-full"
                >
                  {generating === r.id ? "Genererar…" : isReady ? "Generera" : "Inte tillgänglig"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Historik
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Inga genererade rapporter ännu.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Använd "Generera ny"-knappen ovan för att skapa din första rapport.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(h => {
                const p = h.payload as any;
                const summary = summarizePayload(p);
                const overall = p?.overall_status as string | undefined;
                const missing = (p?.missing_fields as string[] | undefined) || [];
                return (
                  <div key={h.id} className="flex items-start justify-between gap-3 p-3 rounded-md border border-border">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-medium truncate">{h.name}</div>
                        {overall === "partial" && <Badge variant="outline" className="text-[9px]">delvis</Badge>}
                        {overall === "empty" && <Badge variant="destructive" className="text-[9px]">tom</Badge>}
                        {overall === "complete" && <Badge variant="default" className="text-[9px]">komplett</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("sv-SE")}{summary && ` · ${summary}`}</div>
                      {missing.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Saknas: {missing.slice(0, 2).join(" · ")}{missing.length > 2 && ` (+${missing.length - 2})`}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {p?.template && (
                        <>
                          <Button size="sm" variant="default" onClick={() => setViewing(h)} className="gap-1">
                            Visa
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPptx(h)} disabled={downloading} className="gap-1">
                            <Download className="h-3 w-3" /> PPTX
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${id}/artifacts`)} className="gap-1">
                        Öppna
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle className="font-serif text-xl">{viewing?.name}</DialogTitle>
              {viewing?.payload?.template && (
                <Button size="sm" variant="default" onClick={() => downloadPptx(viewing)} disabled={downloading} className="gap-1">
                  <Download className="h-3 w-3" /> {downloading ? "Skapar…" : "Ladda ner PPTX"}
                </Button>
              )}
            </div>
          </DialogHeader>
          {viewing?.payload?.template && <ReportTemplateView template={viewing.payload.template} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summarizePayload(p: any): string | null {
  if (!p) return null;
  const t = p.report_type;
  const sec = p.sections || {};
  if (t === "share_of_voice") {
    const d = sec.share_of_voice?.data;
    if (!d) return null;
    return `SoV ${d.sov_pct?.toFixed?.(1) ?? "?"}% · ${d.competitors?.length ?? 0} konkurrenter`;
  }
  if (t === "auction_insights") {
    const d = sec.auction_insights?.data;
    if (!d) return null;
    return `${d.campaigns?.length ?? 0} kampanjer · IS ${((d.totals?.avg_is ?? 0) * 100).toFixed(0)}%`;
  }
  if (t === "roi") {
    const tot = sec.attribution?.data?.totals;
    if (tot) return `Blended ROAS ${tot.blended_roas ?? "—"} · spend ${Math.round((tot.spend || 0) / 1000)}k · ${sec.attribution.data.channels?.length ?? 0} kanaler`;
    const cr = sec.cluster_roi?.data;
    if (cr) return `${cr.clusters?.length ?? 0} kluster · uplift ${Math.round((cr.total_uplift_potential_sek || 0) / 1000)}k kr`;
    return null;
  }
  if (t === "yoy") {
    const trend = p.trend;
    const sess = trend?.ga4_delta?.sessions?.yoy?.pct;
    const rev = trend?.ga4_delta?.revenue?.yoy?.pct;
    if (sess != null || rev != null) return `Sessions YoY ${fmtTrendPct(sess)} · Intäkt YoY ${fmtTrendPct(rev)}`;
    return "Trend-data";
  }
  return null;
}

function fmtTrendPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function WeeklyReportPanel({ projectId }: { projectId: string }) {
  const [latest, setLatest] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("workspace_artifacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("artifact_type", "weekly_report")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest(data);
  };

  useEffect(() => { load(); }, [projectId]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("weekly-report", { body: { project_id: projectId } });
      if (error) throw error;
      toast.success("Veckorapport genererad");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  const s = latest?.payload as any;
  const fmtPct = (n: number | null | undefined) => n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Veckorapport (auto)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Genereras automatiskt varje måndag 06:00. {latest && `Senaste: ${new Date(latest.created_at).toLocaleString("sv-SE")}`}
            </p>
          </div>
          <Button size="sm" onClick={runNow} disabled={running} className="gap-1">
            <Sparkles className="h-3 w-3" /> {running ? "Genererar…" : "Kör nu"}
          </Button>
        </div>
      </CardHeader>
      {s && (
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {s.gsc && (
              <div className="p-3 rounded-md border border-border">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">SEO klick</div>
                <div className="font-mono text-lg">{s.gsc.clicks ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{fmtPct(s.gsc.delta?.clicks_pct)} vs förra veckan</div>
              </div>
            )}
            {s.ga4 && (
              <div className="p-3 rounded-md border border-border">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sessioner</div>
                <div className="font-mono text-lg">{s.ga4.sessions ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{fmtPct(s.ga4.delta?.sessions_pct)} vs förra veckan</div>
              </div>
            )}
            <div className="p-3 rounded-md border border-border">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Åtgärder</div>
              <div className="font-mono text-lg">{s.actions?.completed ?? 0} klara</div>
              <div className="text-xs text-muted-foreground">{s.actions?.open ?? 0} öppna · {s.actions?.new ?? 0} nya</div>
            </div>
            <div className="p-3 rounded-md border border-border">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Alerts</div>
              <div className="font-mono text-lg">{s.alerts?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground">{s.alerts?.critical ?? 0} kritiska</div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

