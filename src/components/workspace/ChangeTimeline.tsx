// R5 — Change Timeline. Mutations + measured outcomes grupperade per dag.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Pause,
  Plus,
  Pencil,
  XCircle,
  CheckCircle2,
  Undo2,
  Hourglass,
  AlertCircle,
} from "lucide-react";

interface Props {
  projectId: string;
}

type RangeKey = "7" | "30" | "90";

interface Mutation {
  id: string;
  action_type: string;
  status: string;
  created_at: string;
  reverted_at: string | null;
  payload: any;
  response: any;
  proposal_id: string | null;
}


interface Outcome {
  id: string;
  mutation_id: string | null;
  predicted: any;
  measured_7d: any;
  measured_14d: any;
  measured_30d: any;
  auto_reverted_at: string | null;
  auto_revert_reason: string | null;
}

interface Proposal {
  id: string;
  scope_label: string | null;
  rationale: string | null;
  estimated_impact_sek: number | null;
}

interface TimelineItem {
  mutation: Mutation;
  outcome: Outcome | null;
  proposal: Proposal | null;
}

function actionIcon(action_type: string) {
  if (action_type.startsWith("pause")) return Pause;
  if (action_type.includes("negative") || action_type.startsWith("add")) return Plus;
  if (action_type.includes("rsa") || action_type.includes("replace")) return Pencil;
  return Pencil;
}

function deriveStatus(item: TimelineItem): {
  label: string;
  tone: string;
  icon: any;
  detail?: string;
} {
  const m = item.mutation;
  const o = item.outcome;
  if (m.status === "failed") {
    return {
      label: "Misslyckades",
      tone: "bg-red-500/15 text-red-500 border-red-500/40",
      icon: AlertCircle,
    };
  }
  if (o?.auto_reverted_at) {
    return {
      label: "Auto-reverterad",
      tone: "bg-orange-500/15 text-orange-500 border-orange-500/40",
      icon: Undo2,
      detail: o.auto_revert_reason ?? undefined,
    };
  }
  if (m.reverted_at) {
    return {
      label: "Manuell revert",
      tone: "bg-orange-500/15 text-orange-500 border-orange-500/40",
      icon: Undo2,
    };
  }
  const measured = o?.measured_14d ?? o?.measured_7d ?? o?.measured_30d ?? null;
  if (measured) {
    const conv = measured?.delta_pct?.conversions;
    if (typeof conv === "number" && conv < 0) {
      return {
        label: "Mätt negativt",
        tone: "bg-red-500/15 text-red-500 border-red-500/40",
        icon: XCircle,
      };
    }
    return {
      label: "Mätt positivt",
      tone: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
      icon: CheckCircle2,
    };
  }
  if (m.status === "success" || m.status === "pushed") {
    return {
      label: "Mätning pågår",
      tone: "bg-muted text-muted-foreground",
      icon: Hourglass,
    };
  }

  return {
    label: m.status ?? "—",
    tone: "bg-muted text-muted-foreground",
    icon: Hourglass,
  };
}

export function ChangeTimeline({ projectId }: Props) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [range, setRange] = useState<RangeKey>("30");
  const [onlyAutoRevert, setOnlyAutoRevert] = useState(false);
  const [selected, setSelected] = useState<TimelineItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const days = range === "7" ? 7 : range === "30" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const { data: mutations } = await supabase
        .from("ads_mutations")
        .select(
          "id, action_type, status, created_at, reverted_at, payload, response, proposal_id",
        )
        .eq("project_id", projectId)

        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);

      const muts = (mutations as Mutation[] | null) ?? [];
      const mutIds = muts.map((m) => m.id);
      const propIds = muts.map((m) => m.proposal_id).filter(Boolean) as string[];

      const [outRes, propRes] = await Promise.all([
        mutIds.length
          ? supabase
              .from("ads_recommendation_outcomes")
              .select(
                "id, mutation_id, predicted, measured_7d, measured_14d, measured_30d, auto_reverted_at, auto_revert_reason",
              )
              .in("mutation_id", mutIds)
          : Promise.resolve({ data: [] as any[] }),
        propIds.length
          ? supabase
              .from("ads_change_proposals")
              .select("id, scope_label, rationale, estimated_impact_sek")
              .in("id", propIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const outByMut = new Map<string, Outcome>();
      for (const o of (outRes.data ?? []) as Outcome[]) {
        if (o.mutation_id) outByMut.set(o.mutation_id, o);
      }
      const propById = new Map<string, Proposal>();
      for (const p of (propRes.data ?? []) as Proposal[]) {
        propById.set(p.id, p);
      }

      setItems(
        muts.map((m) => ({
          mutation: m,
          outcome: outByMut.get(m.id) ?? null,
          proposal: m.proposal_id ? propById.get(m.proposal_id) ?? null : null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, range]);

  const filtered = useMemo(() => {
    if (!items) return null;
    return onlyAutoRevert
      ? items.filter((i) => i.outcome?.auto_reverted_at)
      : items;
  }, [items, onlyAutoRevert]);

  const grouped = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, TimelineItem[]>();
    for (const it of filtered) {
      const day = it.mutation.created_at.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-serif text-lg">Ändringstidslinje</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vad har vi pushat — och funkade det?
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {(["7", "30", "90"] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 transition-colors",
                    range === r
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}d
                </button>
              ))}
            </div>
            <button
              onClick={() => setOnlyAutoRevert((v) => !v)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                onlyAutoRevert
                  ? "bg-orange-500/20 text-orange-500"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Endast auto-reverts
            </button>
          </div>
        </div>

        {!filtered ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Inga ändringar i valt tidsfönster.
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([day, dayItems]) => (
              <div key={day}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-mono">
                  ── {day} ──
                </div>
                <ul className="space-y-1.5">
                  {dayItems.map((it) => {
                    const Icon = actionIcon(it.mutation.action_type);
                    const status = deriveStatus(it);
                    const StatusIcon = status.icon;
                    return (
                      <li key={it.mutation.id}>
                        <button
                          onClick={() => setSelected(it)}
                          className="w-full text-left rounded-md border border-border/40 bg-muted/10 p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-mono text-muted-foreground">
                              {new Date(it.mutation.created_at).toLocaleTimeString("sv-SE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="text-sm font-medium truncate">
                              {it.proposal?.scope_label ?? it.mutation.action_type}
                            </span>
                            <Badge variant="outline" className={cn("text-[9px] ml-auto", status.tone)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status.label}
                            </Badge>
                          </div>
                          {it.proposal?.rationale && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {it.proposal.rationale}
                            </p>
                          )}
                          {status.detail && (
                            <p className="text-[10px] text-orange-500/80 mt-1 italic">
                              {status.detail}
                            </p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selected.proposal?.scope_label ?? selected.mutation.action_type}
                </SheetTitle>
                <SheetDescription>
                  {new Date(selected.mutation.created_at).toLocaleString("sv-SE")}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-4 text-sm">
                {selected.proposal?.rationale && (
                  <section>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Rationale
                    </div>
                    <p>{selected.proposal.rationale}</p>
                  </section>
                )}
                {selected.outcome && (
                  <section>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Mätt utfall
                    </div>
                    <pre className="text-[11px] bg-muted/30 rounded p-2 overflow-x-auto">
                      {JSON.stringify(
                        {
                          predicted: selected.outcome.predicted,
                          measured_7d: selected.outcome.measured_7d,
                          measured_14d: selected.outcome.measured_14d,
                          measured_30d: selected.outcome.measured_30d,
                          auto_reverted_at: selected.outcome.auto_reverted_at,
                          auto_revert_reason: selected.outcome.auto_revert_reason,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                )}
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Payload
                  </div>
                  <pre className="text-[11px] bg-muted/30 rounded p-2 overflow-x-auto">
                    {JSON.stringify(selected.mutation.payload, null, 2)}
                  </pre>
                </section>
                {selected.mutation.response && (
                  <section>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Response
                    </div>
                    <pre className="text-[11px] bg-muted/30 rounded p-2 overflow-x-auto">
                      {JSON.stringify(selected.mutation.response, null, 2)}
                    </pre>
                  </section>
                )}
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  Stäng
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
