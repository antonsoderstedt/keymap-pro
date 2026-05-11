import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useSourceStatus, type SourceKey } from "@/hooks/useDataSourcesStatus";
import { Link } from "react-router-dom";

interface Props {
  projectId: string;
  source: SourceKey;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

const LABEL: Record<SourceKey, string> = { ga4: "GA4", gsc: "Search Console", ads: "Google Ads" };

function formatAge(sec: number | null): string {
  if (sec === null) return "aldrig";
  if (sec < 60) return "nyss";
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h sedan`;
  return `${Math.floor(sec / 86400)} d sedan`;
}

const DOT: Record<string, string> = {
  ok: "bg-primary",
  stale: "bg-yellow-500",
  reauth_required: "bg-destructive",
  error: "bg-destructive",
  not_connected: "bg-muted-foreground",
};

export default function DataFreshnessChip({ projectId, source, onRefresh, refreshing }: Props) {
  const { info, loading } = useSourceStatus(projectId, source);
  const status = info?.status ?? "not_connected";
  const age = info?.age_seconds ?? null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs">
      <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
      <Link to={`/clients/${projectId}/data-sources`} className="font-medium hover:underline">
        {LABEL[source]}
      </Link>
      <span className="text-muted-foreground">
        {loading ? "…" : status === "not_connected" ? "ej ansluten" : `uppdaterad ${formatAge(age)}`}
      </span>
      {status !== "ok" && info?.reason && (
        <Badge variant="outline" className="text-[10px]">{info.reason}</Badge>
      )}
      {onRefresh && (
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );
}
