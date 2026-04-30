import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Sparkles, TrendingUp, Target, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { useProjectCurrency } from "@/hooks/useProjectCurrency";
import { useActionItems } from "@/hooks/useActionItems";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, DEFAULT_REVENUE, type RevenueSettings } from "@/lib/revenue";
import {
  generateClusterActions,
  actionTypeLabel,
  type ClusterAction,
} from "@/lib/clusterActions";
import type { KeywordUniverse } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  projectId: string;
  universe: KeywordUniverse;
}

const PRIORITY_STYLES: Record<ClusterAction["priority"], string> = {
  kritisk: "border-destructive/40 bg-destructive/10 text-destructive",
  hög: "border-accent/40 bg-accent/10 text-accent",
  medel: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
  låg: "border-muted-foreground/20 bg-muted text-muted-foreground",
};

const EFFORT_LABEL: Record<ClusterAction["effort"], string> = {
  låg: "Låg insats", medel: "Medel insats", hög: "Hög insats",
};

export function ClusterActionsTab({ projectId, universe }: Props) {
  const currency = useProjectCurrency(projectId);
  const { create } = useActionItems(projectId);
  const [settings, setSettings] = useState<RevenueSettings>(DEFAULT_REVENUE);
  const [filter, setFilter] = useState<"all" | ClusterAction["priority"]>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("project_revenue_settings")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({ ...data, currency: data.currency || "SEK" });
      });
  }, [projectId]);

  const actions = useMemo(
    () => generateClusterActions(universe, settings),
    [universe, settings],
  );

  const filtered = filter === "all" ? actions : actions.filter((a) => a.priority === filter);

  const totals = useMemo(() => {
    const totalValue = actions.reduce((s, a) => s + a.expected_value, 0);
    const byPriority = actions.reduce<Record<string, number>>((acc, a) => {
      acc[a.priority] = (acc[a.priority] || 0) + 1;
      return acc;
    }, {});
    return { totalValue, byPriority, count: actions.length };
  }, [actions]);

  const addToTracker = async (a: ClusterAction) => {
    const res = await create({
      title: a.title,
      description: `${a.rationale}\n\nSteg:\n${a.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      category: a.type,
      priority: a.priority === "kritisk" ? "high" : a.priority === "hög" ? "high" : a.priority === "medel" ? "medium" : "low",
      expected_impact: `${formatMoney(a.expected_value, currency)}/år`,
      expected_impact_sek: a.expected_value,
      source_type: "cluster_action",
      source_payload: { cluster: a.cluster, type: a.type, top_keywords: a.top_keywords, metrics: a.metrics } as any,
    });
    if (res?.error) toast.error("Kunde inte spara åtgärd");
    else toast.success("Sparat i Action Tracker");
  };

  if (!actions.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Inga klusteråtgärder kunde genereras — säkerställ att universe har sökord med intent och volym.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top summary */}
      <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-transparent shadow-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total potential</p>
              <p className="font-mono text-xl font-bold text-foreground">{formatMoney(totals.totalValue, currency, { compact: true })}/år</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="gap-1">{totals.count} åtgärder</Badge>
            {totals.byPriority.kritisk && <Badge className="bg-destructive/15 text-destructive border-destructive/30">{totals.byPriority.kritisk} kritiska</Badge>}
            {totals.byPriority.hög && <Badge className="bg-accent/15 text-accent border-accent/30">{totals.byPriority.hög} hög</Badge>}
            {totals.byPriority.medel && <Badge variant="outline">{totals.byPriority.medel} medel</Badge>}
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla prioriteter</SelectItem>
              <SelectItem value="kritisk">Endast kritiska</SelectItem>
              <SelectItem value="hög">Endast hög</SelectItem>
              <SelectItem value="medel">Endast medel</SelectItem>
              <SelectItem value="låg">Endast låg</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Action list */}
      <div className="space-y-2">
        {filtered.map((a) => {
          const isOpen = openId === a.id;
          return (
            <Collapsible key={a.id} open={isOpen} onOpenChange={(o) => setOpenId(o ? a.id : null)}>
              <Card className="border-border/60 shadow-card transition-colors hover:border-accent/30">
                <CollapsibleTrigger asChild>
                  <CardContent className="flex cursor-pointer items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={PRIORITY_STYLES[a.priority]}>{a.priority.toUpperCase()}</Badge>
                        <Badge variant="outline" className="text-[10px]">{actionTypeLabel(a.type)}</Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{a.channel}</Badge>
                        <span className="text-[10px] text-muted-foreground">{EFFORT_LABEL[a.effort]}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.rationale}</p>
                      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Target className="h-3 w-3" />{a.metrics.keyword_count} ord</span>
                        <span>{a.metrics.total_volume.toLocaleString("sv-SE")} sök/mån</span>
                        {a.metrics.avg_kd !== null && <span>KD {a.metrics.avg_kd}</span>}
                        {a.metrics.competitor_gap_count > 0 && (
                          <span className="text-accent">{a.metrics.competitor_gap_count} konkurrentgap</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Förväntat värde</p>
                        <p className="font-mono text-base font-bold text-accent">{formatMoney(a.expected_value, currency, { compact: true })}</p>
                        <p className="text-[10px] text-muted-foreground">/år</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </CardContent>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-4 border-t border-border/60 px-4 py-4">
                    <div>
                      <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <AlertCircle className="h-3 w-3" /> Varför denna åtgärd
                      </p>
                      <p className="text-xs text-foreground">{a.rationale}</p>
                    </div>

                    <div>
                      <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" /> Genomförandesteg
                      </p>
                      <ol className="space-y-1.5 text-xs">
                        {a.steps.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[10px] text-accent">{i + 1}</span>
                            <span className="text-foreground">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">Topp-sökord i kluster</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.top_keywords.map((k) => (
                          <Badge key={k} variant="outline" className="font-mono text-[10px]">{k}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-2 rounded-md border border-border/40 bg-muted/30 p-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Förväntat värde/år</p>
                        <p className="font-mono text-sm font-semibold text-accent">{formatMoney(a.expected_value, currency)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total uplift-potential</p>
                        <p className="font-mono text-sm font-semibold text-foreground">{formatMoney(a.uplift_value, currency)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Kluster</p>
                        <p className="font-mono text-sm font-semibold text-foreground truncate">{a.cluster}</p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addToTracker(a)}>
                        <Plus className="h-3.5 w-3.5" /> Lägg till i Action Tracker
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        <TrendingUp className="mr-1 inline h-3 w-3" />
        Värden är estimerade årligen baserat på CTR-kurva (Sistrix/AWR), klustervolym och projektets revenue-settings ({formatMoney(settings.avg_order_value, currency)} AOV × {settings.conversion_rate_pct}% CR × {settings.gross_margin_pct}% marginal).
      </p>
    </div>
  );
}
