// DiagnosisPanel — visar senaste DiagnosisReport från ads-diagnose.
// Konsumerar samma rapport som AdsAudit/AdsChat → enad sanning.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { handleGoogleReauthError, notifyGoogleReauthRequired } from "@/lib/googleReauth";

interface Diagnosis {
  id: string;
  rule_id: string;
  level: string;
  scope: string;
  scope_ref: { id: string; name: string }[];
  severity: "info" | "warn" | "critical";
  confidence: number;
  is_symptom_of?: string;
  title: string;
  why: string;
  evidence: { metric: string; value: number | string }[];
  expected_impact: { metric: string; direction: string; mid: number; horizon_days: number };
  estimated_value_sek?: number;
  proposed_actions: {
    label: string;
    detail: string;
    risk: string;
    risk_reason: string;
    kind: string;
  }[];
}

interface DiagnosisReport {
  generated_at: string;
  blockers: { gate: string; message: string; resolution: string }[];
  account_health: { optimization_score: number | null; healthy: boolean; summary: string };
  diagnoses: Diagnosis[];
  meta: { rules_evaluated: number; rules_fired: number; cache_hit: boolean; duration_ms: number };
}

interface Props {
  projectId: string;
}

const severityColors = {
  critical: "bg-destructive/15 text-destructive border-destructive/40",
  warn: "bg-yellow-500/15 text-yellow-500 border-yellow-500/40",
  info: "bg-muted text-muted-foreground border-border",
} as const;

export default function DiagnosisPanel({ projectId }: Props) {
  const [report, setReport] = useState<DiagnosisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const loadLatest = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ads_diagnostics_runs")
      .select("report, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.report) setReport(data.report as unknown as DiagnosisReport);
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) loadLatest();
  }, [projectId]);

  const runDiagnosis = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-diagnose", {
        body: { project_id: projectId },
      });
      if (error) {
        // Try to extract the real error body from the Response
        let bodyMsg = "";
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const parsed = await ctx.clone().json();
            bodyMsg = parsed?.error || parsed?.message || "";
          }
        } catch {}
        const combined = bodyMsg || (error as any).message || "";
        if (handleGoogleReauthError(combined)) return;
        throw new Error(combined || "Okänt fel");
      }
      setReport(data as DiagnosisReport);
      toast({ title: "Diagnos klar", description: `${data.meta?.rules_fired ?? 0} regler triggade.` });
    } catch (e: any) {
      const msg = e?.message || "Okänt fel";
      if (handleGoogleReauthError(msg)) return;
      toast({
        title: "Kunde inte köra diagnos",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const { rootCauses, symptoms } = useMemo(() => {
    if (!report) return { rootCauses: [], symptoms: [] };
    const root = report.diagnoses.filter((d) => !d.is_symptom_of);
    const sym = report.diagnoses.filter((d) => !!d.is_symptom_of);
    return { rootCauses: root, symptoms: sym };
  }, [report]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar diagnos…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 font-serif text-xl">
            <Sparkles className="h-5 w-5 text-primary" /> Diagnosmotor
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Delad analys som driver Audit, Chat och rapporter — körs alltid mot samma kontosnapshot.
          </p>
        </div>
        <Button onClick={runDiagnosis} disabled={running} size="sm" variant="outline">
          {running
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyserar…</>
            : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Kör diagnos</>}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!report
          ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Ingen diagnos har körts ännu. Tryck på <strong>Kör diagnos</strong> för att starta.
            </div>
          )
          : (
            <>
              {report.blockers.length > 0 && (
                <div className="space-y-2">
                  {report.blockers.map((b, i) => (
                    <Alert key={i} variant="destructive">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertTitle>{b.gate.replace(/_/g, " ")}</AlertTitle>
                      <AlertDescription className="space-y-1">
                        <p>{b.message}</p>
                        <p className="text-xs opacity-80">→ {b.resolution}</p>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-sm">
                {report.account_health.healthy
                  ? <CheckCircle2 className="h-4 w-4 text-primary" />
                  : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                <span className="font-medium">{report.account_health.summary}</span>
                {report.account_health.optimization_score !== null && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Optimization score {(report.account_health.optimization_score * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>

              {rootCauses.length === 0 && report.blockers.length === 0
                ? (
                  <p className="text-sm text-muted-foreground py-3">
                    Inga problem hittades. {report.meta.rules_evaluated} regler utvärderade.
                  </p>
                )
                : (
                  <div className="space-y-2">
                    {rootCauses.map((d) => (
                      <DiagnosisCard
                        key={d.id}
                        d={d}
                        expanded={expanded.has(d.id)}
                        onToggle={() => {
                          const n = new Set(expanded);
                          n.has(d.id) ? n.delete(d.id) : n.add(d.id);
                          setExpanded(n);
                        }}
                      />
                    ))}
                  </div>
                )}

              {symptoms.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    + {symptoms.length} symptom (kopplade till rotorsaker ovan)
                  </summary>
                  <ul className="mt-2 space-y-1 ml-4">
                    {symptoms.map((s) => (
                      <li key={s.id}>
                        • {s.title} — {s.scope_ref.map((r) => r.name).join(" / ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2">
                <span>{report.meta.rules_evaluated} regler utvärderade</span>
                <span>·</span>
                <span>{report.meta.rules_fired} träffar</span>
                <span>·</span>
                <span>{report.meta.cache_hit ? "från cache" : "färsk hämtning"}</span>
                <span>·</span>
                <span>{report.meta.duration_ms} ms</span>
              </div>
            </>
          )}
      </CardContent>
    </Card>
  );
}

function DiagnosisCard({ d, expanded, onToggle }: { d: Diagnosis; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-lg border p-3 ${severityColors[d.severity]}`}>
      <button onClick={onToggle} className="w-full flex items-start justify-between gap-2 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{d.title}</span>
            <Badge variant="outline" className="text-[10px]">
              {(d.confidence * 100).toFixed(0)}% säkerhet
            </Badge>
            {d.estimated_value_sek != null && d.estimated_value_sek > 0 && (
              <Badge variant="outline" className="text-[10px]">
                ~{d.estimated_value_sek.toLocaleString("sv-SE")} kr
              </Badge>
            )}
          </div>
          <div className="text-xs opacity-80 mt-0.5">
            {d.scope_ref.map((r) => r.name).join(" / ") || "Hela kontot"}
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 mt-1" /> : <ChevronRight className="h-4 w-4 mt-1" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs">
          {d.why && <p className="opacity-80">{d.why}</p>}
          {d.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.evidence.map((e, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                  {e.metric}: {String(e.value)}
                </Badge>
              ))}
            </div>
          )}
          {d.proposed_actions.map((a, i) => (
            <div key={i} className="rounded border border-border bg-background/50 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{a.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  Risk: {a.risk}
                </Badge>
              </div>
              <p className="opacity-80">{a.detail}</p>
              <p className="opacity-60 text-[10px]">Varför säker: {a.risk_reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
