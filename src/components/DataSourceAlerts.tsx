import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Loader2, X, Plug, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDataSourcesStatus, type SourceInfo, type SourceKey } from "@/hooks/useDataSourcesStatus";
import { reconnectGoogle } from "@/lib/googleOAuth";

const LABEL: Record<SourceKey, string> = {
  ga4: "Google Analytics 4",
  gsc: "Search Console",
  ads: "Google Ads",
};

const SEVERITY_ORDER = ["reauth_required", "error", "stale", "not_connected"] as const;

const REASON_TEXT: Record<string, string> = {
  reauth_required: "Google-anslutningen behöver förnyas (token utgången eller scope saknas).",
  error: "Senaste synken misslyckades.",
  stale: "Datan är inaktuell — ingen lyckad synk på en stund.",
  not_connected: "Inget konto valt för denna källa.",
};

function formatAge(sec: number | null): string {
  if (sec === null) return "aldrig";
  if (sec < 60) return "nyss";
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h sedan`;
  return `${Math.floor(sec / 86400)} d sedan`;
}

interface Props {
  projectId: string;
}

export function DataSourceAlerts({ projectId }: Props) {
  const { data, refresh } = useDataSourcesStatus(projectId);
  const [reconnecting, setReconnecting] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const [notifiedKey, setNotifiedKey] = useState<string>("");

  const problems = useMemo<SourceInfo[]>(() => {
    if (!data) return [];
    return data.sources
      .filter((s) => s.status !== "ok")
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.status as any) - SEVERITY_ORDER.indexOf(b.status as any));
  }, [data]);

  // Toast once when a new problem appears in the session
  useEffect(() => {
    if (!problems.length) return;
    const key = problems.map((p) => `${p.source}:${p.status}`).sort().join("|");
    if (key === notifiedKey) return;
    setNotifiedKey(key);

    const reauth = problems.find((p) => p.status === "reauth_required");
    const errored = problems.find((p) => p.status === "error");
    if (reauth) {
      toast.error(`${LABEL[reauth.source]} behöver kopplas om`, {
        description: reauth.last_error || "Token utgången eller saknar behörighet.",
      });
    } else if (errored) {
      toast.error(`${LABEL[errored.source]} kunde inte synkas`, {
        description: errored.last_error || "Se Datakällor för detaljer.",
      });
    } else if (problems.some((p) => p.status === "stale")) {
      const stale = problems.find((p) => p.status === "stale")!;
      toast.warning(`${LABEL[stale.source]}-datan är inaktuell`, {
        description: `Senast synkad ${formatAge(stale.age_seconds)}.`,
      });
    }
  }, [problems, notifiedKey]);

  const visible = problems.filter((p) => {
    const ts = dismissed[`${p.source}:${p.status}`];
    return !ts || Date.now() - ts > 30 * 60 * 1000;
  });

  if (!visible.length) return null;

  const needsReauth = visible.some((p) => p.status === "reauth_required");

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      toast.info("Startar Google OAuth …");
      await reconnectGoogle();
    } catch (e: any) {
      setReconnecting(false);
      toast.error("Kunde inte starta OAuth", { description: e?.message });
    }
  };

  return (
    <div className="border-b border-destructive/40 bg-destructive/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 space-y-2">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {needsReauth
                ? "Datakällor behöver kopplas om"
                : `${visible.length} datakälla${visible.length > 1 ? "or" : ""} har problem`}
            </p>
            <ul className="mt-1.5 space-y-1">
              {visible.map((p) => {
                const key = `${p.source}:${p.status}`;
                return (
                  <li key={key} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                      p.status === "stale" ? "bg-yellow-500" : "bg-destructive"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{LABEL[p.source]}</span>{" "}
                      <span className="text-muted-foreground">
                        — {REASON_TEXT[p.status] || p.reason || p.status}
                        {p.last_synced_at && ` (synk ${formatAge(p.age_seconds)})`}
                      </span>
                      {p.last_error && (
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80 break-words">
                          {p.last_error}
                        </p>
                      )}
                    </div>
                    <button
                      aria-label="Dölj"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setDismissed((d) => ({ ...d, [key]: Date.now() }))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {needsReauth && (
                <Button size="sm" variant="default" onClick={handleReconnect} disabled={reconnecting}>
                  {reconnecting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Koppla om Google
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => refresh()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Försök synka igen
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to={`/clients/${projectId}/data-sources`}>
                  <Plug className="mr-1.5 h-3.5 w-3.5" />
                  Hantera datakällor
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
