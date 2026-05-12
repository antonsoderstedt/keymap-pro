import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Sparkles, Rocket, Download, ListPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Source = "analysis" | "prelaunch";

interface UniverseData {
  source: Source;
  scale?: string | null;
  clusters: { name: string; intent?: string; keywords: any[] }[];
  flatKeywords: any[];
  totalKeywords: number;
  sourceId: string;
  createdAt: string;
}

interface Progress {
  stage: string;
  count: number;
  total?: number;
  scale?: string;
  error?: string;
}

export default function WorkspaceKeywordUniverse() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<UniverseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      const [analysisRes, prelaunchRes] = await Promise.all([
        supabase.from("analyses")
          .select("id, created_at, universe_scale, keyword_universe_json, universe_progress")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("prelaunch_blueprints")
          .select("id, created_at, keyword_universe")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const analysis = analysisRes.data as any;
      const prelaunch = prelaunchRes.data;

      // Show progress if a background universe job is running on the latest analysis
      const prog = analysis?.universe_progress as Progress | null | undefined;
      const isRunning = prog && prog.stage && !["done", "error"].includes(prog.stage) && !analysis?.keyword_universe_json;
      setProgress(isRunning ? prog : null);

      let chosen: UniverseData | null = null;

      if (analysis?.keyword_universe_json && (!prelaunch || new Date(analysis.created_at) >= new Date(prelaunch.created_at))) {
        const u: any = analysis.keyword_universe_json || {};
        const flat = u.keywords || [];
        // Build clusters from flat list (universe stores keywords flat)
        let clusters = u.clusters as any[] | undefined;
        if (!clusters) {
          const map = new Map<string, any[]>();
          for (const kw of flat) {
            const key = kw.cluster || "Övrigt";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(kw);
          }
          clusters = Array.from(map.entries()).map(([name, keywords]) => ({
            name, intent: keywords[0]?.intent, keywords,
          }));
        }
        chosen = {
          source: "analysis",
          scale: analysis.universe_scale,
          clusters,
          flatKeywords: flat,
          totalKeywords: u.totalKeywords ?? flat.length,
          sourceId: analysis.id,
          createdAt: analysis.created_at,
        };
      } else if (prelaunch) {
        const u: any = prelaunch.keyword_universe || {};
        const flat = u.keywords || [];
        const map = new Map<string, any[]>();
        for (const kw of flat) {
          const key = kw.cluster || "Övrigt";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(kw);
        }
        const clusters = Array.from(map.entries()).map(([name, keywords]) => ({
          name, intent: keywords[0]?.intent, keywords,
        }));
        chosen = {
          source: "prelaunch",
          scale: "pre-launch",
          clusters,
          flatKeywords: flat,
          totalKeywords: flat.length,
          sourceId: prelaunch.id,
          createdAt: prelaunch.created_at,
        };
      }

      setData(chosen);
      setLoading(false);
    };

    load();
    // Poll every 5s while a background job appears to be running
    const interval = setInterval(() => {
      if (!cancelled) load();
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  function exportCsv() {
    if (!data) return;
    const header = ["keyword", "cluster", "intent", "volume", "cpc"];
    const rows = data.flatKeywords.map((k: any) => [
      k.keyword || "",
      k.cluster || "",
      k.intent || "",
      k.volume ?? k.search_volume ?? 0,
      k.cpc ?? k.cpc_sek ?? "",
    ]);
    const csv = [header, ...rows]
      .map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sokord-universum.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function pushClusterToActions(cluster: { name: string; keywords: any[] }) {
    if (!id) return;
    const totalVol = cluster.keywords.reduce((s, k: any) => s + (k.volume ?? k.search_volume ?? 0), 0);
    try {
      const { error } = await supabase.from("action_items").insert({
        project_id: id,
        title: `Bygg innehåll för kluster: ${cluster.name}`,
        description: `${cluster.keywords.length} sökord, total månadsvolym ${totalVol}. Sökord: ${cluster.keywords.slice(0, 8).map((k: any) => k.keyword).join(", ")}${cluster.keywords.length > 8 ? "…" : ""}`,
        category: "content",
        priority: totalVol > 500 ? "high" : "medium",
        source_type: "keyword_universe",
        source_payload: { cluster: cluster.name, keywords: cluster.keywords.map((k: any) => k.keyword) },
      });
      if (error) throw error;
      toast({ title: "Tillagd i Action Tracker", description: `Klustret "${cluster.name}" pushad.` });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <Search className="h-7 w-7 text-primary" /> Sökordsuniversum
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-genererat universum av kluster och sökord — slås samman från analys och pre-launch.
          </p>
        </div>
        {data && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Exportera CSV
            </Button>
            {data.source === "analysis" && (
              <Button onClick={() => navigate(`/project/${id}/results/universe`)} className="gap-2">
                Öppna full vy <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {data.source === "prelaunch" && (
              <Button onClick={() => navigate(`/clients/${id}/prelaunch`)} className="gap-2">
                Öppna Blueprint <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Laddar…</CardContent></Card>
      ) : !data ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Sparkles className="h-8 w-8 text-primary mx-auto" />
            <div>
              <p className="font-medium">Inget sökordsuniversum ännu</p>
              <p className="text-sm text-muted-foreground mt-1">
                Skapa det via en full analys eller en pre-launch blueprint.
              </p>
            </div>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate(`/clients/${id}/prelaunch`)} className="gap-2">
                <Rocket className="h-4 w-4" /> Pre-launch (snabbt)
              </Button>
              <Button onClick={() => navigate(`/project/${id}`)}>
                Kör full analys
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Kluster" value={data.clusters.length} />
            <StatCard label="Sökord totalt" value={data.totalKeywords} />
            <StatCard label="Källa" value={data.source === "analysis" ? "Full analys" : "Pre-launch"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Kluster ({data.clusters.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.clusters.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Inga kluster hittade.</p>
              )}
              {data.clusters.slice(0, 50).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border hover:border-primary/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || `Kluster ${i + 1}`}</div>
                    {c.intent && <div className="text-xs text-muted-foreground">{c.intent}</div>}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{c.keywords?.length || 0} ord</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => pushClusterToActions(c)}
                    title="Skapa action item för klustret"
                  >
                    <ListPlus className="h-3.5 w-3.5" /> Till åtgärder
                  </Button>
                </div>
              ))}
              {data.clusters.length > 50 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  +{data.clusters.length - 50} kluster till — använd "Öppna full vy".
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
