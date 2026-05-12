// Sökord & innehåll Hub — V2
// Migrerar all funktionalitet från /project/:id/results (Results.tsx + KeywordUniverse.tsx)
// in i workspace. 6 tabbar: Översikt / Sökord / Briefs / Strategi / Teknisk SEO / Google Ads-export.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, BarChart3, BookOpen, Target, ShieldCheck, Megaphone,
  Download, RefreshCw, Loader2, Sparkles, FileText, MapPin, Ban,
  Network, FileType, Presentation, LayoutGrid, List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceAnalysis } from "@/hooks/useWorkspaceAnalysis";
import {
  KeywordTable, DIMENSION_LABELS, INTENT_LABELS,
} from "@/components/keywords/KeywordTable";
import { ClusterGrid, type ClusterData } from "@/components/keywords/ClusterGrid";
import { ClusterSheet } from "@/components/keywords/ClusterSheet";
import { OverviewSection } from "@/components/results/sections/OverviewSection";
import { ContentBriefsTab } from "@/components/universe/ContentBriefsTab";
import { TechSeoTab } from "@/components/universe/TechSeoTab";
import { StrategyTab } from "@/components/universe/StrategyTab";
import { ClusterActionsTab } from "@/components/universe/ClusterActionsTab";
import { AdsExportModal } from "@/components/universe/AdsExportModal";
import { SeoDiagnosisPanel } from "@/components/keywords/SeoDiagnosisPanel";
import { useProjectGoals } from "@/hooks/useProjectGoals";
import { monthlyKeywordValue, classifyKeyword } from "@/lib/goalsEngine";
import type { UniverseKeyword, UniverseScale } from "@/lib/types";

type ExportFormat = "pptx" | "pdf";

export default function KeywordsHub() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const data = useWorkspaceAnalysis(id);
  const {
    analysisId, result, universe, universeScale, createdAt, source, pending, loading, error, refetch,
  } = data;

  const [tab, setTab] = useState("overview");
  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [adsModalOpen, setAdsModalOpen] = useState(false);
  const [scale, setScale] = useState<UniverseScale>(
    (universeScale as UniverseScale) || "broad",
  );
  const [universeProgress, setUniverseProgress] = useState<{
    stage: string;
    count: number;
    total?: number;
    scale?: string;
    error?: string;
    updated_at?: string;
  } | null>(null);
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null);

  // Poll universe_progress for background (max/ultra) jobs
  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("analyses")
        .select("universe_progress, keyword_universe_json")
        .eq("id", analysisId)
        .maybeSingle();
      if (cancelled) return;
      const prog = (data as any)?.universe_progress as any;
      const hasUniverse = !!(data as any)?.keyword_universe_json;
      if (prog && prog.stage && !["done"].includes(prog.stage) && !(prog.stage === "error")) {
        setUniverseProgress(prog);
        if (!progressStartedAt) setProgressStartedAt(Date.now());
      } else if (prog?.stage === "error") {
        setUniverseProgress(prog);
      } else {
        if (universeProgress && hasUniverse) {
          // Job finished — refresh data once
          refetch();
        }
        setUniverseProgress(null);
        setProgressStartedAt(null);
      }
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  const isBackgroundRunning = !!universeProgress && universeProgress.stage !== "done" && universeProgress.stage !== "error";

  // ── Filter state (Sökord-tabben) ───────────────────────────────────
  const [search, setSearch] = useState("");
  const [intent, setIntent] = useState("all");
  const [funnel, setFunnel] = useState("all");
  const [dimension, setDimension] = useState("all");
  const [channel, setChannel] = useState("all");
  const [priority, setPriority] = useState("all");
  const [hideZeroVolume, setHideZeroVolume] = useState(true);
  const [onlyReal, setOnlyReal] = useState(false);
  const [onlyGap, setOnlyGap] = useState(false);
  const [maxKd, setMaxKd] = useState("100");

  // ── Vy-växlare + sortering för Universe-tabben ─────────────────────
  const { goals } = useProjectGoals(id);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [clusterSort, setClusterSort] = useState<"value" | "volume" | "gap" | "kd">("value");
  const [clusterSearch, setClusterSearch] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<ClusterData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo<UniverseKeyword[]>(() => {
    if (!universe) return [];
    const kdLimit = Number(maxKd) || 100;
    const q = search.toLowerCase().trim();
    return universe.keywords
      .filter((k) => {
        if (q && !k.keyword.toLowerCase().includes(q)) return false;
        if (intent !== "all" && k.intent !== intent) return false;
        if (funnel !== "all" && k.funnelStage !== funnel) return false;
        if (dimension !== "all" && k.dimension !== dimension) return false;
        if (channel !== "all" && k.channel !== channel) return false;
        if (priority !== "all" && k.priority !== priority) return false;
        if (onlyReal && k.dataSource !== "real") return false;
        if (hideZeroVolume && k.dataSource === "real" && (k.searchVolume ?? 0) === 0) return false;
        if (onlyGap && !k.competitorGap) return false;
        if (k.kd != null && k.kd > kdLimit) return false;
        return true;
      })
      .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
  }, [universe, search, intent, funnel, dimension, channel, priority, hideZeroVolume, onlyReal, onlyGap, maxKd]);

  // ── Curated views ──────────────────────────────────────────────────
  const priorityKeywords = useMemo(() => (universe?.keywords || [])
    .filter((k) => k.priority === "high" && !k.isNegative)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const seoOpps = useMemo(() => (universe?.keywords || [])
    .filter((k) => (k.channel === "SEO" || k.channel === "Landing Page") && !k.isNegative && (k.searchVolume ?? 0) > 0)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const adsOpps = useMemo(() => (universe?.keywords || [])
    .filter((k) => k.channel === "Google Ads" && !k.isNegative && k.intent === "transactional")
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const contentOpps = useMemo(() => (universe?.keywords || [])
    .filter((k) => k.channel === "Content" && !k.isNegative)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const localOpps = useMemo(() => (universe?.keywords || [])
    .filter((k) => k.channel === "Lokal SEO" && !k.isNegative)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const negatives = useMemo(() => (universe?.keywords || []).filter((k) => k.isNegative), [universe]);

  // ── Klusteraggregering ─────────────────────────────────────────────
  const clusters = useMemo<ClusterData[]>(() => {
    if (!universe) return [];
    const map = new Map<string, UniverseKeyword[]>();
    for (const kw of universe.keywords) {
      if (kw.isNegative) continue;
      const c = kw.cluster || "Övrigt";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(kw);
    }
    const brandTerms = goals?.brand_terms ?? [];

    return Array.from(map.entries()).map(([name, kws]) => {
      const realKws = kws.filter((k) => k.dataSource === "real");
      const totalVolume = realKws.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
      const kds = kws.filter((k) => k.kd != null).map((k) => k.kd!);
      const avgKd = kds.length ? kds.reduce((a, b) => a + b, 0) / kds.length : null;
      const cpcs = kws.filter((k) => k.cpc != null).map((k) => k.cpc!);
      const avgCpc = cpcs.length ? cpcs.reduce((a, b) => a + b, 0) / cpcs.length : null;
      const competitorGapCount = kws.filter((k) => k.competitorGap).length;

      const intentCounts: Record<string, number> = {};
      const channelCounts: Record<string, number> = {};
      for (const k of kws) {
        intentCounts[k.intent] = (intentCounts[k.intent] || 0) + 1;
        channelCounts[k.channel] = (channelCounts[k.channel] || 0) + 1;
      }
      const dominantIntent =
        Object.entries(intentCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "informational";
      const dominantChannel =
        Object.entries(channelCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "SEO";

      const strategyBreakdown = {
        acquire_nonbrand: 0,
        acquire_brand: 0,
        retain_nonbrand: 0,
        retain_brand: 0,
      };
      for (const k of kws) {
        const q = classifyKeyword(k.keyword, brandTerms, k.intent);
        strategyBreakdown[q]++;
      }

      const estimatedValueSek = goals
        ? kws.reduce((s, k) => s + monthlyKeywordValue(k.searchVolume ?? 0, 20, goals), 0)
        : 0;

      return {
        name,
        keywords: kws,
        totalVolume,
        avgKd,
        avgCpc,
        competitorGapCount,
        dominantIntent,
        dominantChannel,
        strategyBreakdown,
        estimatedValueSek,
        enrichedCount: realKws.length,
        totalCount: kws.length,
      };
    });
  }, [universe, goals]);

  const sortedClusters = useMemo(() => {
    let result = clusters;
    if (clusterSearch.trim()) {
      const q = clusterSearch.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.keywords.some((k) => k.keyword.toLowerCase().includes(q)),
      );
    }
    return [...result].sort((a, b) => {
      if (clusterSort === "value") return b.estimatedValueSek - a.estimatedValueSek;
      if (clusterSort === "volume") return b.totalVolume - a.totalVolume;
      if (clusterSort === "gap") return b.competitorGapCount - a.competitorGapCount;
      if (clusterSort === "kd") return (a.avgKd ?? 100) - (b.avgKd ?? 100);
      return 0;
    });
  }, [clusters, clusterSort, clusterSearch]);

  // ── Aggregate stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!universe) return { total: 0, totalVolume: 0, avgCpc: 0, highPriority: 0 };
    const real = universe.keywords.filter((k) => k.dataSource === "real");
    const totalVolume = real.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
    const cpcs = real.filter((k) => k.cpc != null).map((k) => k.cpc!);
    const avgCpc = cpcs.length ? cpcs.reduce((a, b) => a + b, 0) / cpcs.length : 0;
    return {
      total: universe.totalKeywords ?? universe.keywords.length,
      totalVolume,
      avgCpc,
      highPriority: priorityKeywords.length,
    };
  }, [universe, priorityKeywords]);

  const dimensions = useMemo(
    () => Array.from(new Set((universe?.keywords || []).map((k) => k.dimension))),
    [universe],
  );
  const channels = useMemo(
    () => Array.from(new Set((universe?.keywords || []).map((k) => k.channel))),
    [universe],
  );

  // ── Actions ────────────────────────────────────────────────────────
  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportFiltered = () => {
    if (filtered.length === 0) {
      toast({ title: "Inga sökord", description: "Filtret matchar inga sökord.", variant: "destructive" });
      return;
    }
    const rows = [[
      "Sökord", "Kluster", "Dimension", "Intent", "Funnel", "Prioritet", "Kanal",
      "Volym/mån", "CPC (SEK)", "Konkurrens", "KD%", "Konkurrent-gap",
      "SERP features", "Top domäner", "Datakälla", "Landningssida", "Annonsgrupp",
      "Contentidé", "Negativt",
    ]];
    filtered.forEach((k) => {
      rows.push([
        k.keyword, k.cluster, DIMENSION_LABELS[k.dimension] || k.dimension,
        INTENT_LABELS[k.intent] || k.intent, k.funnelStage, k.priority, k.channel,
        k.searchVolume?.toString() ?? "", k.cpc?.toFixed(2) ?? "", k.competition?.toFixed(2) ?? "",
        k.kd != null ? Math.round(k.kd).toString() : "",
        k.competitorGap ? "Ja" : "",
        (k.serpFeatures || []).join("; "),
        (k.topRankingDomains || []).join("; "),
        k.dataSource === "real" ? "DataForSEO" : "Uppskattad",
        k.recommendedLandingPage ?? "", k.recommendedAdGroup ?? "", k.contentIdea ?? "",
        k.isNegative ? "Ja" : "",
      ]);
    });
    downloadCSV(rows, `sokord-filtrerade-${Date.now()}.csv`);
    toast({ title: "Export klar", description: `${filtered.length} sökord` });
  };

  const exportAllUniverseCsv = () => {
    if (!universe) return;
    const all = universe.keywords;
    if (all.length === 0) {
      toast({ title: "Inga sökord", description: "Universumet är tomt.", variant: "destructive" });
      return;
    }
    const rows = [[
      "Sökord", "Kluster", "Dimension", "Intent", "Funnel", "Prioritet", "Kanal",
      "Volym/mån", "CPC (SEK)", "Konkurrens", "KD%", "Konkurrent-gap", "Datakälla",
      "Landningssida", "Annonsgrupp", "Contentidé", "Negativt",
    ]];
    all.forEach((k) => {
      rows.push([
        k.keyword, k.cluster, DIMENSION_LABELS[k.dimension] || k.dimension,
        INTENT_LABELS[k.intent] || k.intent, k.funnelStage, k.priority, k.channel,
        k.searchVolume?.toString() ?? "", k.cpc?.toFixed(2) ?? "", k.competition?.toFixed(2) ?? "",
        k.kd != null ? Math.round(k.kd).toString() : "",
        k.competitorGap ? "Ja" : "",
        k.dataSource === "real" ? "DataForSEO" : "Uppskattad",
        k.recommendedLandingPage ?? "", k.recommendedAdGroup ?? "", k.contentIdea ?? "",
        k.isNegative ? "Ja" : "",
      ]);
    });
    downloadCSV(rows, `sokord-universum-${Date.now()}.csv`);
    toast({ title: "Export klar", description: `${all.length} sökord` });
  };

  const exportPresentation = async (format: ExportFormat) => {
    if (!analysisId) {
      toast({ title: "Saknar analys", description: "Behöver en sparad analys för PPTX/PDF.", variant: "destructive" });
      return;
    }
    setExporting(format);
    try {
      const { data: payload, error: err } = await supabase.functions.invoke("generate-presentation", {
        body: { analysis_id: analysisId, format },
      });
      if (err) throw err;
      const base64 = (payload as any)?.file;
      if (!base64) throw new Error("Inget filinnehåll returnerades");
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = format === "pptx"
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : "application/pdf";
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sokord-rapport-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Klar", description: `${format.toUpperCase()} nedladdad.` });
    } catch (e: any) {
      toast({ title: "Export misslyckades", description: e.message || "Försök igen.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleRegenerate = async () => {
    if (!id) return;
    const isBackground = scale === "max" || scale === "ultra";
    const ok = window.confirm(
      isBackground
        ? "Detta startar ett stort sökordsuniversum i bakgrunden (5–10 min). Du kan följa progressen. Fortsätta?"
        : "Detta genererar ett nytt sökordsuniversum baserat på befintlig analysdata. Det tar 1-2 minuter. Vill du fortsätta?",
    );
    if (!ok) return;
    setRegenerating(true);
    try {
      const body: any = { project_id: id, scale };
      if (isBackground && analysisId) {
        body.background = true;
        body.analysis_id = analysisId;
      }
      const { data: resp, error: err } = await supabase.functions.invoke("keyword-universe", { body });
      if (err) throw err;
      if (isBackground) {
        toast({ title: "Startat i bakgrunden", description: "Universumet byggs. Sidan uppdateras när det är klart." });
        refetch();
        return;
      }
      const newUniverse = (resp as any)?.universe;
      if (!newUniverse) throw new Error("Ingen universe-data returnerades");
      if (analysisId) {
        await supabase
          .from("analyses")
          .update({ keyword_universe_json: newUniverse, universe_scale: newUniverse.scale || scale })
          .eq("id", analysisId);
      }
      toast({ title: "Universum genererat", description: `${newUniverse.totalKeywords ?? 0} sökord.` });
      refetch();
    } catch (e: any) {
      toast({ title: "Kunde inte generera om", description: e.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  // ── Loading / empty ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!universe && !pending) {
    return <EmptyState projectId={id!} navigate={navigate} />;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <Search className="h-7 w-7 text-primary" /> Sökord & innehåll
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sökordsuniversum, briefs, strategi, teknisk SEO och Google Ads-export.
          </p>
          {createdAt && (
            <p className="text-xs text-muted-foreground mt-2">
              {source === "prelaunch" ? "Baserad på pre-launch-analys" : "Baserad på full analys"}
              {universe?.totalEnriched ? ` • ${universe.totalEnriched} berikade` : ""}
              {` • Genererad ${new Date(createdAt).toLocaleDateString("sv-SE")}`}
              {universeScale ? ` • Skala: ${universeScale}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={scale} onValueChange={(v) => setScale(v as UniverseScale)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="focused">Fokuserad (~500)</SelectItem>
              <SelectItem value="broad">Bred (~1500)</SelectItem>
              <SelectItem value="max">Max (~8000) — bakgrund</SelectItem>
              <SelectItem value="ultra">Ultra (~15000) — bakgrund</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerating || pending}
            className="gap-2"
          >
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {regenerating ? "Genererar…" : "Regenerera"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2"><Download className="h-4 w-4" /> Exportera</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs">Sökord</DropdownMenuLabel>
              <DropdownMenuItem onClick={exportFiltered} className="gap-3 cursor-pointer">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm">CSV (filtrerade)</div>
                  <div className="text-[11px] text-muted-foreground">
                    {filtered.length} sökord • 19 kolumner
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAllUniverseCsv} className="gap-3 cursor-pointer">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm">CSV (hela universumet)</div>
                  <div className="text-[11px] text-muted-foreground">
                    {universe?.keywords.length ?? 0} sökord
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Presentation</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => exportPresentation("pptx")}
                disabled={!!exporting || !analysisId}
                className="gap-3 cursor-pointer"
              >
                {exporting === "pptx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4 text-primary" />}
                <div className="text-sm">PowerPoint (.pptx)</div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportPresentation("pdf")}
                disabled={!!exporting || !analysisId}
                className="gap-3 cursor-pointer"
              >
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType className="h-4 w-4 text-primary" />}
                <div className="text-sm">PDF</div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Google Ads</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setAdsModalOpen(true)}
                disabled={!analysisId}
                className="gap-3 cursor-pointer"
              >
                <Megaphone className="h-4 w-4 text-primary" />
                <div className="text-sm">Google Ads Editor (.zip)</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pending banner */}
      {pending && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Analys pågår…</p>
              <p className="text-xs text-muted-foreground">
                Sökordsuniversumet genereras. Tar vanligtvis 1–3 min. Sidan uppdateras automatiskt.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-launch banner */}
      {source === "prelaunch" && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Baserat på pre-launch-analys</p>
              <p className="text-xs text-muted-foreground">
                Kör en full analys för att låsa upp briefs, strategi och teknisk SEO.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(`/project/${id}`)}>Kör full analys</Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {universe && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard label="Totala sökord" value={stats.total.toLocaleString("sv-SE")} />
          <StatCard label="Total volym/mån" value={stats.totalVolume.toLocaleString("sv-SE")} />
          <StatCard label="Snitt-CPC" value={stats.avgCpc ? `${stats.avgCpc.toFixed(2)} kr` : "—"} />
          <StatCard label="Prioriterade (high)" value={stats.highPriority.toLocaleString("sv-SE")} />
        </div>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">Analys-fel: {error}</CardContent>
        </Card>
      )}

      {universe && (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Översikt
            </TabsTrigger>
            <TabsTrigger value="keywords" className="gap-1.5">
              <Search className="h-3.5 w-3.5" /> Sökord
            </TabsTrigger>
            <TabsTrigger value="briefs" className="gap-1.5" disabled={!analysisId}>
              <BookOpen className="h-3.5 w-3.5" /> Briefs
            </TabsTrigger>
            <TabsTrigger value="strategy" className="gap-1.5" disabled={!analysisId}>
              <Target className="h-3.5 w-3.5" /> Strategi
            </TabsTrigger>
            <TabsTrigger value="techseo" className="gap-1.5" disabled={!analysisId}>
              <ShieldCheck className="h-3.5 w-3.5" /> Teknisk SEO
            </TabsTrigger>
            <TabsTrigger value="ads-export" className="gap-1.5" disabled={!analysisId}>
              <Megaphone className="h-3.5 w-3.5" /> Google Ads-export
            </TabsTrigger>
          </TabsList>

          {/* Översikt */}
          <TabsContent value="overview" className="mt-4 space-y-6">
            {id && <SeoDiagnosisPanel projectId={id} />}
            {result ? (
              <OverviewSection result={result} universe={universe} />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Översiktsdata kräver en full analys.
                </CardContent>
              </Card>
            )}
            {result?.quickWins?.length ? (
              <div>
                <h3 className="font-serif text-xl mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-accent" /> Quick wins
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {result.quickWins.map((q, i) => (
                    <Card key={i} className="border-accent/30 bg-card shadow-card">
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-sm">{q.keyword}</p>
                          <Badge variant="outline" className="border-accent/40 text-accent">{q.channel}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{q.reason}</p>
                        <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
                          <span className="font-semibold text-accent">Åtgärd: </span>{q.action}
                        </div>
                        <div className="flex gap-3 text-[11px] text-muted-foreground">
                          <span>Volym: {q.volumeEstimate}</span>
                          <span>Intent: {q.intent}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <h3 className="font-serif text-xl mb-3 flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" /> Klusteråtgärder
              </h3>
              <ClusterActionsTab projectId={id!} universe={universe} />
            </div>
          </TabsContent>

          {/* Sökord */}
          <TabsContent value="keywords" className="mt-4 space-y-4">
            <Tabs defaultValue="universe">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="universe" className="gap-1"><Network className="h-3 w-3" />Universe</TabsTrigger>
                <TabsTrigger value="priority" className="gap-1"><Sparkles className="h-3 w-3" />Prioriterade</TabsTrigger>
                <TabsTrigger value="seo" className="gap-1"><FileText className="h-3 w-3" />SEO</TabsTrigger>
                <TabsTrigger value="ads" className="gap-1"><Megaphone className="h-3 w-3" />Google Ads</TabsTrigger>
                <TabsTrigger value="content" className="gap-1"><FileText className="h-3 w-3" />Content</TabsTrigger>
                <TabsTrigger value="local" className="gap-1"><MapPin className="h-3 w-3" />Lokal</TabsTrigger>
                <TabsTrigger value="negatives" className="gap-1"><Ban className="h-3 w-3" />Negativa</TabsTrigger>
              </TabsList>

              <TabsContent value="universe" className="space-y-4 mt-4">
                {/* Grid-header: sökning + sortering + vy-växlare */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder={view === "grid" ? "Sök kluster eller sökord..." : "Filtrera sökord..."}
                        value={view === "grid" ? clusterSearch : search}
                        onChange={(e) =>
                          view === "grid" ? setClusterSearch(e.target.value) : setSearch(e.target.value)
                        }
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    {view === "grid" && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Sortera:</span>
                        {([
                          ["value", "Värde"],
                          ["volume", "Volym"],
                          ["gap", "Gaps"],
                          ["kd", "Lättast"],
                        ] as const).map(([key, label]) => (
                          <Button
                            key={key}
                            variant={clusterSort === key ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => setClusterSort(key)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
                      <Button
                        variant={view === "grid" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2 gap-1.5"
                        onClick={() => setView("grid")}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span className="text-xs">Kluster</span>
                      </Button>
                      <Button
                        variant={view === "table" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2 gap-1.5"
                        onClick={() => setView("table")}
                      >
                        <List className="h-3.5 w-3.5" />
                        <span className="text-xs">Tabell</span>
                      </Button>
                    </div>
                  </div>

                  {goals?.brand_terms && goals.brand_terms.length > 0 && view === "grid" && (
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>Strategi:</span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-teal-500/70 inline-block" />
                        Nykund
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500/70 inline-block" />
                        Brand
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500/70 inline-block" />
                        Retention
                      </span>
                    </div>
                  )}
                </div>

                {view === "grid" ? (
                  sortedClusters.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>Inga kluster hittades i universumet.</p>
                      <p className="text-xs mt-1">
                        Generera om universumet eller justera din sökning.
                      </p>
                    </div>
                  ) : (
                    <ClusterGrid
                      clusters={sortedClusters}
                      onClusterClick={(c) => {
                        setSelectedCluster(c);
                        setSheetOpen(true);
                      }}
                    />
                  )
                ) : (
                  <>
                    <Card className="border-border bg-card">
                      <CardContent className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                        <FilterSelect label="Intent" value={intent} onChange={setIntent} options={[
                          ["all","Alla"],["informational","Info"],["commercial","Kommersiell"],
                          ["transactional","Transaktionell"],["navigational","Navigations"],
                        ]} />
                        <FilterSelect label="Funnel" value={funnel} onChange={setFunnel} options={[
                          ["all","Alla"],["awareness","Awareness"],["consideration","Consideration"],["conversion","Conversion"],
                        ]} />
                        <FilterSelect label="Dimension" value={dimension} onChange={setDimension}
                          options={[["all","Alla"], ...dimensions.map<[string,string]>((d) => [d, DIMENSION_LABELS[d] || d])]} />
                        <FilterSelect label="Kanal" value={channel} onChange={setChannel}
                          options={[["all","Alla"], ...channels.map<[string,string]>((c) => [c, c])]} />
                        <FilterSelect label="Prioritet" value={priority} onChange={setPriority} options={[
                          ["all","Alla"],["high","Hög"],["medium","Medium"],["low","Låg"],
                        ]} />
                        <div>
                          <Label className="text-xs">KD max</Label>
                          <Input
                            type="number" min={0} max={100} value={maxKd}
                            onChange={(e) => setMaxKd(e.target.value)} className="h-9"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch id="zero" checked={hideZeroVolume} onCheckedChange={setHideZeroVolume} />
                          <Label htmlFor="zero" className="text-xs cursor-pointer">Dölj 0-volym</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch id="real" checked={onlyReal} onCheckedChange={setOnlyReal} />
                          <Label htmlFor="real" className="text-xs cursor-pointer">Endast verklig data</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch id="gap" checked={onlyGap} onCheckedChange={setOnlyGap} />
                          <Label htmlFor="gap" className="text-xs cursor-pointer">Konkurrent-gap</Label>
                        </div>
                      </CardContent>
                    </Card>
                    <KeywordTable items={filtered} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="priority" className="mt-4"><KeywordTable items={priorityKeywords} /></TabsContent>
              <TabsContent value="seo" className="mt-4"><KeywordTable items={seoOpps} /></TabsContent>
              <TabsContent value="ads" className="mt-4"><KeywordTable items={adsOpps} /></TabsContent>
              <TabsContent value="content" className="mt-4"><KeywordTable items={contentOpps} /></TabsContent>
              <TabsContent value="local" className="mt-4"><KeywordTable items={localOpps} /></TabsContent>
              <TabsContent value="negatives" className="mt-4"><KeywordTable items={negatives} /></TabsContent>
            </Tabs>
          </TabsContent>

          {/* Briefs */}
          <TabsContent value="briefs" className="mt-4">
            {analysisId && <ContentBriefsTab analysisId={analysisId} universe={universe} />}
          </TabsContent>

          {/* Strategi */}
          <TabsContent value="strategy" className="mt-4">
            {analysisId && <StrategyTab projectId={id!} analysisId={analysisId} />}
          </TabsContent>

          {/* Teknisk SEO */}
          <TabsContent value="techseo" className="mt-4">
            {analysisId && <TechSeoTab analysisId={analysisId} />}
          </TabsContent>

          {/* Google Ads-export */}
          <TabsContent value="ads-export" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-serif text-xl flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" /> Google Ads Editor-export
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bygg en komplett ZIP med kampanjer, annonsgrupper, sökord, negativa och AI-genererade RSA-annonser
                    redo att importeras i Google Ads Editor.
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Stat
                    label="Sökord (Google Ads)"
                    value={(universe.keywords.filter((k) => !k.isNegative && (k.searchVolume ?? 0) > 0 && k.channel === "Google Ads")).length}
                  />
                  <Stat label="Negativa" value={negatives.length} />
                  <Stat label="Annonsgrupper" value={
                    new Set(universe.keywords
                      .filter((k) => !k.isNegative && (k.searchVolume ?? 0) > 0 && k.channel === "Google Ads")
                      .map((k) => k.recommendedAdGroup || k.cluster)).size
                  } />
                </div>
                <Button onClick={() => setAdsModalOpen(true)} disabled={!analysisId} className="gap-2">
                  <Download className="h-4 w-4" /> Konfigurera och exportera
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {analysisId && universe && (
        <AdsExportModal
          open={adsModalOpen}
          onClose={() => setAdsModalOpen(false)}
          universe={universe}
          projectId={id!}
          analysisId={analysisId}
        />
      )}

      <ClusterSheet
        cluster={selectedCluster}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectId={id!}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="font-serif text-3xl mt-1">
        {typeof value === "number" ? value.toLocaleString("sv-SE") : value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-xl mt-1">{value.toLocaleString("sv-SE")}</div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function EmptyState({ projectId, navigate }: { projectId: string; navigate: (p: string) => void }) {
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <Card className="border-dashed">
        <CardContent className="p-10 text-center space-y-4">
          <Search className="h-12 w-12 text-primary mx-auto" />
          <div>
            <h2 className="font-serif text-2xl">Inget sökordsuniversum ännu</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Generera ett sökordsuniversum för att se kluster, sökord med volym och estimerat
              affärsvärde per kluster.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Button onClick={() => navigate(`/project/${projectId}`)} className="gap-2">
              <Sparkles className="h-4 w-4" /> Kör full analys
            </Button>
            <Button variant="outline" onClick={() => navigate(`/clients/${projectId}/prelaunch`)} className="gap-2">
              Pre-launch (snabbare)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground pt-2">
            Full analys: sökordsuniversum + SEO-audit + strategi. Pre-launch: snabb marknadsanalys + sökord.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
