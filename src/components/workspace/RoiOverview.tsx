import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, RefreshCw } from "lucide-react";
import { formatMoney } from "@/lib/revenue";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { computeRoiOverview, type ClusterROI } from "@/lib/roi";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
}

// Operational ROI surface — normalized (sans, no gradients) for embedding in Today.
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
    const [analysisRes, ga4Res, gscRes, settingsRes] = await Promise.all([
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

  if (loading) return null;
  if (!overview || overview.clusters.length === 0) return null;

  const top = overview.clusters.slice(0, 4);

  return (
    <section aria-labelledby="roi-overview" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            id="roi-overview"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Värde att hämta hem
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Estimerad uplift per sökordskluster.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={refreshGa4Revenue}
          disabled={refreshing}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`mr-1.5 h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {hasGa4Revenue ? "Uppdatera GA4" : "Hämta GA4-intäkt"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Faktisk intäkt"
          value={formatMoney(overview.total_actual_revenue_sek, currency, { compact: true })}
          sub={hasGa4Revenue ? "GA4 senaste 28d" : "estimat"}
        />
        <Metric
          label="Estimerat årsvärde"
          value={formatMoney(overview.total_estimated_value_sek, currency, { compact: true })}
          sub="nuvarande pos."
        />
        <Metric
          label="Uplift-potential"
          value={formatMoney(overview.total_uplift_potential_sek, currency, { compact: true })}
          sub="om → topp 3"
        />
      </div>

      <div className="divide-y divide-border/40">
        {top.map((c, i) => (
          <ClusterRow key={i} c={c} currency={currency} />
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={() => navigate(`/clients/${projectId}/keywords`)}
      >
        Se alla kluster
        <ArrowRight className="ml-1 h-3 w-3" />
      </Button>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</div>}
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
    <div className="flex items-center gap-3 py-2.5">
      <Badge variant={variantMap[c.priority]} className="w-14 shrink-0 justify-center text-[10px] capitalize">
        {c.priority}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{c.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {c.keyword_count} ord · vol {c.total_volume.toLocaleString("sv-SE")}
          {c.avg_position !== null && ` · pos ${c.avg_position}`}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="text-sm font-medium">
          {formatMoney(c.uplift_potential_sek, currency, { compact: true })}
        </div>
        <div className="text-[10px] text-muted-foreground">uplift</div>
      </div>
    </div>
  );
}
