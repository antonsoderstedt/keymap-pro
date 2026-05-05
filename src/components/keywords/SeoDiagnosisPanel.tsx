import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Plus,
  Target,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

interface Diagnosis {
  id: string;
  rule_id: string;
  category: string;
  severity: "info" | "warn" | "critical";
  confidence: number;
  title: string;
  what_happens: string;
  why: string;
  evidence: { source: string; metric: string; value: any; period?: string }[];
  expected_impact: { metric: string; low: number; mid: number; high: number; horizon_days: number; reasoning: string };
  estimated_value_sek: number;
  proposed_actions: { kind: string; label: string; detail: string; effort: string; steps: string[]; creates_action_item: boolean }[];
  scope_ref: { id: string; name: string }[];
  data_sources: string[];
  is_symptom_of?: string;
}

interface Report {
  generated_at: string;
  blockers: { gate: string; message: string; resolution: string }[];
  site_health: { audit_score: number | null; healthy: boolean; summary: string };
  diagnoses: Diagnosis[];
  meta: { rules_evaluated: number; rules_fired: number; data_sources: string[] };
}

const CATEGORY_LABELS: Record<string, string> = {
  architecture: "Arkitektur",
  opportunity: "Möjligheter",
  page: "Sidor",
  ai_llm: "AI/LLM",
  authority: "Auktoritet",
};

export function SeoDiagnosisPanel({ projectId }: Props) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: latestRun, isLoading } = useQuery({
    queryKey: ["seo-diagnosis", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("seo_diagnostics_runs")
        .select("report, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { report: Report; created_at: string } | null;
    },
    staleTime: 60 * 60 * 1000,
  });

  async function runDiagnosis() {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("seo-diagnose", {
        body: { project_id: projectId, force: true },
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["seo-diagnosis", projectId] });
      toast.success("SEO-diagnos klar");
    } catch (e: any) {
      toast.error("Kunde inte köra diagnos: " + (e?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  async function createActionItem(d: Diagnosis) {
    const action = d.proposed_actions[0];
    if (!action) return;
    const { error } = await supabase.from("action_items").insert({
      project_id: projectId,
      title: d.title,
      description: action.detail,
      category: d.category,
      source_type: "seo_diagnosis",
      source_id: d.id,
      priority: d.severity === "critical" ? "high" : d.severity === "warn" ? "medium" : "low",
      expected_impact_sek: d.estimated_value_sek,
      status: "pending",
      notes: { steps: action.steps, rule_id: d.rule_id, evidence: d.evidence },
    } as any);
    if (error) toast.error("Kunde inte skapa åtgärd: " + error.message);
    else toast.success("Åtgärd skapad");
  }

  const report = latestRun?.report;
  const diagnoses = report?.diagnoses ?? [];
  const filtered =
    activeCategory === "all" ? diagnoses : diagnoses.filter((d) => d.category === activeCategory);
  const counts: Record<string, number> = { all: diagnoses.length };
  for (const d of diagnoses) counts[d.category] = (counts[d.category] ?? 0) + 1;
  const totalValue = diagnoses.reduce((s, d) => s + d.estimated_value_sek, 0);
  const criticalCount = diagnoses.filter((d) => d.severity === "critical").length;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            SEO & innehållsdiagnos
          </h2>
          {report ? (
            <p className="text-sm text-muted-foreground mt-1">
              Senast körd: {new Date(latestRun!.created_at).toLocaleString("sv-SE")} •{" "}
              <span className="text-destructive font-medium">{criticalCount} kritiska</span> •{" "}
              {diagnoses.length} möjligheter •{" "}
              <span className="text-primary font-medium">
                {totalValue.toLocaleString("sv-SE")} kr/mån potential
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Laddar…" : "Ingen diagnos körd ännu — klicka för att börja."}
            </p>
          )}
        </div>
        <Button onClick={runDiagnosis} disabled={running} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
          {running ? "Kör…" : "Kör diagnos"}
        </Button>
      </div>

      {report?.blockers?.length ? (
        <div className="space-y-2">
          {report.blockers.map((b, i) => (
            <div
              key={i}
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 flex gap-2 items-start"
            >
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{b.message}</p>
                <p className="text-muted-foreground">{b.resolution}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {report && diagnoses.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {(["all", "architecture", "opportunity", "page", "ai_llm", "authority"] as const).map(
              (cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  {cat === "all" ? "Alla" : CATEGORY_LABELS[cat]}{" "}
                  <span className="opacity-70">{counts[cat] ?? 0}</span>
                </button>
              )
            )}
          </div>

          <div className="space-y-3">
            {filtered.map((d) => {
              const isOpen = expanded.has(d.id);
              return (
                <div
                  key={d.id}
                  className={`rounded-lg border p-4 ${
                    d.severity === "critical"
                      ? "border-destructive/40 bg-destructive/5"
                      : d.severity === "warn"
                      ? "border-orange-500/40 bg-orange-500/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge
                          variant={
                            d.severity === "critical"
                              ? "destructive"
                              : d.severity === "warn"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {d.severity === "critical"
                            ? "KRITISK"
                            : d.severity === "warn"
                            ? "VARNING"
                            : "INFO"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[d.category]} • {Math.round(d.confidence * 100)}% confidence
                        </span>
                        {d.is_symptom_of && (
                          <Badge variant="outline" className="text-xs">
                            symptom
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold">{d.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{d.what_happens}</p>
                      {d.estimated_value_sek > 0 && (
                        <p className="text-sm mt-2 flex items-center gap-1.5 text-primary font-medium">
                          <TrendingUp className="h-3.5 w-3.5" />
                          {d.estimated_value_sek.toLocaleString("sv-SE")} kr/mån potential (
                          {d.expected_impact.horizon_days}d)
                        </p>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-3 text-sm">
                      <div>
                        <p className="font-medium mb-1">Varför viktigt</p>
                        <p className="text-muted-foreground">{d.why}</p>
                      </div>
                      <div>
                        <p className="font-medium mb-1">Evidens</p>
                        <ul className="text-muted-foreground space-y-0.5">
                          {d.evidence.map((e, i) => (
                            <li key={i}>
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                {e.source}
                              </span>{" "}
                              {e.metric}: <strong>{String(e.value)}</strong>
                              {e.period ? ` (${e.period})` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {d.proposed_actions[0] && (
                        <div>
                          <p className="font-medium mb-1">
                            {d.proposed_actions[0].label}{" "}
                            <span className="text-xs text-muted-foreground">
                              ({d.proposed_actions[0].effort} ansträngning)
                            </span>
                          </p>
                          <p className="text-muted-foreground mb-2">{d.proposed_actions[0].detail}</p>
                          <ol className="text-muted-foreground list-decimal pl-5 space-y-0.5">
                            {d.proposed_actions[0].steps.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    {d.proposed_actions[0]?.creates_action_item && (
                      <Button size="sm" variant="default" onClick={() => createActionItem(d)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Lägg till i Åtgärder
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const next = new Set(expanded);
                        if (isOpen) next.delete(d.id);
                        else next.add(d.id);
                        setExpanded(next);
                      }}
                    >
                      {isOpen ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5 mr-1" /> Dölj
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5 mr-1" /> Visa detaljer
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
