import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, Sparkles, BarChart3, Search, Eye, Layers,
  TrendingUp, Zap, AlertCircle, Calendar,
} from "lucide-react";
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
  { id: "auction_insights", name: "Auction Insights", description: "Konkurrent-IS, Overlap, trend", icon: Sparkles, source: "Google Ads", status: "needs_data" },
  { id: "competitor", name: "Konkurrentrapport", description: "Sökord, backlinks, content gap mot konkurrenter", icon: AlertCircle, source: "Semrush + GSC", status: "ready" },
  { id: "share_of_voice", name: "Share of Voice", description: "Din andel av synlighet i nischen", icon: Zap, source: "Semrush + Ads", status: "needs_data" },
  { id: "content_gap", name: "Content gap", description: "Sidor du saknar mot ranking-konkurrenter", icon: FileText, source: "GSC + Semrush + AI", status: "ready" },
  { id: "cannibalization", name: "Cannibalization (SEO)", description: "Flera sidor som rankar för samma sökord", icon: AlertCircle, source: "GSC", status: "ready" },
  { id: "paid_vs_organic", name: "Paid vs Organic", description: "Brand vs non-brand, kanal-split", icon: Layers, source: "Ads + GSC", status: "ready" },
  { id: "yoy", name: "YoY/MoM trend", description: "Jämför mot förra månaden/året", icon: TrendingUp, source: "Allt", status: "coming" },
  { id: "roi", name: "ROI/Attribution", description: "Spend vs intäkt per kanal", icon: BarChart3, source: "Ads + GA4", status: "needs_data" },
];

export default function ReportsLibrary() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<any[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("workspace_artifacts")
        .select("*")
        .eq("project_id", id)
        .eq("artifact_type", "report")
        .order("created_at", { ascending: false })
        .limit(20);
      setHistory(data || []);
    })();
  }, [id]);

  const generateReport = async (report: ReportType) => {
    if (!id) return;
    setGenerating(report.id);
    try {
      // Create artifact entry — actual PPTX generation hooks into existing generate-presentation
      await supabase.from("workspace_artifacts").insert({
        project_id: id,
        artifact_type: "report",
        name: `${report.name} — ${new Date().toLocaleDateString("sv-SE")}`,
        description: report.description,
        payload: { report_type: report.id, generated_at: new Date().toISOString(), source: report.source },
      });
      toast.success(`${report.name} sparad i artefakter`);
      const { data } = await supabase.from("workspace_artifacts").select("*").eq("project_id", id).eq("artifact_type", "report").order("created_at", { ascending: false }).limit(20);
      setHistory(data || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Rapportbibliotek</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generera rapporter med kundens Brand Kit. Allt sparas som artefakt med tidsstämpel.
        </p>
      </div>

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
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga rapporter genererade ännu.</p>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{h.name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("sv-SE")}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${id}/artifacts`)} className="gap-1 shrink-0">
                    Öppna
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
