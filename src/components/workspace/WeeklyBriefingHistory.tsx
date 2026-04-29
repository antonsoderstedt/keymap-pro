import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

interface Job {
  id: string;
  status: string;
  current_step: string | null;
  progress_pct: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  payload: any;
  created_at: string;
}

interface Props {
  projectId: string;
  /** Bumpa när ny körning startas så listan refreshas. */
  refreshKey?: number;
}

const formatDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—";

const duration = (start: string | null, end: string | null) => {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
};

export default function WeeklyBriefingHistory({ projectId, refreshKey }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("analysis_jobs")
      .select("id,status,current_step,progress_pct,started_at,completed_at,error_message,payload,created_at")
      .eq("project_id", projectId)
      .eq("job_type", "weekly_briefing")
      .order("created_at", { ascending: false })
      .limit(20);
    setJobs((data as Job[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId, refreshKey]);

  // Live-poll om ett jobb är running
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "pending");
    if (!hasRunning) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [jobs]);

  const lastSuccess = jobs.find((j) => j.status === "completed");
  const lastFailure = jobs.find((j) => j.status === "failed");
  const running = jobs.find((j) => j.status === "running" || j.status === "pending");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Jobbhistorik
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={load} className="gap-2 h-7 px-2 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Uppdatera
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sammanfattning */}
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Senast lyckad"
            value={lastSuccess ? formatDateTime(lastSuccess.completed_at) : "Aldrig"}
            tone={lastSuccess ? "ok" : "muted"}
          />
          <SummaryTile
            label="Pågående"
            value={running ? `${running.progress_pct}% — ${running.current_step || "kör…"}` : "Ingen"}
            tone={running ? "running" : "muted"}
          />
          <SummaryTile
            label="Senaste fel"
            value={lastFailure ? formatDateTime(lastFailure.completed_at || lastFailure.created_at) : "Inga"}
            tone={lastFailure ? "error" : "muted"}
          />
        </div>

        {/* Lista */}
        {loading && jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Laddar…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Inga briefingkörningar ännu — generera den första ovan.
          </p>
        ) : (
          <div className="space-y-1.5">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "ok" | "error" | "running" | "muted" }) {
  const toneClass =
    tone === "ok"
      ? "border-primary/30 bg-primary/5"
      : tone === "error"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "running"
      ? "border-yellow-500/40 bg-yellow-500/5"
      : "border-border";
  return (
    <div className={`p-3 rounded-md border ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="text-sm font-medium mt-1 truncate">{value}</div>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const week = job.payload?.week_start || "—";
  const trigger = job.payload?.trigger || "manual";
  const counts = job.payload?.counts;

  const StatusIcon =
    job.status === "completed" ? CheckCircle2
    : job.status === "failed" ? XCircle
    : job.status === "running" || job.status === "pending" ? Loader2
    : AlertTriangle;
  const iconClass =
    job.status === "completed" ? "text-primary"
    : job.status === "failed" ? "text-destructive"
    : job.status === "running" || job.status === "pending" ? "text-yellow-500 animate-spin"
    : "text-muted-foreground";

  const statusVariant: any =
    job.status === "completed" ? "default"
    : job.status === "failed" ? "destructive"
    : "secondary";

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-md border border-border hover:border-primary/40 transition-colors">
      <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">v.{week}</span>
          <Badge variant={statusVariant} className="text-[10px] capitalize">{job.status}</Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{trigger}</Badge>
          {counts && (
            <span className="text-[10px] text-muted-foreground">
              {counts.wins} vinster · {counts.risks} risker · {counts.actions} actions
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
          Startad {formatDateTime(job.started_at || job.created_at)} · Tid: {duration(job.started_at, job.completed_at)}
        </div>
        {job.error_message && (
          <div className="text-[11px] text-destructive mt-1 break-words bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
            {job.error_message}
          </div>
        )}
      </div>
    </div>
  );
}
