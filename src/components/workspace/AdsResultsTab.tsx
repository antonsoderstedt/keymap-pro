// Resultat-tab — KPI-utfall av pushade förslag/regler.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Target, Award, Activity, ChevronRight } from "lucide-react";
import { OutcomeDrawer } from "./OutcomeDrawer";

interface Outcome {
  id: string;
  rule_id: string;
  campaign_id: string | null;
  applied_at: string | null;
  fired_at: string;
  predicted: any;
  measured_14d: any;
  measured_30d: any;
  proposal_id: string | null;
  mutation_id: string | null;
}

const fmtPct = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtSek = (v: number | null | undefined) => v == null ? "—" : `${Math.round(v).toLocaleString("sv-SE")} kr`;

function verdict(measured: any): { tone: string; label: string; icon: any } {
  if (!measured?.delta) return { tone: "bg-muted text-muted-foreground", label: "Mäts…", icon: Minus };
  const conv = measured.delta.conversions_pct;
  const cpa_before = measured.delta.cpa_before;
  const cpa_after = measured.delta.cpa_after;
  const cpaImproved = cpa_before != null && cpa_after != null && cpa_after < cpa_before;
  const score = (conv ?? 0) + (cpaImproved ? 20 : 0);
  if (score >= 30) return { tone: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40", label: "Lyckad", icon: TrendingUp };
  if (score <= -20) return { tone: "bg-destructive/15 text-destructive border-destructive/40", label: "Misslyckad", icon: TrendingDown };
  return { tone: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40", label: "Neutral", icon: Minus };
}

const RULE_LABEL: Record<string, string> = {
  wasted_keyword_no_conversions: "Pausa förlustsökord",
  negative_keyword_candidate: "Negativt sökord",
  ad_strength_poor: "Pausa svag annons",
};

export function AdsResultsTab({ projectId }: { projectId: string | null }) {
  const { toast } = useToast();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<Outcome | null>(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ads_recommendation_outcomes")
      .select("id, rule_id, campaign_id, applied_at, fired_at, predicted, measured_14d, measured_30d, proposal_id, mutation_id")
      .eq("project_id", projectId)
      .not("applied_at", "is", null)
      .order("applied_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast({ title: "Kunde inte hämta resultat", description: error.message, variant: "destructive" });
    } else {
      setOutcomes((data || []) as Outcome[]);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  // Aggregate per rule
  const byRule = new Map<string, { total: number; lyckade: number; sumDeltaSek: number }>();
  for (const o of outcomes) {
    const m = o.measured_30d ?? o.measured_14d;
    if (!m?.delta) continue;
    const key = o.rule_id;
    const cur = byRule.get(key) || { total: 0, lyckade: 0, sumDeltaSek: 0 };
    cur.total++;
    const v = verdict(m);
    if (v.label === "Lyckad") cur.lyckade++;
    // estimate SEK delta from cost_pct + cost_before
    if (m.delta.cost_pct != null && m.before?.cost_micros != null) {
      cur.sumDeltaSek += -((m.delta.cost_pct / 100) * (m.before.cost_micros / 1_000_000));
    }
    byRule.set(key, cur);
  }

  // Total KPIs from latest 30d window summary
  const totals = outcomes.reduce(
    (acc, o) => {
      const m = o.measured_30d ?? o.measured_14d;
      if (!m?.before || !m?.after) return acc;
      acc.spend_before += (m.before.cost_micros || 0) / 1_000_000;
      acc.spend_after += (m.after.cost_micros || 0) / 1_000_000;
      acc.conv_before += m.before.conversions || 0;
      acc.conv_after += m.after.conversions || 0;
      return acc;
    },
    { spend_before: 0, spend_after: 0, conv_before: 0, conv_after: 0 }
  );

  if (!projectId) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Resultat av AI-förslag
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mätning av pushade förslag — jämför kampanjmetrics före vs efter.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Uppdatera
          </Button>
        </CardContent>
      </Card>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Spend före" value={fmtSek(totals.spend_before)} />
        <Kpi label="Spend efter" value={fmtSek(totals.spend_after)} delta={totals.spend_before > 0 ? ((totals.spend_after - totals.spend_before) / totals.spend_before) * 100 : null} invertColor />
        <Kpi label="Konv. före" value={Math.round(totals.conv_before).toLocaleString("sv-SE")} />
        <Kpi label="Konv. efter" value={Math.round(totals.conv_after).toLocaleString("sv-SE")} delta={totals.conv_before > 0 ? ((totals.conv_after - totals.conv_before) / totals.conv_before) * 100 : null} />
      </div>

      {/* AI accuracy per rule */}
      {byRule.size > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium flex items-center gap-2 mb-3"><Award className="h-3.5 w-3.5 text-primary" /> AI-träffsäkerhet per regel</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Array.from(byRule.entries()).map(([rule, agg]) => {
                const rate = agg.total > 0 ? (agg.lyckade / agg.total) * 100 : 0;
                return (
                  <div key={rule} className="border rounded-md p-3 bg-muted/10">
                    <div className="text-xs text-muted-foreground">{RULE_LABEL[rule] || rule}</div>
                    <div className="font-mono text-lg mt-0.5">{rate.toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground">
                      {agg.lyckade}/{agg.total} lyckade · besparing {fmtSek(agg.sumDeltaSek)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcome list */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3"><Target className="h-3.5 w-3.5 text-primary" /> Effekt av pushade förslag</h4>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
          ) : outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Inga pushade ändringar ännu. Godkänn och pusha förslag i fliken Förslag — sedan mäts utfallet automatiskt efter 14/30 dagar.
            </p>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1 border-b">
                <div className="col-span-2">Datum</div>
                <div className="col-span-3">Regel</div>
                <div className="col-span-2 text-right">Δ Konv 14d</div>
                <div className="col-span-2 text-right">Δ Spend 14d</div>
                <div className="col-span-1 text-right">CPA</div>
                <div className="col-span-2 text-right">Verdict</div>
              </div>
              {outcomes.map((o) => {
                const m = o.measured_14d;
                const v = verdict(m);
                const Icon = v.icon;
                const clickable = !!o.campaign_id && !!o.applied_at;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => clickable && setDrilldown(o)}
                    disabled={!clickable}
                    className={`w-full grid grid-cols-12 gap-2 items-center px-2 py-1.5 text-xs rounded text-left ${clickable ? "hover:bg-muted/30 cursor-pointer" : "opacity-70 cursor-default"}`}
                    title={clickable ? "Visa drilldown-graf" : "Saknar kampanj/datum"}
                  >
                    <div className="col-span-2 text-muted-foreground">{o.applied_at ? new Date(o.applied_at).toLocaleDateString("sv-SE") : "—"}</div>
                    <div className="col-span-3 truncate">{RULE_LABEL[o.rule_id] || o.rule_id}</div>
                    <div className="col-span-2 text-right font-mono tabular-nums">{fmtPct(m?.delta?.conversions_pct)}</div>
                    <div className="col-span-2 text-right font-mono tabular-nums">{fmtPct(m?.delta?.cost_pct)}</div>
                    <div className="col-span-1 text-right font-mono tabular-nums text-[10px]">
                      {m?.delta?.cpa_before != null && m?.delta?.cpa_after != null
                        ? `${m.delta.cpa_before}→${m.delta.cpa_after}` : "—"}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Badge variant="outline" className={v.tone}>
                        <Icon className="h-3 w-3 mr-1" /> {v.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, delta, invertColor }: { label: string; value: string; delta?: number | null; invertColor?: boolean }) {
  const positive = delta != null && delta > 0;
  const tone = delta == null ? "text-muted-foreground"
    : (invertColor ? !positive : positive) ? "text-emerald-500" : "text-destructive";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-mono text-xl mt-0.5 tabular-nums">{value}</div>
        {delta != null && <div className={`text-[10px] font-mono mt-0.5 ${tone}`}>{fmtPct(delta)}</div>}
      </CardContent>
    </Card>
  );
}
