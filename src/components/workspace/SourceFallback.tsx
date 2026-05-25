// SourceFallback — degraded-mode messaging för en datakälla (GA4 / GSC / Ads)
// i en Performance-sektion.
//
// Regler:
// 1. Källa OK + data finns        → returnera null. Caller renderar metrics.
// 2. Källa OK + ingen data        → "warn"-banner ovanför metrics. Caller får
//                                    själv välja om hen vill rendera tomma metrics
//                                    eller inte. useSourceFallback returnerar
//                                    state="warn".
// 3. Källa stale                  → "warn"-banner ovanför metrics
//                                    ("data uppdaterades senast X — kan vara
//                                    inaktuell").
// 4. Källa not_connected/reauth/error → "block"-panel (caller ska INTE rendera
//                                        metrics — de skulle vara vilseledande).
//
// Komponenten har ingen egen state och gör inga DB-anrop förutom det som
// useSourceStatus redan gör. Den är ren UI ovanpå befintlig source-health-pipeline.

import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSourceStatus, type SourceKey } from "@/hooks/useDataSourcesStatus";
import { reconnectGoogle } from "@/lib/googleOAuth";
import { toast } from "sonner";

const LABEL: Record<SourceKey, string> = {
  ga4: "Google Analytics 4",
  gsc: "Search Console",
  ads: "Google Ads",
  keyword_planner: "Keyword Planner",
};

function formatAge(sec: number | null): string {
  if (sec === null) return "aldrig";
  if (sec < 60) return "nyss";
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h sedan`;
  return `${Math.floor(sec / 86400)} d sedan`;
}

export type FallbackState = "ok" | "warn" | "block";

interface UseSourceFallbackArgs {
  projectId: string;
  source: SourceKey;
  /** Har vi en snapshot med faktiska rader att visa? */
  hasData: boolean;
}

interface UseSourceFallbackResult {
  state: FallbackState;
  /** Komponent som ska renderas. null när state === "ok". */
  node: ReactNode | null;
}

/**
 * Hook som returnerar fallback-tillstånd för en datakälla.
 * Caller använder `state` för att avgöra om metrics ska renderas:
 *   - "ok"    → rendera metrics. `node` är null.
 *   - "warn"  → rendera `node` OVANFÖR metrics. Metrics kan fortfarande vara
 *               relevanta (stale-fall) eller saknas (tomt snapshot-fall).
 *   - "block" → rendera ENDAST `node`. Metrics ska INTE renderas eftersom de
 *               skulle vara vilseledande (ej ansluten, behöver kopplas om, error).
 */
export function useSourceFallback({ projectId, source, hasData }: UseSourceFallbackArgs): UseSourceFallbackResult {
  const { info } = useSourceStatus(projectId, source);
  const status = info?.status ?? "not_connected";

  if (status === "ok" && hasData) {
    return { state: "ok", node: null };
  }

  if (status === "not_connected" || status === "reauth_required" || status === "error") {
    return {
      state: "block",
      node: <SourceFallbackPanel projectId={projectId} source={source} kind={status} lastError={info?.last_error ?? null} />,
    };
  }

  // status === "ok" && !hasData  OR  status === "stale"
  return {
    state: "warn",
    node: <SourceFallbackBanner projectId={projectId} source={source} kind={status === "stale" ? "stale" : "empty"} ageSeconds={info?.age_seconds ?? null} />,
  };
}

interface PanelProps {
  projectId: string;
  source: SourceKey;
  kind: "not_connected" | "reauth_required" | "error";
  lastError: string | null;
}

function SourceFallbackPanel({ projectId, source, kind, lastError }: PanelProps) {
  const [reconnecting, setReconnecting] = useState(false);

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

  const headline =
    kind === "not_connected" ? `${LABEL[source]} är inte ansluten.` :
    kind === "reauth_required" ? `${LABEL[source]} behöver kopplas om.` :
    `${LABEL[source]} kunde inte synkas.`;

  const explanation =
    kind === "not_connected"
      ? "Anslut källan för att se faktiska siffror här. Utan koppling kan vi inte verifiera trafik, konverteringar eller demand."
      : kind === "reauth_required"
        ? "Google-token har gått ut eller saknar rätt behörighet. Inga nya datapunkter kan hämtas förrän kopplingen förnyats."
        : "Senaste synk-försöket misslyckades. Siffror visas inte här förrän en lyckad synk finns.";

  return (
    <div
      role="alert"
      data-testid={`source-fallback-block-${source}`}
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-foreground">{headline}</p>
          <p className="text-xs text-muted-foreground">{explanation}</p>
          {lastError && (
            <p className="font-mono text-[10px] text-muted-foreground/80 break-words">
              {lastError}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === "reauth_required" && (
          <Button size="sm" onClick={handleReconnect} disabled={reconnecting}>
            {reconnecting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Koppla om Google
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link to={`/clients/${projectId}/data-sources`}>
            <Plug className="mr-1.5 h-3.5 w-3.5" />
            Öppna datakällor
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

interface BannerProps {
  projectId: string;
  source: SourceKey;
  kind: "stale" | "empty";
  ageSeconds: number | null;
}

function SourceFallbackBanner({ projectId, source, kind, ageSeconds }: BannerProps) {
  const headline =
    kind === "stale"
      ? `${LABEL[source]}-data kan vara inaktuell — senast synkad ${formatAge(ageSeconds)}.`
      : `Senaste ${LABEL[source]}-snapshot är tom. Inga rader att visa för perioden.`;

  return (
    <div
      role="status"
      data-testid={`source-fallback-warn-${source}`}
      className="rounded-md border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 flex items-start gap-2.5"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-600" />
      <div className="min-w-0 flex-1 text-xs">
        <span className="text-foreground">{headline}</span>{" "}
        <Link
          to={`/clients/${projectId}/data-sources`}
          className="text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
        >
          Öppna datakällor →
        </Link>
      </div>
    </div>
  );
}

// Standalone-komponent för callers som hellre använder JSX direkt än hook.
// Internt anropar den hooken och renderar `node` (eller null om state="ok").
interface SourceFallbackProps extends UseSourceFallbackArgs {
  /** Render-prop som tar emot state — för callers som vill villkora egen UI. */
  render?: (state: FallbackState, node: ReactNode | null) => ReactNode;
}

export function SourceFallback({ render, ...args }: SourceFallbackProps) {
  const { state, node } = useSourceFallback(args);
  if (render) return <>{render(state, node)}</>;
  return <>{node}</>;
}
