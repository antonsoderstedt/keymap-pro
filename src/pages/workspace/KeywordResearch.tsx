/* eslint-disable @typescript-eslint/no-explicit-any */
// KeywordResearch — fristående research-verktyg.
// Användaren matar in sökord eller URL, kör keyword-research-expand och
// får en lista berikad med scoring + alla anslutna källor. Valda rader
// sparas till keyword_scores som source='manual_research'.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, Loader2, Sparkles, ArrowRight, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, toCsv } from "@/lib/csv";

type ResearchRow = {
  keyword: string;
  research_relevance: number;
  intent_class: "kop" | "jamforelse" | "retention" | "problem" | string;
  channel: string;
  dimension: string;
  volume: number;
  cpc: number | null;
  kd: number | null;
  monthly_value_sek: number;
  kundfit: number;
  confidence: number;
  score: number;
  sources?: string[];
};

type ProjectContext = {
  company: string | null;
  sni_code: string | null;
  sni_text: string | null;
};

const INTENT_LABELS: Record<string, string> = {
  kop: "Köp",
  jamforelse: "Jämförelse",
  retention: "Retention",
  problem: "Problem",
};

function fmtMoney(v: number, currency = "SEK") {
  return `${Math.round(v).toLocaleString("sv-SE")} ${currency}`;
}

function fmtNum(v: number | null | undefined) {
  if (v == null) return "-";
  return Number(v).toLocaleString("sv-SE");
}

export default function KeywordResearch() {
  const { id } = useParams<{ id: string }>();

  const [mode, setMode] = useState<"keyword" | "url">("keyword");
  const [seed, setSeed] = useState("");
  const [depth, setDepth] = useState<"quick" | "full">("quick");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<ResearchRow[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectContext>({ company: null, sni_code: null, sni_text: null });

  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [dimensionFilter, setDimensionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveChannel, setSaveChannel] = useState<"seo" | "ads" | "both">("seo");
  const [saving, setSaving] = useState(false);

  // Load project context
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("projects")
        .select("company, sni_code, sni_text")
        .eq("id", id)
        .maybeSingle();
      if (data) setProject(data as ProjectContext);
    })();
  }, [id]);

  // Load latest session results
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("keyword_research_sessions")
        .select("results, seed, mode, depth, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.results) {
        setRows(data.results as ResearchRow[]);
        setSeed(data.seed || "");
        setMode((data.mode as any) || "keyword");
        setDepth((data.depth as any) || "quick");
        setLastRunAt(data.created_at);
      }
    })();
  }, [id]);

  const runAnalysis = async () => {
    if (!id) return;
    if (!seed.trim()) {
      toast.error("Ange ett sökord eller en URL");
      return;
    }
    setRunning(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("keyword-research-expand", {
        body: { project_id: id, seed: seed.trim(), mode, depth },
      });
      if (error) throw error;
      const payload = data as any;
      const rs = (payload?.rows || []) as ResearchRow[];
      setRows(rs);
      setLastRunAt(new Date().toISOString());
      toast.success(`${rs.length} sökord hittade`);
    } catch (e: any) {
      toast.error("Analys misslyckades", { description: e?.message || "Okänt fel" });
    } finally {
      setRunning(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.keyword.toLowerCase().includes(q)) return false;
      if (intentFilter !== "all" && row.intent_class !== intentFilter) return false;
      if (channelFilter !== "all" && row.channel !== channelFilter) return false;
      if (dimensionFilter !== "all" && row.dimension !== dimensionFilter) return false;
      return true;
    });
  }, [rows, search, intentFilter, channelFilter, dimensionFilter]);

  const stats = useMemo(() => {
    const totalVolume = filtered.reduce((s, r) => s + (r.volume || 0), 0);
    const cpcs = filtered.filter((r) => r.cpc != null).map((r) => Number(r.cpc));
    const avgCpc = cpcs.length ? cpcs.reduce((a, b) => a + b, 0) / cpcs.length : 0;
    const value = filtered.reduce((s, r) => s + (r.monthly_value_sek || 0), 0);
    return { count: filtered.length, totalVolume, avgCpc, value };
  }, [filtered]);

  const channels = useMemo(() => Array.from(new Set(rows.map((r) => r.channel).filter(Boolean))), [rows]);
  const dimensions = useMemo(() => Array.from(new Set(rows.map((r) => r.dimension).filter(Boolean))), [rows]);

  const toggleRow = (keyword: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.keyword)));
  };

  const saveSelected = async () => {
    if (!id || selected.size === 0) return;
    setSaving(true);
    try {
      const toSave = rows.filter((r) => selected.has(r.keyword));
      const payload = toSave.map((r) => ({
        project_id: id,
        keyword: r.keyword,
        score: r.score || r.research_relevance,
        confidence: r.confidence,
        kundfit: r.kundfit,
        dimension: r.dimension,
        intent_class: r.intent_class,
        volume: r.volume,
        cpc: r.cpc,
        kd: r.kd,
        monthly_value_sek: r.monthly_value_sek,
        sources: r.sources || [],
        source: "manual_research",
        insufficient_data: false,
        scored_at: new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from("keyword_scores")
        .upsert(payload, { onConflict: "project_id,keyword" });
      if (error) throw error;
      toast.success(`${toSave.length} sökord sparade till projekt (${saveChannel === "seo" ? "SEO" : saveChannel === "ads" ? "Google Ads" : "Båda"})`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error("Kunde inte spara", { description: e?.message || "Okänt fel" });
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Inget att exportera");
      return;
    }
    const csv = toCsv(
      filtered.map((r) => ({
        keyword: r.keyword,
        relevans: Math.round(r.research_relevance),
        intent: INTENT_LABELS[r.intent_class] || r.intent_class,
        kanal: r.channel,
        dimension: r.dimension,
        volym: r.volume,
        cpc: r.cpc ?? "",
        kd: r.kd ?? "",
        affarsvarde_sek: Math.round(r.monthly_value_sek || 0),
        kundfit: Math.round(r.kundfit || 0),
        konfidens: Math.round(r.confidence || 0),
      })),
    );
    downloadCsv(`keyword-research-${seed.replace(/\s+/g, "-")}-${Date.now()}.csv`, csv);
  };

  const sniLabel = project.sni_code
    ? `SNI ${project.sni_code}${project.sni_text ? ` · ${project.sni_text}` : ""}`
    : "SNI saknas";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Keyword Research</h1>
        <p className="text-sm text-muted-foreground">
          Mata in ett sökord eller en URL — verktyget expanderar med Keyword Planner och berikar
          med alla anslutna datakällor + kundens SNI-profil.
        </p>
      </div>

      {/* INPUT SECTION */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "keyword" | "url")}>
            <TabsList>
              <TabsTrigger value="keyword">Sökord</TabsTrigger>
              <TabsTrigger value="url">URL</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <Input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder={mode === "url" ? "https://exempel.se" : "t.ex. plåtbearbetning rostfritt"}
              className="h-11 text-base"
              disabled={running}
              onKeyDown={(e) => { if (e.key === "Enter" && !running) runAnalysis(); }}
            />
            <Select value={depth} onValueChange={(v) => setDepth(v as "quick" | "full")} disabled={running}>
              <SelectTrigger className="w-[140px] h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">Snabb (50)</SelectItem>
                <SelectItem value="full">Full (500)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={runAnalysis} disabled={running} className="h-11">
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Analysera
            </Button>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Analyserar för: <span className="font-medium text-foreground">{project.company || "Okänt företag"}</span>
            <span className="text-muted-foreground">·</span>
            <span>{sniLabel}</span>
            {lastRunAt && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>Senast: {new Date(lastRunAt).toLocaleString("sv-SE")}</span>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* STATS CARDS */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Antal sökord" value={stats.count.toLocaleString("sv-SE")} />
          <StatCard label="Total volym/mån" value={stats.totalVolume.toLocaleString("sv-SE")} />
          <StatCard label="Snitt CPC" value={stats.avgCpc > 0 ? `${stats.avgCpc.toFixed(2)} kr` : "-"} />
          <StatCard label="Affärsvärde/mån" value={fmtMoney(stats.value)} />
        </div>
      )}

      {/* RESULTS */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <CardTitle className="text-base">Resultat</CardTitle>
                <CardDescription>
                  {filtered.length} av {rows.length} sökord ({INTENT_LABELS[mode === "url" ? "" : ""] || ""}{depth === "quick" ? "Snabb" : "Full"})
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrera"
                    className="pl-8 h-9 w-[180px]"
                  />
                </div>
                <Select value={intentFilter} onValueChange={setIntentFilter}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Intent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla intent</SelectItem>
                    <SelectItem value="kop">Köp</SelectItem>
                    <SelectItem value="jamforelse">Jämförelse</SelectItem>
                    <SelectItem value="retention">Retention</SelectItem>
                    <SelectItem value="problem">Problem</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Kanal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla kanaler</SelectItem>
                    {channels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={dimensionFilter} onValueChange={setDimensionFilter}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Dimension" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla dimensioner</SelectItem>
                    {dimensions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border border-border/70 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Sökord</TableHead>
                    <TableHead className="w-[140px]">Relevans</TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead className="text-right">Volym</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">KD</TableHead>
                    <TableHead className="text-right">Affärsvärde</TableHead>
                    <TableHead className="text-right">Åtgärd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 500).map((row) => {
                    const isChecked = selected.has(row.keyword);
                    return (
                      <TableRow key={row.keyword} className={isChecked ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleRow(row.keyword)} />
                        </TableCell>
                        <TableCell className="font-medium">{row.keyword}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(100, row.research_relevance)} className="h-1.5 w-[60px]" />
                            <span className="text-xs tabular-nums">{Math.round(row.research_relevance)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {INTENT_LABELS[row.intent_class] || row.intent_class}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{row.channel}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(row.volume)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.cpc != null ? `${Number(row.cpc).toFixed(2)} kr` : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.kd != null ? Math.round(row.kd) : "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(row.monthly_value_sek || 0)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => toggleRow(row.keyword)}
                          >
                            {isChecked ? "Vald" : "Välj"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 && !running && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Ange ett sökord eller en URL och klicka "Analysera" för att börja.
          </CardContent>
        </Card>
      )}

      {/* STICKY SAVE BAR */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 shadow-lg rounded-lg border border-border bg-background px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">{selected.size} sökord valda</span>
          <Select value={saveChannel} onValueChange={(v) => setSaveChannel(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seo">Som SEO</SelectItem>
              <SelectItem value="ads">Som Google Ads</SelectItem>
              <SelectItem value="both">Båda</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={saveSelected} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1.5" />}
            Lägg till i projekt
          </Button>
          {id && (
            <Link to={`/workspace/${id}/keywords`} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
              Visa i Sökord →
            </Link>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Avbryt</Button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
