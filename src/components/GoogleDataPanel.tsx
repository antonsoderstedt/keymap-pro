import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Search, RefreshCw, Download, Save, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GscSite { siteUrl: string; permissionLevel: string }
interface Ga4Property { property: string; displayName: string; parent: string }
interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
interface Ga4Row { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

type Range = "7" | "28" | "90";
const RANGE_LABEL: Record<Range, string> = { "7": "7 dagar", "28": "28 dagar", "90": "90 dagar" };

interface Props {
  projectId?: string; // when set, persists settings + snapshots and enables "import to keywords"
}

function rangeDates(r: Range) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - parseInt(r, 10));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function GoogleDataPanel({ projectId }: Props) {
  const { toast } = useToast();
  const [loadingLists, setLoadingLists] = useState(true);
  const [sites, setSites] = useState<GscSite[]>([]);
  const [properties, setProperties] = useState<Ga4Property[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<string>("");

  const [range, setRange] = useState<Range>("28");
  const [gscLoading, setGscLoading] = useState(false);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [gscRows, setGscRows] = useState<GscRow[]>([]);
  const [ga4Rows, setGa4Rows] = useState<Ga4Row[]>([]);
  const [ga4Totals, setGa4Totals] = useState<{ sessions: number; users: number } | null>(null);

  const [gscFilter, setGscFilter] = useState("");
  const [gscSortKey, setGscSortKey] = useState<keyof GscRow | "query">("clicks");
  const [gscSortDir, setGscSortDir] = useState<"asc" | "desc">("desc");

  const [importing, setImporting] = useState(false);

  useEffect(() => { loadLists(); }, []);

  // Load saved per-project settings
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from("project_google_settings")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data) {
        if ((data as any).gsc_site_url) setSelectedSite((data as any).gsc_site_url);
        if ((data as any).ga4_property_id) setSelectedProperty((data as any).ga4_property_id);
      }
    })();
  }, [projectId]);

  const persistSettings = async (patch: Partial<{ gsc_site_url: string; ga4_property_id: string; ga4_property_name: string }>) => {
    if (!projectId) return;
    await supabase
      .from("project_google_settings")
      .upsert({ project_id: projectId, ...patch }, { onConflict: "project_id" });
  };

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const [gsc, ga4] = await Promise.all([
        supabase.functions.invoke("gsc-fetch", { body: { action: "sites" } }),
        supabase.functions.invoke("ga4-fetch", { body: { action: "properties" } }),
      ]);
      const siteList: GscSite[] = (gsc.data as any)?.siteEntry || [];
      setSites(siteList);
      if (siteList.length && !selectedSite) setSelectedSite(siteList[0].siteUrl);

      const propList: Ga4Property[] = [];
      ((ga4.data as any)?.accountSummaries || []).forEach((acc: any) => {
        (acc.propertySummaries || []).forEach((p: any) => {
          propList.push({ property: p.property, displayName: p.displayName, parent: acc.displayName });
        });
      });
      setProperties(propList);
      if (propList.length && !selectedProperty) setSelectedProperty(propList[0].property);
    } catch (e: any) {
      toast({ title: "Kunde inte hämta listor", description: e.message, variant: "destructive" });
    } finally {
      setLoadingLists(false);
    }
  };

  const fetchGsc = async () => {
    if (!selectedSite) return;
    setGscLoading(true);
    const { startDate, endDate } = rangeDates(range);
    const { data, error } = await supabase.functions.invoke("gsc-fetch", {
      body: { action: "query", siteUrl: selectedSite, startDate, endDate, dimensions: ["query"], rowLimit: 1000 },
    });
    setGscLoading(false);
    if (error) { toast({ title: "GSC-fel", description: error.message, variant: "destructive" }); return; }
    const rows: GscRow[] = (data as any)?.rows || [];
    setGscRows(rows);

    if (projectId && rows.length) {
      const totals = rows.reduce((acc, r) => ({
        clicks: acc.clicks + (r.clicks || 0),
        impressions: acc.impressions + (r.impressions || 0),
      }), { clicks: 0, impressions: 0 });
      await supabase.from("gsc_snapshots").insert({
        project_id: projectId,
        site_url: selectedSite,
        start_date: startDate,
        end_date: endDate,
        rows: rows as any,
        totals: totals as any,
      });
    }
  };

  const fetchGa4 = async () => {
    if (!selectedProperty) return;
    setGa4Loading(true);
    const { startDate, endDate } = rangeDates(range);
    const id = selectedProperty.replace("properties/", "");
    const { data, error } = await supabase.functions.invoke("ga4-fetch", {
      body: {
        action: "report",
        propertyId: id,
        startDate, endDate,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        limit: 365,
      },
    });
    setGa4Loading(false);
    if (error) { toast({ title: "GA4-fel", description: error.message, variant: "destructive" }); return; }
    const rows: Ga4Row[] = (data as any)?.rows || [];
    setGa4Rows(rows);
    const sessions = rows.reduce((s, r) => s + Number(r.metricValues?.[0]?.value || 0), 0);
    const users = rows.reduce((s, r) => s + Number(r.metricValues?.[1]?.value || 0), 0);
    const totals = { sessions, users };
    setGa4Totals(totals);

    if (projectId && rows.length) {
      const propName = properties.find((p) => p.property === selectedProperty)?.displayName;
      await supabase.from("ga4_snapshots").insert({
        project_id: projectId,
        property_id: selectedProperty,
        start_date: startDate,
        end_date: endDate,
        rows: rows as any,
        totals: totals as any,
      });
      await persistSettings({ ga4_property_id: selectedProperty, ga4_property_name: propName });
    }
  };

  const onSelectSite = (v: string) => { setSelectedSite(v); persistSettings({ gsc_site_url: v }); };
  const onSelectProperty = (v: string) => {
    setSelectedProperty(v);
    const name = properties.find((p) => p.property === v)?.displayName;
    persistSettings({ ga4_property_id: v, ga4_property_name: name });
  };

  // Sorted + filtered GSC view
  const sortedGsc = useMemo(() => {
    const f = gscFilter.trim().toLowerCase();
    const filtered = f ? gscRows.filter((r) => (r.keys?.[0] || "").toLowerCase().includes(f)) : gscRows;
    const dir = gscSortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = gscSortKey === "query" ? (a.keys?.[0] || "") : (a as any)[gscSortKey] ?? 0;
      const vb = gscSortKey === "query" ? (b.keys?.[0] || "") : (b as any)[gscSortKey] ?? 0;
      if (typeof va === "string") return va.localeCompare(vb as string) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [gscRows, gscFilter, gscSortKey, gscSortDir]);

  const toggleSort = (k: typeof gscSortKey) => {
    if (gscSortKey === k) setGscSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setGscSortKey(k); setGscSortDir(k === "query" ? "asc" : "desc"); }
  };

  const SortIcon = ({ k }: { k: typeof gscSortKey }) =>
    gscSortKey !== k ? null : gscSortDir === "asc" ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />;

  const exportGscCsv = () => {
    const rows: (string | number)[][] = [["query", "clicks", "impressions", "ctr", "position"]];
    sortedGsc.forEach((r) => rows.push([r.keys?.[0] || "", r.clicks, r.impressions, r.ctr, r.position]));
    downloadCsv(`gsc-${selectedSite.replace(/[^a-z0-9]+/gi, "-")}-${range}d.csv`, rows);
  };

  const exportGa4Csv = () => {
    const rows: (string | number)[][] = [["date", "sessions", "users"]];
    ga4Rows.forEach((r) => {
      const d = r.dimensionValues?.[0]?.value || "";
      const fmt = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
      rows.push([fmt, r.metricValues?.[0]?.value || 0, r.metricValues?.[1]?.value || 0]);
    });
    downloadCsv(`ga4-${range}d.csv`, rows);
  };

  const importToKeywords = async () => {
    if (!projectId || sortedGsc.length === 0) return;
    setImporting(true);
    try {
      const keywords = Array.from(new Set(sortedGsc.map((r) => (r.keys?.[0] || "").trim()).filter(Boolean))).slice(0, 500);
      const { error } = await supabase.functions.invoke("enrich-keywords", { body: { keywords } });
      if (error) throw error;
      toast({ title: "Importerade till sökord", description: `${keywords.length} queries skickades till sökordsdatabasen.` });
    } catch (e: any) {
      toast({ title: "Importfel", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  if (loadingLists) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Hämtar Google-konton…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Period:</span>
        {(["7", "28", "90"] as Range[]).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
            {RANGE_LABEL[r]}
          </Button>
        ))}
        {projectId && <Badge variant="secondary" className="ml-2 gap-1"><Save className="h-3 w-3" /> Sparas på projekt</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* GSC */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <Search className="h-4 w-4" /> Search Console
                </CardTitle>
                <CardDescription>Senaste {RANGE_LABEL[range]} — top queries</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={loadLists}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga sites hittade.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Select value={selectedSite} onValueChange={onSelectSite}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Välj site" /></SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={fetchGsc} disabled={gscLoading || !selectedSite}>
                    {gscLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hämta"}
                  </Button>
                </div>

                {gscRows.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder="Filtrera queries…"
                        value={gscFilter}
                        onChange={(e) => setGscFilter(e.target.value)}
                        className="h-8 flex-1 min-w-[160px] text-xs"
                      />
                      <Button size="sm" variant="outline" onClick={exportGscCsv} className="gap-1">
                        <Download className="h-3 w-3" /> CSV
                      </Button>
                      {projectId && (
                        <Button size="sm" onClick={importToKeywords} disabled={importing} className="gap-1">
                          {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Till sökord
                        </Button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="cursor-pointer p-2 text-left" onClick={() => toggleSort("query")}>Query <SortIcon k="query" /></th>
                            <th className="cursor-pointer p-2 text-right" onClick={() => toggleSort("clicks")}>Klick <SortIcon k="clicks" /></th>
                            <th className="cursor-pointer p-2 text-right" onClick={() => toggleSort("impressions")}>Imp. <SortIcon k="impressions" /></th>
                            <th className="cursor-pointer p-2 text-right" onClick={() => toggleSort("position")}>Pos. <SortIcon k="position" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedGsc.map((r, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="p-2">{r.keys?.[0]}</td>
                              <td className="p-2 text-right">{r.clicks}</td>
                              <td className="p-2 text-right">{r.impressions}</td>
                              <td className="p-2 text-right">{r.position?.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">{sortedGsc.length} av {gscRows.length} queries</p>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* GA4 */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <BarChart3 className="h-4 w-4" /> GA4
                </CardTitle>
                <CardDescription>Senaste {RANGE_LABEL[range]} — sessions & users</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={loadLists}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga GA4-properties hittade.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Select value={selectedProperty} onValueChange={onSelectProperty}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Välj property" /></SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.property} value={p.property}>
                          {p.displayName} <span className="text-muted-foreground">({p.parent})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={fetchGa4} disabled={ga4Loading || !selectedProperty}>
                    {ga4Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hämta"}
                  </Button>
                </div>

                {ga4Totals && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Sessions: {ga4Totals.sessions.toLocaleString("sv-SE")}</Badge>
                    <Badge variant="secondary">Users: {ga4Totals.users.toLocaleString("sv-SE")}</Badge>
                    <Button size="sm" variant="outline" onClick={exportGa4Csv} className="ml-auto gap-1">
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  </div>
                )}

                {ga4Rows.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left">Datum</th>
                          <th className="p-2 text-right">Sessions</th>
                          <th className="p-2 text-right">Users</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ga4Rows.map((r, i) => {
                          const d = r.dimensionValues?.[0]?.value || "";
                          const fmt = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
                          return (
                            <tr key={i} className="border-t border-border">
                              <td className="p-2">{fmt}</td>
                              <td className="p-2 text-right">{r.metricValues?.[0]?.value}</td>
                              <td className="p-2 text-right">{r.metricValues?.[1]?.value}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
