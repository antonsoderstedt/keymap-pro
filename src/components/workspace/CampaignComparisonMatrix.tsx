// R5 — Campaign Comparison Matrix. Read-only sorterbar tabell.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { deriveCampaignHealth, type CampaignHealth } from "@/lib/accountIntelligence";
import type { CampaignTreeShape } from "./accountIntelligenceTypes";

interface Props {
  projectId: string;
  tree: CampaignTreeShape | null;
  treeLoading: boolean;
}

type SortKey =
  | "name"
  | "daily_budget"
  | "spend"
  | "ctr"
  | "roas"
  | "cpa"
  | "keywords"
  | "negatives"
  | "mutations"
  | "health";

const fmtSek = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("sv-SE")} kr`;
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(2)}%`;

const HEALTH_TONE: Record<CampaignHealth, string> = {
  good: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  warn: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40",
  bad: "bg-red-500/15 text-red-500 border-red-500/40",
  unknown: "bg-muted text-muted-foreground",
};
const HEALTH_LABEL: Record<CampaignHealth, string> = {
  good: "Bra",
  warn: "Mål saknas",
  bad: "Underpresterar",
  unknown: "För lite data",
};

export function CampaignComparisonMatrix({ projectId, tree, treeLoading }: Props) {
  const [mutationsByCampaign, setMutationsByCampaign] = useState<Record<string, number>>({});
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ads_mutations")
        .select("payload, created_at")
        .eq("project_id", projectId)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(1000);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      for (const m of data ?? []) {
        const cid = (m as any).payload?.campaign_id;
        if (typeof cid === "string") counts[cid] = (counts[cid] ?? 0) + 1;
      }
      setMutationsByCampaign(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const rows = useMemo(() => {
    const campaigns = tree?.campaigns ?? [];
    return campaigns.map((c) => {
      const kwCount = (c.ad_groups ?? []).reduce(
        (s, g) => s + (g.keywords?.length ?? 0),
        0,
      );
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        daily_budget: c.daily_budget_sek ?? 0,
        spend: c.metrics_30d?.cost_sek ?? 0,
        ctr: c.metrics_30d?.ctr ?? null,
        roas: c.metrics_30d?.roas ?? null,
        cpa: c.metrics_30d?.cpa_sek ?? null,
        keywords: kwCount,
        negatives: c.negatives?.length ?? 0,
        mutations: mutationsByCampaign[c.id] ?? 0,
        health: deriveCampaignHealth({
          metrics_30d: c.metrics_30d,
          target_roas: c.target_roas ?? null,
          target_cpa_sek: c.target_cpa_sek ?? null,
        }),
      };
    });
  }, [tree, mutationsByCampaign]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  if (treeLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="font-serif text-lg">Kampanjjämförelse</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Senaste 30 dagars metrics per kampanj. Klicka på rubrik för att sortera.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <Th label="Kampanj" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Budget/dag" k="daily_budget" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Spend 30d" k="spend" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="CTR" k="ctr" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="ROAS" k="roas" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="CPA" k="cpa" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Kw" k="keywords" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Neg" k="negatives" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Mut 30d" k="mutations" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Hälsa" k="health" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    Inga kampanjer.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[16rem]">{r.name}</span>
                        <Badge variant="outline" className="text-[9px]">{r.status}</Badge>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-mono">{fmtSek(r.daily_budget)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-mono">{fmtSek(r.spend)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-mono">{fmtPct(r.ctr)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-mono">{r.roas != null ? r.roas.toFixed(2) : "—"}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-mono">{fmtSek(r.cpa)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.keywords}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.negatives}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.mutations}</td>
                    <td className="py-2 pl-2">
                      <Badge variant="outline" className={cn("text-[9px]", HEALTH_TONE[r.health])}>
                        {HEALTH_LABEL[r.health]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  label,
  k,
  align,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  align?: "right";
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className={cn("py-2 px-2 font-medium", align === "right" && "text-right")}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
