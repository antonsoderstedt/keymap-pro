import { useMemo, useState } from "react";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";

type LookupResult = {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  kd: number | null;
  competition: number | null;
  trend: string;
  serp: string;
  updatedAt: string | null;
  source: "cache" | "live";
};

export default function DataForSeoWorkbench() {
  const [keyword, setKeyword] = useState("");
  const [batchValue, setBatchValue] = useState("stambyte pris\nrormokare sodermalm");
  const [single, setSingle] = useState<LookupResult | null>(null);
  const [batchRows, setBatchRows] = useState<LookupResult[]>([]);
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);

  const defaultKeyword = "rormokare stockholm";

  const activeKeyword = useMemo(() => keyword.trim() || defaultKeyword, [keyword]);

  const lookupKeyword = async (kw: string): Promise<LookupResult | null> => {
    const trimmed = kw.trim().toLowerCase();
    if (!trimmed) return null;

    const [kmRes, smRes, serpRes] = await Promise.all([
      supabase
        .from("keyword_metrics")
        .select("keyword,search_volume,cpc_sek,competition,trend_json,updated_at")
        .ilike("keyword", trimmed)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("semrush_metrics")
        .select("keyword,kd,serp_features,top_domains,updated_at")
        .ilike("keyword", trimmed)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("keyword_serp_cache")
        .select("keyword,result_json,fetched_at")
        .ilike("keyword", trimmed)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (kmRes.error || smRes.error || serpRes.error) {
      throw new Error(kmRes.error?.message || smRes.error?.message || serpRes.error?.message || "lookup failed");
    }
    if (!kmRes.data && !smRes.data && !serpRes.data) return null;

    const trendJson = (kmRes.data?.trend_json as any) || null;
    const trend = trendJson ? "Trend tillganglig" : "Ingen trenddata";

    let serp = "Ingen SERP-cache";
    const serpPayload = (serpRes.data?.result_json as any) || null;
    if (serpPayload?.features?.length) serp = serpPayload.features.slice(0, 4).join(", ");
    else if ((smRes.data?.serp_features as any[])?.length) serp = (smRes.data?.serp_features as any[]).slice(0, 4).join(", ");

    return {
      keyword: (kmRes.data?.keyword || smRes.data?.keyword || serpRes.data?.keyword || trimmed) as string,
      volume: kmRes.data?.search_volume ?? null,
      cpc: kmRes.data?.cpc_sek ?? null,
      kd: smRes.data?.kd ?? null,
      competition: kmRes.data?.competition ?? null,
      trend,
      serp,
      updatedAt: kmRes.data?.updated_at || smRes.data?.updated_at || serpRes.data?.fetched_at || null,
      source: serpRes.data ? "cache" : "live",
    };
  };

  const runSingleLookup = async () => {
    setLoadingSingle(true);
    try {
      const data = await lookupKeyword(activeKeyword);
      setSingle(data);
      if (!data) toast.error("Inga data hittades for sokordet");
    } catch (e: any) {
      toast.error(e?.message || "Lookup misslyckades");
    } finally {
      setLoadingSingle(false);
    }
  };

  const runBatchLookup = async () => {
    const keywords = batchValue
      .split("\n")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100);
    if (!keywords.length) {
      toast.error("Lagg till minst ett sokord i batch-listan");
      return;
    }
    setLoadingBatch(true);
    try {
      const [kmRes, smRes] = await Promise.all([
        supabase
          .from("keyword_metrics")
          .select("keyword,search_volume,cpc_sek,competition,updated_at")
          .in("keyword", keywords),
        supabase
          .from("semrush_metrics")
          .select("keyword,kd,updated_at")
          .in("keyword", keywords),
      ]);
      if (kmRes.error || smRes.error) {
        throw new Error(kmRes.error?.message || smRes.error?.message || "batch failed");
      }
      const smByKeyword = new Map(((smRes.data || []) as any[]).map((r) => [r.keyword.toLowerCase(), r]));
      const rows: LookupResult[] = (kmRes.data || []).map((r) => {
        const sm = smByKeyword.get(r.keyword.toLowerCase());
        return {
          keyword: r.keyword,
          volume: r.search_volume,
          cpc: r.cpc_sek,
          kd: sm?.kd ?? null,
          competition: r.competition,
          trend: "Trend tillganglig via trend_json",
          serp: "SERP se single lookup",
          updatedAt: r.updated_at || sm?.updated_at || null,
          source: "cache",
        };
      });
      setBatchRows(rows);
      if (!rows.length) toast.error("Inga batch-traffar hittades i lagrade metrics");
      else toast.success(`Batch klar: ${rows.length} sokord`);
    } catch (e: any) {
      toast.error(e?.message || "Batch misslyckades");
    } finally {
      setLoadingBatch(false);
    }
  };

  useEffect(() => {
    runSingleLookup();
  }, []);

  const current = single || {
    keyword: activeKeyword,
    volume: null,
    cpc: null,
    kd: null,
    competition: null,
    trend: "Ingen trenddata",
    serp: "Ingen SERP-cache",
    updatedAt: null,
    source: "cache" as const,
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">DataForSEO</h1>
        <p className="text-sm text-muted-foreground">
          Gor manuell lookup for enskilda sokord eller batch-berikning med exportbar output.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Single lookup</CardTitle>
          <CardDescription>Skriv in ett sokord och hamta volym, CPC, KD, trend och SERP-insikter.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Ange sokord"
            className="max-w-lg"
          />
          <Button onClick={runSingleLookup} disabled={loadingSingle}>
            <Search className="mr-2 h-4 w-4" />
            {loadingSingle ? "Lookup..." : "Lookup"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const csv = toCsv([current]);
              downloadCsv(`dataforseo-single-${current.keyword.replace(/\s+/g, "-")}.csv`, csv);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultat: {current.keyword}</CardTitle>
          <CardDescription>
            <Badge variant="outline" className="mr-2">{current.source}</Badge>
            <Badge variant="outline">senast uppdaterad: {current.updatedAt ? new Date(current.updatedAt).toLocaleString("sv-SE") : "okand"}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="volume" className="space-y-4">
            <TabsList>
              <TabsTrigger value="volume">Volym</TabsTrigger>
              <TabsTrigger value="trend">Trend</TabsTrigger>
              <TabsTrigger value="serp">SERP</TabsTrigger>
              <TabsTrigger value="kd">KD</TabsTrigger>
              <TabsTrigger value="competition">Konkurrens</TabsTrigger>
            </TabsList>

            <TabsContent value="volume" className="text-sm">
              Sokkvolym: <strong>{current.volume == null ? "-" : current.volume.toLocaleString("sv-SE")}</strong> / manad
            </TabsContent>
            <TabsContent value="trend" className="text-sm">Trend: <strong>{current.trend}</strong></TabsContent>
            <TabsContent value="serp" className="text-sm">SERP: <strong>{current.serp}</strong></TabsContent>
            <TabsContent value="kd" className="text-sm">Keyword difficulty: <strong>{current.kd == null ? "-" : Math.round(current.kd)}</strong></TabsContent>
            <TabsContent value="competition" className="text-sm">Konkurrens: <strong>{current.competition == null ? "-" : current.competition.toFixed(2)}</strong>, CPC: <strong>{current.cpc == null ? "-" : current.cpc.toFixed(2)} SEK</strong></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch lookup</CardTitle>
          <CardDescription>Klistra in ett sokord per rad for bulk-berikning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={batchValue}
            onChange={(e) => setBatchValue(e.target.value)}
            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={runBatchLookup} disabled={loadingBatch}>{loadingBatch ? "Kor..." : "Kor batch"}</Button>
            <Button
              variant="outline"
              disabled={!batchRows.length}
              onClick={() => {
                const csv = toCsv(batchRows);
                downloadCsv(`dataforseo-batch-${new Date().toISOString().slice(0, 10)}.csv`, csv);
              }}
            >
              Export batch-resultat
            </Button>
          </div>
          {!!batchRows.length && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium mb-1">Batch-traffar: {batchRows.length}</p>
              <ul className="space-y-1 text-muted-foreground">
                {batchRows.slice(0, 8).map((r) => (
                  <li key={r.keyword}>• {r.keyword} · volym {r.volume ?? "-"} · KD {r.kd == null ? "-" : Math.round(r.kd)}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
