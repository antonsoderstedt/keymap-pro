import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { toCsv, downloadCsv } from "@/lib/csv";

type CapabilityState = "connected" | "stale" | "unavailable";

type SemrushRow = {
  keyword: string;
  kd: number | null;
  updated_at: string;
  serp_features: string[] | null;
  top_domains: string[] | null;
};

export default function SemrushWorkbench() {
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SemrushRow[]>([]);
  const [gapKeywords, setGapKeywords] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const [semrushRes, sovRes, analysisRes] = await Promise.all([
        supabase
          .from("semrush_metrics")
          .select("keyword,kd,updated_at,serp_features,top_domains")
          .order("updated_at", { ascending: false })
          .limit(400),
        supabase
          .from("share_of_voice_snapshots")
          .select("competitors,created_at")
          .eq("project_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("analyses")
          .select("keyword_universe_json,created_at")
          .eq("project_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (semrushRes.error || sovRes.error || analysisRes.error) {
        throw new Error(semrushRes.error?.message || sovRes.error?.message || analysisRes.error?.message || "load failed");
      }
      const sem = (semrushRes.data || []) as any[];
      setRows(sem.map((r) => ({
        keyword: r.keyword,
        kd: r.kd,
        updated_at: r.updated_at,
        serp_features: (r.serp_features as string[]) || null,
        top_domains: (r.top_domains as string[]) || null,
      })));
      setCompetitors(((sovRes.data?.competitors as any[]) || []).slice(0, 20));

      const universe = (analysisRes.data?.keyword_universe_json as any) || {};
      const gaps = (universe.gap_keywords || universe.content_gaps || []).slice(0, 200);
      setGapKeywords(gaps);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte hamta Semrush-data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspace?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.keyword.toLowerCase().includes(q));
  }, [rows, query]);

  const capabilities = useMemo<Record<string, CapabilityState>>(() => {
    const now = Date.now();
    const latestSemrush = rows[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    const semrushState: CapabilityState = rows.length === 0 ? "unavailable" : now - latestSemrush > 14 * 24 * 3600 * 1000 ? "stale" : "connected";
    return {
      "Keyword Gap": gapKeywords.length ? "connected" : "stale",
      Competitors: competitors.length ? "connected" : "stale",
      "Top Pages": semrushState,
      Visibility: semrushState,
      Backlinks: "unavailable",
      Changes: semrushState,
    };
  }, [rows, competitors, gapKeywords]);

  const exportRows = (name: string, data: any[]) => {
    const csv = toCsv(data);
    downloadCsv(`semrush-${name}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const avgKd = filtered.length
    ? filtered.reduce((sum, r) => sum + (r.kd || 0), 0) / filtered.length
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Semrush</h1>
        <p className="text-sm text-muted-foreground">
          Arbeta med de Semrush-delar som ger operativt varde utan att spegla hela native-plattformen.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sokyta</CardTitle>
          <CardDescription>Valj doman eller konkurrent och analysera gap, visibility och top pages.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Filtrera sokord, t.ex. stambyte" className="max-w-lg" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button onClick={load} disabled={loading}>{loading ? "Laddar..." : "Analysera"}</Button>
          <Button variant="outline" onClick={() => exportRows("keywords", filtered)} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Keywords</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{filtered.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Snitt KD</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{avgKd ? avgKd.toFixed(1) : "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Gap keywords</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{gapKeywords.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capability matrix</CardTitle>
          <CardDescription>Visar vad som ar anslutet, stale eller otillgangligt i denna integration.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          {Object.entries(capabilities).map(([k, v]) => (
            <Badge key={k} variant={v === "connected" ? "secondary" : "outline"}>{k}: {v}</Badge>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="gap" className="space-y-4">
        <TabsList>
          <TabsTrigger value="gap">Keyword Gap</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="top-pages">Top Pages</TabsTrigger>
          <TabsTrigger value="visibility">Visibility</TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="gap">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Keyword Gap</CardTitle>
              <CardDescription>Sokord konkurrenter rankar for men ni saknar eller underpresterar pa.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {!gapKeywords.length ? (
                <p>Inga gap-keywords hittades i senaste analys.</p>
              ) : (
                <ul className="space-y-1">
                  {gapKeywords.slice(0, 12).map((g: any, idx: number) => (
                    <li key={idx}>• {g.keyword || g.term || "keyword"} {g.volume ? `· volym ${g.volume}` : ""}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="competitors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competitors</CardTitle>
              <CardDescription>Jamnfor synlighet och overlap mot definierade konkurrenter.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {!competitors.length ? (
                <p>Inga konkurrenter hittades i senaste share-of-voice snapshot.</p>
              ) : (
                <ul className="space-y-1">
                  {competitors.slice(0, 10).map((c: any, idx: number) => (
                    <li key={idx}>• {c.domain || c.name || "competitor"} {c.sov_pct ? `· SoV ${c.sov_pct}%` : ""}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top-pages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Pages</CardTitle>
              <CardDescription>Sidor med hogst organisk potential och forandringshastighet.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {filtered.slice(0, 10).map((r) => (
                <p key={`${r.keyword}-tp`}>• {r.keyword} · KD {r.kd == null ? "-" : Math.round(r.kd)}</p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visibility">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visibility</CardTitle>
              <CardDescription>Trend for synlighet och rank-fordelning over tid.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Total synliga keywords i cache: {filtered.length}</p>
              <p>Snitt KD: {avgKd ? avgKd.toFixed(1) : "-"}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backlinks">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backlinks</CardTitle>
              <CardDescription>Authority- och lanksignal om datan ar tillganglig.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Backlinks ar markerat som unavailable i v1-scope tills datakallan ar ansluten.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Changes</CardTitle>
              <CardDescription>Forandringar i ranking, synlighet och gap jamfort med foregaende period.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {filtered.slice(0, 12).map((r) => (
                <p key={`${r.keyword}-chg`}>• {r.keyword} · uppdaterad {new Date(r.updated_at).toLocaleDateString("sv-SE")}</p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
