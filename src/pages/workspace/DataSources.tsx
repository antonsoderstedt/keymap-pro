import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Link2, AlertTriangle } from "lucide-react";
import { useDataSourcesStatus, type SourceInfo } from "@/hooks/useDataSourcesStatus";
import { reconnectGoogle } from "@/lib/googleOAuth";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

const LABEL: Record<string, string> = { ga4: "Google Analytics 4", gsc: "Google Search Console", ads: "Google Ads" };
const DOT: Record<string, string> = {
  ok: "bg-primary",
  stale: "bg-yellow-500",
  reauth_required: "bg-destructive",
  error: "bg-destructive",
  not_connected: "bg-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "Ansluten · uppdaterad",
  stale: "Föråldrad data",
  reauth_required: "Koppla om Google",
  error: "Fel vid senaste hämtning",
  not_connected: "Ej ansluten",
};

function ageText(sec: number | null): string {
  if (sec === null) return "aldrig";
  if (sec < 60) return "för en stund sedan";
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h sedan`;
  return `${Math.floor(sec / 86400)} d sedan`;
}

export default function DataSources() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, loading, refresh } = useDataSourcesStatus(id);
  const [reconnecting, setReconnecting] = useState(false);

  const handleReconnect = async () => {
    setReconnecting(true);
    try { await reconnectGoogle(); }
    catch (e: any) { toast.error("Kunde inte starta OAuth", { description: e?.message }); setReconnecting(false); }
  };

  const handleForceRefresh = async (source: string) => {
    if (source === "ads") {
      await supabase.functions.invoke("ads-diagnose", { body: { project_id: id } });
    } else if (source === "gsc") {
      await supabase.functions.invoke("gsc-fetch", { body: { action: "sites", projectId: id } });
    } else if (source === "ga4") {
      await supabase.functions.invoke("ga4-fetch", { body: { action: "properties", projectId: id } });
    }
    toast.success("Hämtning startad");
    setTimeout(refresh, 800);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Datakällor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live-status för alla anslutningar och vald data per projekt. Klicka <strong>Hämta nytt</strong> för
            att tvinga färsk hämtning, eller <strong>Koppla om Google</strong> för att förnya behörigheter.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Uppdatera status
          </Button>
          <Button size="sm" onClick={handleReconnect} disabled={reconnecting}>
            <Link2 className="h-4 w-4 mr-2" />
            {reconnecting ? "Startar OAuth…" : "Koppla om alla Google-tjänster"}
          </Button>
        </div>
      </div>

      {data && !data.google_connected && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Google är inte ansluten</p>
              <p className="text-muted-foreground">
                Anslut ditt Google-konto för att ge åtkomst till GA4, Search Console och Google Ads.
              </p>
            </div>
            <Button size="sm" className="ml-auto" onClick={handleReconnect}>Anslut Google</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {(data?.sources ?? []).map((s) => (
          <SourceCard key={s.source} info={s} onRefresh={() => handleForceRefresh(s.source)} onReconnect={handleReconnect} />
        ))}
        {!data && loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

function SourceCard({ info, onRefresh, onReconnect }: { info: SourceInfo; onRefresh: () => void; onReconnect: () => void }) {
  const needsReconnect = info.status === "reauth_required" || info.status === "not_connected";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-3 text-base font-medium">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT[info.status]}`} />
            {LABEL[info.source] || info.source}
          </CardTitle>
          <Badge variant="outline" className="text-xs">{STATUS_LABEL[info.status] || info.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid sm:grid-cols-2 gap-2 text-muted-foreground">
          <div>
            <span className="text-xs uppercase tracking-wide">{info.selection.label}</span>
            <p className="text-foreground">{info.selection.name || info.selection.id || "Inget valt"}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide">Senast hämtad</span>
            <p className="text-foreground">{ageText(info.age_seconds)} · cache {Math.round(info.ttl_seconds / 60)} min</p>
          </div>
        </div>
        {info.reason && info.status !== "ok" && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">{info.reason}</p>
        )}
        {info.last_error && (
          <p className="text-xs text-destructive border-l-2 border-destructive/40 pl-3 break-all">{info.last_error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={needsReconnect}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Hämta nytt
          </Button>
          {needsReconnect && (
            <Button size="sm" onClick={onReconnect}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" /> Koppla om Google
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
