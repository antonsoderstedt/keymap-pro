import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Download, FileText, Presentation, FileType, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ResultsSidebar } from "@/components/results/ResultsSidebar";
import { OverviewSection } from "@/components/results/sections/OverviewSection";
import { SegmentsSection } from "@/components/results/sections/SegmentsSection";
import { KeywordsSection } from "@/components/results/sections/KeywordsSection";
import { ChannelsSection } from "@/components/results/sections/ChannelsSection";
import { ActionSection } from "@/components/results/sections/ActionSection";
import { DIMENSION_LABELS, INTENT_LABELS } from "@/components/results/KeywordTable";
import type { AnalysisResult, KeywordUniverse, UniverseKeyword } from "@/lib/types";

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [universe, setUniverse] = useState<KeywordUniverse | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pptx" | "pdf" | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = async () => {
    setLoading(true);
    const { data: project } = await supabase.from("projects").select("name").eq("id", id!).single();
    if (project) setProjectName((project as any).name);

    const { data, error } = await supabase
      .from("analyses")
      .select("id, result_json, keyword_universe_json")
      .eq("project_id", id!)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      toast({ title: "Inga resultat", description: "Ingen analys hittad för projektet.", variant: "destructive" });
      setLoading(false);
      return;
    }

    setAnalysisId((data as any).id);
    setResult((data as any).result_json as AnalysisResult);
    setUniverse((data as any).keyword_universe_json as KeywordUniverse | null);
    setLoading(false);
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportUniverseCsv = (filtered: UniverseKeyword[]) => {
    if (filtered.length === 0) {
      toast({ title: "Inga sökord", description: "Filtret matchar inga sökord.", variant: "destructive" });
      return;
    }
    const rows = [["Sökord", "Kluster", "Dimension", "Intent", "Funnel", "Prioritet", "Kanal", "Volym/mån", "CPC (SEK)", "Konkurrens", "KD%", "Konkurrent-gap", "Datakälla", "Landningssida", "Annonsgrupp", "Contentidé", "Negativt"]];
    filtered.forEach((k) => {
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
    downloadCSV(rows, "keymap-universe.csv");
    toast({ title: "Export klar", description: `${filtered.length} sökord` });
  };

  const exportPresentation = async (format: "pptx" | "pdf") => {
    if (!analysisId) return;
    setExporting(format);
    try {
      const { data, error } = await supabase.functions.invoke("generate-presentation", {
        body: { analysis_id: analysisId, format },
      });
      if (error) throw error;
      const base64 = (data as any)?.file;
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
      a.download = `${projectName.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "keymap"}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Presentation klar", description: `Filen ${format.toUpperCase()} har laddats ner.` });
    } catch (e: any) {
      toast({ title: "Export misslyckades", description: e.message || "Försök igen.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">Inga resultat hittade.</p>
        <Button onClick={() => navigate(`/project/${id}`)} variant="outline">Tillbaka till projektet</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${id}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{projectName || "Projekt"}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {result.totalKeywords?.toLocaleString("sv-SE") ?? 0} sökord
                {result.segments?.length ? ` • ${result.segments.length} segment` : ""}
                {universe ? ` • ${universe.totalEnriched} berikade` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" /> Exportera
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs">Presentation (rekommenderas)</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => exportPresentation("pptx")}
                  disabled={!!exporting}
                  className="cursor-pointer gap-3"
                >
                  {exporting === "pptx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4 text-primary" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium">PowerPoint (.pptx)</div>
                    <div className="text-xs text-muted-foreground">Redigerbar slide-deck för kundmöte</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPresentation("pdf")}
                  disabled={!!exporting}
                  className="cursor-pointer gap-3"
                >
                  {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType className="h-4 w-4 text-primary" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium">PDF</div>
                    <div className="text-xs text-muted-foreground">Låst layout, perfekt att dela</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Rådata</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => universe && exportUniverseCsv(universe.keywords)}
                  disabled={!universe}
                  className="cursor-pointer gap-3"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">Hela universumet (CSV)</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-8 px-6 py-8">
        <ResultsSidebar />

        <main className="min-w-0 flex-1 space-y-16 animate-fade-in">
          <OverviewSection result={result} universe={universe} />
          {result.segments?.length > 0 && <SegmentsSection segments={result.segments} />}
          {universe ? (
            <>
              <KeywordsSection universe={universe} onExportCsv={exportUniverseCsv} />
              <ChannelsSection universe={universe} projectId={id!} analysisId={analysisId} />
              <ActionSection result={result} universe={universe} projectId={id!} analysisId={analysisId} />
            </>
          ) : (
            <section className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="font-semibold">Keyword Universe saknas</p>
              <p className="mt-1 text-sm text-muted-foreground">Generera ett universe för att låsa upp sektionerna Sökord, Kanaler och Action.</p>
              <Button className="mt-4" onClick={() => navigate(`/project/${id}/results/universe`)}>
                Generera Keyword Universe
              </Button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
