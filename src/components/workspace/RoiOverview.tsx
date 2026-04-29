import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight, Coins, Zap, RefreshCw } from "lucide-react";
import { formatMoney } from "@/lib/revenue";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { computeRoiOverview, type ClusterROI } from "@/lib/roi";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
}

export default function RoiOverview({ projectId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const currency = useProjectCurrency(projectId);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<ReturnType<typeof computeRoiOverview> | null>(null);
  const [hasGa4Revenue, setHasGa4Revenue] = useState(false);

  const load = async () => {
    setLoading(true);
    const [analysisRes, ga4Res, gscRes, settingsRes, googleRes] = await Promise.all([
      supabase
        .from("analyses")
        .select("keyword_universe_json")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ga4_snapshots")
        .select("rows,totals")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("gsc_snapshots")
        .select("rows")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("project_revenue_settings")
        .select("avg_order_value,conversion_rate_pct,gross_margin_pct,currency")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_google_settings")
        .select("ga4_property_id")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);

    const clusters = (analysisRes.data?.keyword_universe_json as any)?.clusters || [];
    const ga4Snapshots = ga4Res.data || [];
    const revenueSnap = ga4Snapshots.find((s: any) => s.totals?.kind === "revenue_by_page");
    setHasGa4Revenue(!!revenueSnap);
    const ga4Rows = (revenueSnap?.rows as any[]) || [];
    const gscRows = (gscRes.data?.rows as any[]) || [];

    const result = computeRoiOverview({
      clusters,
      ga4Rows,
      gscRows,
      settings: settingsRes.data || undefined,
    });
    setOverview(result);
    setLoading(false);
    return { propertyId: googleRes.data?.ga4_property_id };
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const refreshGa4Revenue = async () => {
    setRefreshing(true);
    try {
      const { data: gs } = await supabase
        .from("project_google_settings")
        .select("ga4_property_id")
        .eq("project_id", projectId)
        .maybeSingle();
      if (!gs?.ga4_property_id) {
        toast({ title: "GA4 saknas", description: "Anslut GA4 i Inställningar först.", variant: "destructive" });
        setRefreshing(false);
        return;
      }
      const { error } = await supabase.functions.invoke("ga4-revenue-fetch", {
        body: { projectId, propertyId: gs.ga4_property_id, startDate: "28daysAgo", endDate: "today" },
      });
      if (error) throw error;
      toast({ title: "GA4-intäkter uppdaterade" });
      await load();
    } catch (e: any) {
      toast({ title: "Kunde inte hämta GA4-intäkt", description: String(e.message || e), variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">Laddar ROI…</CardContent>
      </Card>
    );
  }

  if (!overview || overview.clusters.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 flex items-start gap-3">
          <Coins className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">ROI-översikt aktiveras när du har en sökordsanalys</p>
            <p className="text-muted-foreground mt-1">
              Kör en analys i kunden för att låsa upp värdeberäkning per kluster.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const top = overview.clusters.slice(0, 6);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> ROI-översikt
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Kronvärde per sökordskluster — kombinerar GA4-intäkt, GSC-position och AI-kluster.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={refreshGa4Revenue} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {hasGa4Revenue ? "Uppdatera GA4" : "Hämta GA4-intäkt"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric
            label="Faktisk intäkt"
            value={formatMoney(overview.total_actual_revenue_sek, currency, { compact: true })}
            sub={hasGa4Revenue ? "GA4 senaste 28d" : "estimat (saknar GA4)"}
          />
          <Metric
            label="Estimerat årsvärde"
            value={formatMoney(overview.total_estimated_value_sek, currency, { compact: true })}
            sub="vid nuvarande pos."
          />
          <Metric
            label="Uplift-potential"
            value={formatMoney(overview.total_uplift_potential_sek, currency, { compact: true })}
            sub="om alla → topp 3"
            accent
          />
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1">
            Topp-kluster efter prioritet
          </div>
          {top.map((c, i) => (
            <ClusterRow key={i} c={c} currency={currency} />
          ))}
        </div>

        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/clients/${projectId}/keywords`)}>
          Se alla kluster <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded-md border ${accent ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`font-serif text-xl mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ClusterRow({ c, currency }: { c: ClusterROI; currency: import("@/lib/revenue").Currency }) {
  const variantMap: Record<ClusterROI["priority"], "destructive" | "default" | "secondary" | "outline"> = {
    kritisk: "destructive",
    hög: "default",
    medel: "secondary",
    låg: "outline",
  };
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md border border-border hover:border-primary/40 transition-colors">
      <Badge variant={variantMap[c.priority]} className="capitalize shrink-0 w-16 justify-center text-[10px]">
        {c.priority}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{c.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {c.keyword_count} ord · vol {c.total_volume.toLocaleString("sv-SE")}
          {c.avg_position !== null && ` · pos ${c.avg_position}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium text-primary flex items-center gap-1 justify-end">
          <Zap className="h-3 w-3" />
          {formatMoney(c.uplift_potential_sek, currency, { compact: true })}
        </div>
        <div className="text-[10px] text-muted-foreground">
          värde {formatMoney(Math.max(c.actual_revenue_sek, c.estimated_value_sek), currency, { compact: true })}
        </div>
      </div>
    </div>
  );
}
