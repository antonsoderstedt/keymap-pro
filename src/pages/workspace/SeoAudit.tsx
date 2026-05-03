import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, Play, RefreshCw, AlertTriangle, AlertCircle, Info, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface AuditRun {
  id: string;
  health_score: number | null;
  status: string;
  totals: any;
  completed_at: string | null;
  created_at: string;
}

interface Finding {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string | null;
  recommendation: string | null;
  affected_url: string | null;
  status: string;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_STYLE: Record<string, { icon: any; color: string; label: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive", label: "Kritisk" },
  high: { icon: AlertCircle, color: "text-orange-500", label: "Hög" },
  medium: { icon: Info, color: "text-yellow-500", label: "Medium" },
  low: { icon: Info, color: "text-muted-foreground", label: "Låg" },
};

export default function SeoAudit() {
  const { id } = useParams<{ id: string }>();
  const [latestRun, setLatestRun] = useState<AuditRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");

  const load = async () => {
    if (!id) return;
    const { data: runs } = await supabase
      .from("audit_runs").select("*").eq("project_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setLatestRun(runs as AuditRun | null);
    if (runs) {
      const { data: f } = await supabase
        .from("audit_findings").select("*").eq("run_id", (runs as any).id);
      setFindings((f as Finding[]) || []);
    }
  };

  useEffect(() => { load(); }, [id]);

  const runAudit = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("seo-audit-run", { body: { project_id: id } });
      if (error) throw error;
      toast.success("SEO Audit klar");
      await load();
    } catch (e: any) {
      toast.error("Audit misslyckades: " + e.message);
    } finally {
      setRunning(false);
    }
  };

  const toggleFinding = async (f: Finding) => {
    const newStatus = f.status === "done" ? "open" : "done";
    await supabase.from("audit_findings")
      .update({ status: newStatus, resolved_at: newStatus === "done" ? new Date().toISOString() : null })
      .eq("id", f.id);
    setFindings(findings.map(x => x.id === f.id ? { ...x, status: newStatus } : x));
  };

  const sevToPriority = (s: string) =>
    s === "critical" ? "critical" : s === "high" ? "high" : s === "medium" ? "medium" : "low";

  const createActionForFinding = async (f: Finding) => {
    if (!id) return;
    const { error } = await supabase.from("action_items").insert({
      project_id: id,
      title: `[SEO] ${f.title}`,
      description: f.description || f.recommendation || "",
      category: "seo",
      priority: sevToPriority(f.severity),
      source_type: "seo_audit",
      source_id: f.id,
      source_payload: { affected_url: f.affected_url, recommendation: f.recommendation, severity: f.severity, category: f.category },
    });
    if (error) toast.error(error.message);
    else toast.success("Åtgärd skapad");
  };

  const createActionsForCriticalAndHigh = async () => {
    if (!id) return;
    const top = findings.filter((f) => (f.severity === "critical" || f.severity === "high") && f.status !== "done").slice(0, 10);
    if (!top.length) return toast.info("Inga öppna kritiska/höga findings");
    for (const f of top) await createActionForFinding(f);
    toast.success(`${top.length} åtgärder skapade`);
  };

  const filtered = findings
    .filter(f => filter === "all" || (filter === "open" ? f.status !== "done" : f.status === "done"))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  const score = latestRun?.health_score ?? null;
  const scoreColor = score === null ? "text-muted-foreground" : score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-destructive";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" /> SEO Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Health score 0-100. Bocka av findings när du fixat — vi mäter effekten automatiskt.
          </p>
        </div>
        <Button onClick={runAudit} disabled={running} className="gap-2">
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {latestRun ? "Kör om" : "Kör audit"}
        </Button>
      </div>

      {/* Score */}
      {latestRun && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Health Score</div>
                <div className={`font-serif text-6xl ${scoreColor}`}>{score ?? "—"}<span className="text-2xl text-muted-foreground">/100</span></div>
                <div className="text-xs text-muted-foreground mt-1">Senaste körning {latestRun.completed_at ? new Date(latestRun.completed_at).toLocaleString("sv-SE") : "pågår"}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["critical", "high", "medium", "low"] as const).map(sev => {
                  const count = latestRun.totals?.[sev] ?? 0;
                  const Icon = SEVERITY_STYLE[sev].icon;
                  return (
                    <div key={sev} className="rounded-lg border border-border p-3 min-w-[100px]">
                      <div className={`flex items-center gap-1.5 text-xs uppercase tracking-wider ${SEVERITY_STYLE[sev].color}`}>
                        <Icon className="h-3 w-3" /> {SEVERITY_STYLE[sev].label}
                      </div>
                      <div className="font-serif text-2xl mt-1">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4">
              <Progress value={score ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {!latestRun && !running && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Ingen audit körd ännu.</p>
            <Button onClick={runAudit} className="gap-2">
              <Play className="h-4 w-4" /> Kör första audit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="font-serif text-lg">Findings ({filtered.length})</CardTitle>
              <div className="flex gap-1">
                {(["open", "done", "all"] as const).map(f => (
                  <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
                    {f === "open" ? "Öppna" : f === "done" ? "Klara" : "Alla"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.map(f => {
              const sev = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.low;
              const SevIcon = sev.icon;
              return (
                <div key={f.id} className={`flex items-start gap-3 p-3 rounded-lg border ${f.status === "done" ? "border-border bg-muted/20 opacity-60" : "border-border"}`}>
                  <Checkbox
                    checked={f.status === "done"}
                    onCheckedChange={() => toggleFinding(f)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <SevIcon className={`h-3.5 w-3.5 ${sev.color}`} />
                      <Badge variant="outline" className="text-[10px]">{sev.label}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>
                    </div>
                    <div className={`text-sm font-medium ${f.status === "done" ? "line-through" : ""}`}>{f.title}</div>
                    {f.description && <div className="text-xs text-muted-foreground mt-1">{f.description}</div>}
                    {f.recommendation && (
                      <div className="text-xs mt-2 p-2 bg-primary/5 border border-primary/20 rounded">
                        <span className="font-medium">Hur fixa: </span>{f.recommendation}
                      </div>
                    )}
                    {f.affected_url && (
                      <a href={f.affected_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block truncate">
                        {f.affected_url}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
