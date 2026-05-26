// Header för Performance Command Center.
// Period-väljare, jämförelseperiod, senast uppdaterad och data health-pills i en rad.
import { useDataSourcesStatus } from "@/hooks/useDataSourcesStatus";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import type { Range } from "@/hooks/usePerformanceData";

interface Props {
  projectId: string;
  projectName: string | null;
  range: Range;
  onRangeChange: (r: Range) => void;
  rangeDays: number;
  lastUpdatedIso: string | null;
}

const LABELS: Record<Range, string> = { "7": "7 dagar", "28": "28 dagar", "90": "90 dagar" };

function fmtDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "nyss";
  if (d < 3600) return `${Math.round(d / 60)} min sedan`;
  if (d < 86_400) return `${Math.round(d / 3600)} h sedan`;
  return `${Math.round(d / 86_400)} d sedan`;
}

const SOURCE_LABEL: Record<string, string> = {
  gsc: "Search Console",
  ga4: "Google Analytics",
  ads: "Google Ads",
  keyword_planner: "Keyword Planner",
};

function statusTone(s: string): string {
  if (s === "ok") return "bg-emerald-500";
  if (s === "stale") return "bg-yellow-500";
  if (s === "reauth_required") return "bg-orange-500";
  if (s === "not_connected") return "bg-muted-foreground/40";
  return "bg-red-500";
}

function statusWord(s: string): string {
  if (s === "ok") return "OK";
  if (s === "stale") return "Inaktuell";
  if (s === "reauth_required") return "Behöver kopplas om";
  if (s === "not_connected") return "Inte ansluten";
  return "Fel";
}

export function PerformanceHeader({
  projectId,
  projectName,
  range,
  onRangeChange,
  rangeDays,
  lastUpdatedIso,
}: Props) {
  const { data } = useDataSourcesStatus(projectId);
  const sources = data?.sources ?? [];

  const end = new Date();
  const start = new Date(end.getTime() - rangeDays * 86_400_000);
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(prevEnd.getTime() - rangeDays * 86_400_000);

  return (
    <header className="space-y-3 border-b border-border/40 pb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium tracking-tight">Performance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projectName
              ? `Översikt över trafik, synlighet och åtgärder för ${projectName}.`
              : "Översikt över trafik, synlighet och åtgärder."}
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-border/60 p-0.5 text-xs">
          {(Object.keys(LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                range === r
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Period: {fmtDate(start)}–{fmtDate(end)}
        </span>
        <span className="tabular-nums">
          jmf {fmtDate(prevStart)}–{fmtDate(prevEnd)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          uppdaterad {relTime(lastUpdatedIso)}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {sources.map((s) => (
            <Popover key={s.source}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusTone(s.status))} />
                  <span className="text-[11px]">{SOURCE_LABEL[s.source] ?? s.source}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">
                    {SOURCE_LABEL[s.source] ?? s.source}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      s.status === "ok"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : s.status === "stale"
                          ? "bg-yellow-500/15 text-yellow-600"
                          : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {statusWord(s.status)}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Senast synkad: {s.last_synced_at ? relTime(s.last_synced_at) : "aldrig"}
                </div>
                {s.last_error && (
                  <div className="font-mono text-[10px] text-muted-foreground break-words">
                    {s.last_error}
                  </div>
                )}
                <Link
                  to={`/clients/${projectId}/data-sources`}
                  className="block pt-1 text-foreground underline-offset-4 hover:underline"
                >
                  Öppna datakällor →
                </Link>
              </PopoverContent>
            </Popover>
          ))}
        </span>
      </div>
    </header>
  );
}
