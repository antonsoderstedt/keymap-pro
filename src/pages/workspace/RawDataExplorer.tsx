import { useMemo, useState } from "react";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toCsv, downloadCsv } from "@/lib/csv";

type Source = "ads" | "ga4" | "gsc" | "keyword_planner" | "dataforseo" | "semrush";

type Row = {
  id: string;
  source: Source;
  entity: string;
  metric: string;
  value: string;
  observedAt: string;
  payload?: Record<string, any>;
};

export default function RawDataExplorer() {
  const { workspace } = useWorkspace();
  const [source, setSource] = useState<Source | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsRaw, setRowsRaw] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const pageSize = 4;

  const toNum = (v: any) => (typeof v === "number" ? v : Number(v || 0));

  const loadRows = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const results: Row[] = [];
      const loadAds = async () => {
        const { data } = await supabase
          .from("ads_mutations")
          .select("id,action_type,status,created_at,payload")
          .eq("project_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(150);
        for (const row of data || []) {
          results.push({
            id: `ads-${row.id}`,
            source: "ads",
            entity: `Mutation: ${row.action_type}`,
            metric: "status",
            value: row.status,
            observedAt: row.created_at,
            payload: (row.payload as Record<string, any>) || {},
          });
        }
      };

      const loadGa4 = async () => {
        const { data } = await supabase
          .from("ga4_snapshots")
          .select("id,created_at,rows")
          .eq("project_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const rows = ((data?.rows as any[]) || []).slice(0, 200);
        rows.forEach((r, idx) => {
          results.push({
            id: `ga4-${data?.id || "snapshot"}-${idx}`,
            source: "ga4",
            entity: `Page: ${r.page || r.pagePath || r.sessionDefaultChannelGroup || "n/a"}`,
            metric: r.sessions != null ? "sessions" : "value",
            value: String(toNum(r.sessions || r.totalUsers || r.conversions || 0).toLocaleString("sv-SE")),
            observedAt: data?.created_at || new Date().toISOString(),
            payload: r,
          });
        });
      };

      const loadGsc = async () => {
        const { data } = await supabase
          .from("gsc_snapshots")
          .select("id,created_at,rows")
          .eq("project_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const rows = ((data?.rows as any[]) || []).slice(0, 200);
        rows.forEach((r, idx) => {
          const entity = r.query ? `Query: ${r.query}` : r.page ? `Page: ${r.page}` : "GSC row";
          results.push({
            id: `gsc-${data?.id || "snapshot"}-${idx}`,
            source: "gsc",
            entity,
            metric: "clicks",
            value: String(toNum(r.clicks).toLocaleString("sv-SE")),
            observedAt: data?.created_at || new Date().toISOString(),
            payload: r,
          });
        });
      };

      const loadDataForSeo = async () => {
        const { data } = await supabase
          .from("keyword_metrics")
          .select("keyword,search_volume,cpc_sek,competition,updated_at")
          .order("updated_at", { ascending: false })
          .limit(250);
        for (const r of data || []) {
          results.push({
            id: `dfs-${r.keyword}-${r.updated_at}`,
            source: "dataforseo",
            entity: `Keyword: ${r.keyword}`,
            metric: "search_volume",
            value: String(toNum(r.search_volume).toLocaleString("sv-SE")),
            observedAt: r.updated_at,
            payload: r as unknown as Record<string, any>,
          });
        }
      };

      const loadKeywordPlanner = async () => {
        const { data } = await supabase
          .from("keyword_planner_ideas")
          .select("id,keyword,avg_monthly_searches,competition,competition_index,fetched_at,seed_keyword,seed_url")
          .eq("project_id", workspace.id)
          .order("fetched_at", { ascending: false })
          .limit(250);
        for (const r of data || []) {
          results.push({
            id: `kpi-${r.id}`,
            source: "keyword_planner",
            entity: `Keyword: ${r.keyword}`,
            metric: "avg_monthly_searches",
            value: r.avg_monthly_searches == null ? "-" : String(toNum(r.avg_monthly_searches).toLocaleString("sv-SE")),
            observedAt: r.fetched_at,
            payload: r as unknown as Record<string, any>,
          });
        }
      };

      const loadSemrush = async () => {
        const { data } = await supabase
          .from("semrush_metrics")
          .select("keyword,kd,updated_at,serp_features,top_domains")
          .order("updated_at", { ascending: false })
          .limit(250);
        for (const r of data || []) {
          results.push({
            id: `sem-${r.keyword}-${r.updated_at}`,
            source: "semrush",
            entity: `Keyword: ${r.keyword}`,
            metric: "kd",
            value: r.kd == null ? "-" : String(Math.round(r.kd)),
            observedAt: r.updated_at,
            payload: r as unknown as Record<string, any>,
          });
        }
      };

      if (source === "all" || source === "ads") await loadAds();
      if (source === "all" || source === "ga4") await loadGa4();
      if (source === "all" || source === "gsc") await loadGsc();
      if (source === "all" || source === "keyword_planner") await loadKeywordPlanner();
      if (source === "all" || source === "dataforseo") await loadDataForSeo();
      if (source === "all" || source === "semrush") await loadSemrush();

      setRowsRaw(results);
      if (!results.length) setSelected(null);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte hamta kalldata");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadRows();
  }, [workspace?.id, source]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rowsRaw.filter((row) => {
      if (!q) return true;
      return [row.entity, row.metric, row.value, row.source].join(" ").toLowerCase().includes(q);
    });
  }, [rowsRaw, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Kalldata</h1>
        <p className="text-sm text-muted-foreground">
          Filtrera och exportera radniva-data per kalla nar du vill validera slutsatser bortom standardrapporter.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter och scope</CardTitle>
          <CardDescription>Valj kalla, sok pa entitet och exportera aktuellt urval.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <Select value={source} onValueChange={(v) => { setSource(v as Source | "all"); setPage(1); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kallor</SelectItem>
              <SelectItem value="ads">Google Ads</SelectItem>
              <SelectItem value="ga4">GA4</SelectItem>
              <SelectItem value="gsc">GSC</SelectItem>
              <SelectItem value="keyword_planner">Keyword Planner</SelectItem>
              <SelectItem value="dataforseo">DataForSEO</SelectItem>
              <SelectItem value="semrush">Semrush</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Sok pa kampanj, query, sida eller metric"
          />

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Fler filter
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const csv = toCsv(filtered.map((r) => ({
                  source: r.source,
                  entity: r.entity,
                  metric: r.metric,
                  value: r.value,
                  observed_at: r.observedAt,
                })));
                downloadCsv(`raw-data-${source}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export raw rows
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Rows: {filtered.length}</Badge>
        <Badge variant="outline">Coverage: synced fields</Badge>
        <Badge variant="outline">Freshness: {loading ? "loading" : "latest snapshot"}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kalla</TableHead>
                <TableHead>Entitet</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Varde</TableHead>
                <TableHead>Observerad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} onClick={() => setSelected(row)} className="cursor-pointer">
                  <TableCell className="capitalize">{row.source}</TableCell>
                  <TableCell>{row.entity}</TableCell>
                  <TableCell>{row.metric}</TableCell>
                  <TableCell>{row.value}</TableCell>
                  <TableCell>{new Date(row.observedAt).toLocaleDateString("sv-SE")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Sida {safePage} av {totalPages}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                Forra
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Nasta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raddetalj</CardTitle>
            <CardDescription>{selected.entity}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
              {JSON.stringify(selected.payload || {}, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
