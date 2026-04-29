import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Sparkles } from "lucide-react";

export default function WorkspaceKeywordUniverse() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("analyses")
        .select("id, created_at, universe_scale, keyword_universe_json")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      setAnalyses(data || []);
      setLoading(false);
    })();
  }, [id]);

  const latest = analyses[0];
  const universe = latest?.keyword_universe_json as any;
  const clusters: any[] = universe?.clusters || [];
  const totalKeywords = clusters.reduce((s, c) => s + (c.keywords?.length || 0), 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <Search className="h-7 w-7 text-primary" /> Sökordsuniversum
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-genererat universum av kluster och sökord från senaste analysen.
          </p>
        </div>
        {latest && (
          <Button onClick={() => navigate(`/project/${id}/results/universe`)} className="gap-2">
            Öppna full vy <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Laddar…</CardContent></Card>
      ) : !latest ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Sparkles className="h-8 w-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Ingen analys körd ännu för den här kunden.</p>
            <Button onClick={() => navigate(`/project/${id}`)}>Kör första analysen</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Kluster" value={clusters.length} />
            <StatCard label="Sökord totalt" value={totalKeywords} />
            <StatCard label="Skala" value={latest.universe_scale || "—"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Kluster ({clusters.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {clusters.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Inga kluster i senaste analysen.</p>
              )}
              {clusters.slice(0, 30).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || c.cluster || `Kluster ${i + 1}`}</div>
                    {c.intent && <div className="text-xs text-muted-foreground">{c.intent}</div>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{c.keywords?.length || 0} ord</Badge>
                </div>
              ))}
              {clusters.length > 30 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  +{clusters.length - 30} kluster till — öppna full vy för detaljer.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-4 rounded-lg border border-border">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="font-serif text-3xl mt-1">{typeof value === "number" ? value.toLocaleString("sv-SE") : value}</div>
    </div>
  );
}
