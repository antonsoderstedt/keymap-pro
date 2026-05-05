// ClusterSheet — drill-down i ett kluster: stats, sökordstabell med filter,
// CSV-export per kluster och push-to-actions.

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download, ListChecks, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { KeywordTable } from "@/components/keywords/KeywordTable";
import type { ClusterData } from "@/components/keywords/ClusterGrid";

interface Props {
  cluster: ClusterData | null;
  open: boolean;
  onClose: () => void;
  projectId: string;
}

type SheetFilter = "all" | "high" | "gap";

export function ClusterSheet({ cluster, open, onClose, projectId }: Props) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<SheetFilter>("all");
  const [pushing, setPushing] = useState(false);

  const filtered = useMemo(() => {
    if (!cluster) return [];
    if (filter === "high") return cluster.keywords.filter((k) => k.priority === "high");
    if (filter === "gap") return cluster.keywords.filter((k) => k.competitorGap);
    return cluster.keywords;
  }, [cluster, filter]);

  function exportClusterCsv() {
    if (!cluster) return;
    const rows = [["Sökord", "Volym", "CPC", "KD", "Intent", "Kanal", "Gap", "Prio", "Källa"]];
    cluster.keywords.forEach((k) => {
      rows.push([
        k.keyword,
        k.searchVolume?.toString() ?? "",
        k.cpc?.toFixed(2) ?? "",
        k.kd != null ? Math.round(k.kd).toString() : "",
        k.intent,
        k.channel,
        k.competitorGap ? "Ja" : "",
        k.priority,
        k.dataSource === "real" ? "DataForSEO" : "Estimerat",
      ]);
    });
    const csv = rows
      .map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cluster.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "CSV nedladdad", description: `${cluster.keywords.length} sökord` });
  }

  async function pushToActions() {
    if (!cluster || !projectId) return;
    setPushing(true);
    try {
      const topKws = cluster.keywords
        .filter((k) => !k.isNegative)
        .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
        .slice(0, 5)
        .map((k) => k.keyword);

      const { error } = await supabase.from("action_items").insert({
        project_id: projectId,
        title: `Arbeta med klustret "${cluster.name}"`,
        description: `${cluster.totalCount} sökord · ${cluster.totalVolume.toLocaleString(
          "sv-SE",
        )} vol/mån · ${cluster.competitorGapCount} konkurrentgap`,
        source_type: "keyword_cluster",
        source_id: cluster.name,
        priority:
          cluster.estimatedValueSek > 30000
            ? "high"
            : cluster.estimatedValueSek > 10000
            ? "medium"
            : "low",
        expected_impact_sek: cluster.estimatedValueSek,
        status: "pending",
        notes: { top_keywords: topKws, cluster_name: cluster.name },
      } as any);
      if (error) throw error;
      toast({ title: `"${cluster.name}" tillagd i Åtgärder` });
    } catch (e: any) {
      toast({
        title: "Kunde inte skapa åtgärd",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setPushing(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[640px] overflow-y-auto"
      >
        {cluster && (
          <>
            <SheetHeader>
              <SheetTitle className="font-serif text-2xl text-left">
                {cluster.name}
              </SheetTitle>
              <p className="text-sm text-muted-foreground text-left">
                {cluster.totalCount} sökord · {cluster.totalVolume.toLocaleString("sv-SE")} vol/mån
                {cluster.estimatedValueSek > 0 && (
                  <>
                    {" · "}
                    <span className="text-primary font-medium">
                      {cluster.estimatedValueSek.toLocaleString("sv-SE")} kr/mån (estimerat)
                    </span>
                  </>
                )}
              </p>
            </SheetHeader>

            {/* Stats-rad */}
            <div className="grid grid-cols-4 gap-2 mt-5">
              <SheetStat label="Volym" value={cluster.totalVolume.toLocaleString("sv-SE")} />
              <SheetStat
                label="KD"
                value={cluster.avgKd != null ? Math.round(cluster.avgKd).toString() : "—"}
              />
              <SheetStat
                label="CPC kr"
                value={cluster.avgCpc != null ? cluster.avgCpc.toFixed(2) : "—"}
              />
              <SheetStat label="Gap" value={cluster.competitorGapCount.toString()} />
            </div>

            {/* Filter + export */}
            <div className="flex items-center justify-between gap-2 mt-6 mb-3 flex-wrap">
              <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
                {(
                  [
                    ["all", "Alla", cluster.keywords.length],
                    ["high", "Högt prio", cluster.keywords.filter((k) => k.priority === "high").length],
                    ["gap", "Gaps", cluster.competitorGapCount],
                  ] as Array<[SheetFilter, string, number]>
                ).map(([key, label, count]) => (
                  <Button
                    key={key}
                    variant={filter === key ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2 gap-1.5"
                    onClick={() => setFilter(key)}
                  >
                    {label}
                    <span className="text-muted-foreground">{count}</span>
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={exportClusterCsv} className="gap-2">
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            </div>

            <KeywordTable items={filtered} limit={200} />

            {/* Åtgärder */}
            <div className="mt-6 pt-4 border-t flex flex-wrap gap-2">
              <Button onClick={pushToActions} disabled={pushing} className="gap-2">
                {pushing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ListChecks className="h-4 w-4" />
                )}
                Pusha till Åtgärder
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="font-mono text-base font-medium">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
