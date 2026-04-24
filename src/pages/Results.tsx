import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Download, Copy, BarChart3, Search, Expand, Megaphone, Zap, Globe, FileText, Megaphone as MegaIcon, LayoutTemplate } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import KeywordResearchSection from "@/components/results/KeywordResearchSection";
import type { AnalysisResult, ScanData, ResearchCluster, ResearchKeyword } from "@/lib/types";

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [scanData, setScanData] = useState<ScanData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadResults();
  }, [id]);

  const loadResults = async () => {
    const { data: project } = await supabase.from("projects").select("name").eq("id", id!).single();
    if (project) setProjectName((project as any).name);

    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("project_id", id!)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      toast({ title: "Inga resultat", description: "Ingen analys hittad för detta projekt.", variant: "destructive" });
      setLoading(false);
      return;
    }

    setResult((data as any).result_json as AnalysisResult);
    setScanData((data as any).scan_data_json as ScanData[] | null);
    setLoading(false);
  };

  const exportKeywordsCSV = () => {
    if (!result) return;
    const rows = [["Kategori", "Sökord", "Kanal", "Intent", "Volym", "Svårighet", "CPC"]];
    result.keywords?.forEach((cluster) => {
      cluster.keywords.forEach((kw) => {
        rows.push([cluster.cluster, kw.keyword, kw.channel, kw.type, kw.volumeEstimate, kw.difficulty, kw.cpc]);
      });
    });
    downloadCSV(rows, "keymap-keywords.csv");
  };

  const exportAdsCSV = () => {
    if (!result) return;
    const rows = [["Kampanj", "Segment", "Annonsgrupp", "Match Type", "Sökord"]];
    result.adsStructure?.forEach((campaign) => {
      campaign.adGroups.forEach((ag) => {
        ag.broadMatch.forEach((kw) => rows.push([campaign.campaignName, campaign.segment, ag.name, "Broad", kw]));
        ag.phraseMatch.forEach((kw) => rows.push([campaign.campaignName, campaign.segment, ag.name, "Phrase", kw]));
        ag.exactMatch.forEach((kw) => rows.push([campaign.campaignName, campaign.segment, ag.name, "Exact", kw]));
        ag.negatives.forEach((kw) => rows.push([campaign.campaignName, campaign.segment, ag.name, "Negative", kw]));
      });
    });
    downloadCSV(rows, "keymap-ads-structure.csv");
  };

  // === Keyword Research exports ===
  const cpcToMaxBid = (cpc: string) => cpc === "Hög" ? "50" : cpc === "Medium" ? "25" : "10";

  const getResearchKeywords = (): { cluster: ResearchCluster; keyword: ResearchKeyword; clusterIdx: number; rowIdx: number }[] => {
    if (!result?.keywordResearch) return [];
    const all: any[] = [];
    result.keywordResearch.forEach((c, ci) => {
      c.keywords.forEach((k, ki) => all.push({ cluster: c, keyword: k, clusterIdx: ci, rowIdx: ki }));
    });
    if (selectedKeywords.size > 0) {
      return all.filter((x) => selectedKeywords.has(`${x.clusterIdx}::${x.rowIdx}`));
    }
    return all;
  };

  const exportSeoCSV = () => {
    const items = getResearchKeywords();
    if (items.length === 0) {
      toast({ title: "Inga sökord", description: "Inga keyword research-data tillgängliga", variant: "destructive" });
      return;
    }
    const rows = [["Sökord", "Kluster", "Kategori", "Intent", "Volym", "Rekommenderad sidtitel"]];
    items.forEach(({ cluster, keyword }) => {
      rows.push([keyword.keyword, cluster.cluster, keyword.category, keyword.intent, keyword.volume, cluster.recommendedH1]);
    });
    downloadCSV(rows, "keymap-seo.csv");
    toast({ title: "SEO-export klar", description: `${items.length} sökord exporterade` });
  };

  const exportAdsResearchCSV = () => {
    const items = getResearchKeywords();
    if (items.length === 0) {
      toast({ title: "Inga sökord", description: "Inga keyword research-data tillgängliga", variant: "destructive" });
      return;
    }
    const rows = [["Kampanj", "Annonsgrupp", "Sökord", "Match Type", "Max CPC (SEK)"]];
    items.forEach(({ cluster, keyword }) => {
      rows.push([cluster.segment, cluster.cluster, keyword.keyword, "Phrase", cpcToMaxBid(keyword.cpc)]);
    });
    downloadCSV(rows, "keymap-google-ads.csv");
    toast({ title: "Ads-export klar", description: `${items.length} sökord exporterade` });
  };

  const exportLandingCSV = () => {
    if (!result?.keywordResearch?.length) {
      toast({ title: "Inga kluster", description: "Inga keyword research-data tillgängliga", variant: "destructive" });
      return;
    }
    const rows = [["Kluster", "Segment", "H1", "Meta description", "URL-slug", "Antal sökord"]];
    result.keywordResearch.forEach((c) => {
      rows.push([c.cluster, c.segment, c.recommendedH1, c.metaDescription, c.urlSlug, String(c.keywords?.length || 0)]);
    });
    downloadCSV(rows, "keymap-landningssidor.csv");
    toast({ title: "Landningssidor-export klar", description: `${result.keywordResearch.length} kluster exporterade` });
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJSON = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast({ title: "Kopierat!", description: "JSON kopierat till urklipp" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full bg-primary animate-pulse-glow" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Inga resultat hittade.</p>
        <Button onClick={() => navigate(`/project/${id}`)} variant="outline">Tillbaka till projektet</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${id}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-serif text-xl">{projectName}</h1>
              <p className="text-xs text-muted-foreground">{result.totalKeywords} sökord • {result.segments?.length || 0} segment</p>
            </div>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" className="gap-2">
                  <Download className="h-3 w-3" />
                  Exportera
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs">Keyword Research</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportSeoCSV} className="gap-2 cursor-pointer">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <div className="flex-1">
                    <div className="text-sm">SEO Export</div>
                    <div className="text-xs text-muted-foreground">Sökord, kluster, sidtitel</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportAdsResearchCSV} className="gap-2 cursor-pointer">
                  <MegaIcon className="h-3.5 w-3.5 text-primary" />
                  <div className="flex-1">
                    <div className="text-sm">Google Ads Export</div>
                    <div className="text-xs text-muted-foreground">Kampanj, annonsgrupp, max CPC</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportLandingCSV} className="gap-2 cursor-pointer">
                  <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
                  <div className="flex-1">
                    <div className="text-sm">Landningssidor Export</div>
                    <div className="text-xs text-muted-foreground">H1, meta, slug per kluster</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Klassisk</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportKeywordsCSV} className="gap-2 cursor-pointer">
                  <Download className="h-3.5 w-3.5" /><span className="text-sm">Keywords CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportAdsCSV} className="gap-2 cursor-pointer">
                  <Download className="h-3.5 w-3.5" /><span className="text-sm">Ads-struktur CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyJSON} className="gap-2 cursor-pointer">
                  <Copy className="h-3.5 w-3.5" /><span className="text-sm">Kopiera JSON</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Summary */}
      <div className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <Tabs defaultValue="segments">
          <TabsList className="mb-6">
            <TabsTrigger value="segments" className="gap-2"><BarChart3 className="h-3 w-3" />Segment</TabsTrigger>
            <TabsTrigger value="keywords" className="gap-2"><Search className="h-3 w-3" />Keywords</TabsTrigger>
            <TabsTrigger value="expansion" className="gap-2"><Expand className="h-3 w-3" />Expansion</TabsTrigger>
            <TabsTrigger value="ads" className="gap-2"><Megaphone className="h-3 w-3" />Google Ads</TabsTrigger>
            <TabsTrigger value="quickwins" className="gap-2"><Zap className="h-3 w-3" />Quick Wins</TabsTrigger>
            {scanData && <TabsTrigger value="webscan" className="gap-2"><Globe className="h-3 w-3" />Webbscan</TabsTrigger>}
          </TabsList>

          {/* Segments */}
          <TabsContent value="segments">
            <div className="grid gap-4 md:grid-cols-2">
              {result.segments?.map((seg, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-serif text-lg">{seg.name}</CardTitle>
                      <Badge variant={seg.opportunityScore >= 7 ? "default" : "secondary"}>
                        Score: {seg.opportunityScore}/10
                      </Badge>
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>SNI: {seg.sniCode}</span>
                      <span>•</span>
                      <span>{seg.size} företag</span>
                      {seg.isNew && <Badge variant="outline" className="text-primary border-primary">Ny</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-1">Hur de söker:</p>
                      <div className="flex flex-wrap gap-1">{seg.howTheySearch?.map((s, j) => <Badge key={j} variant="outline">{s}</Badge>)}</div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Språkmönster:</p>
                      <div className="flex flex-wrap gap-1">{seg.languagePatterns?.map((s, j) => <Badge key={j} variant="secondary">{s}</Badge>)}</div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Use cases:</p>
                      <ul className="list-disc pl-4">{seg.useCases?.map((s, j) => <li key={j}>{s}</li>)}</ul>
                    </div>
                    <p className="text-muted-foreground italic">{seg.insight}</p>
                    {seg.primaryKeywords?.length > 0 && (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-xs">Sökord</TableHead><TableHead className="text-xs">Kanal</TableHead><TableHead className="text-xs">Volym</TableHead><TableHead className="text-xs">Intent</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>{seg.primaryKeywords.map((kw, j) => (
                          <TableRow key={j}>
                            <TableCell className="font-mono">{kw.keyword}</TableCell>
                            <TableCell>{kw.channel}</TableCell>
                            <TableCell>{kw.volumeEstimate}</TableCell>
                            <TableCell><Badge variant="outline">{kw.intent}</Badge></TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Keyword Research section under segment cards */}
            {result.keywordResearch && result.keywordResearch.length > 0 && (
              <div className="mt-6">
                <KeywordResearchSection
                  clusters={result.keywordResearch}
                  selectedKeywords={selectedKeywords}
                  setSelectedKeywords={setSelectedKeywords}
                />
              </div>
            )}
          </TabsContent>

          {/* Keywords */}
          <TabsContent value="keywords">
            <div className="space-y-6">
              {result.keywords?.map((cluster, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-serif text-lg">{cluster.cluster}</CardTitle>
                    <p className="text-xs text-muted-foreground">Segment: {cluster.segment}</p>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Sökord</TableHead><TableHead>Typ</TableHead><TableHead>Kanal</TableHead><TableHead>Volym</TableHead><TableHead>Svårighet</TableHead><TableHead>CPC</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>{cluster.keywords.map((kw, j) => (
                        <TableRow key={j}>
                          <TableCell className="font-mono text-sm">{kw.keyword}</TableCell>
                          <TableCell><Badge variant="outline">{kw.type}</Badge></TableCell>
                          <TableCell>{kw.channel}</TableCell>
                          <TableCell>{kw.volumeEstimate}</TableCell>
                          <TableCell>{kw.difficulty}</TableCell>
                          <TableCell>{kw.cpc}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Expansion */}
          <TabsContent value="expansion">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {result.expansion?.map((exp, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-serif text-lg">{exp.name}</CardTitle>
                      <Badge>{exp.opportunityScore}/10</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">SNI: {exp.sniCode}</p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <p>{exp.why}</p>
                    <div>
                      <p className="text-muted-foreground mb-1">Språk:</p>
                      <div className="flex flex-wrap gap-1">{exp.language?.map((l, j) => <Badge key={j} variant="secondary">{l}</Badge>)}</div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Top sökord:</p>
                      <div className="flex flex-wrap gap-1">{exp.topKeywords?.map((kw, j) => <Badge key={j} variant="outline" className="font-mono">{kw}</Badge>)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Google Ads */}
          <TabsContent value="ads">
            <div className="space-y-6">
              {result.adsStructure?.map((campaign, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">{campaign.campaignName}</CardTitle>
                    <p className="text-xs text-muted-foreground">Segment: {campaign.segment}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {campaign.adGroups.map((ag, j) => (
                      <div key={j} className="rounded border border-border p-3">
                        <h4 className="text-sm font-medium mb-2">{ag.name}</h4>
                        <div className="grid gap-2 md:grid-cols-2">
                          {ag.broadMatch?.length > 0 && (
                            <div><p className="text-xs text-muted-foreground mb-1">Broad Match:</p>
                              <div className="flex flex-wrap gap-1">{ag.broadMatch.map((kw, k) => <Badge key={k} variant="outline" className="font-mono text-xs">{kw}</Badge>)}</div>
                            </div>
                          )}
                          {ag.phraseMatch?.length > 0 && (
                            <div><p className="text-xs text-muted-foreground mb-1">Phrase Match:</p>
                              <div className="flex flex-wrap gap-1">{ag.phraseMatch.map((kw, k) => <Badge key={k} variant="secondary" className="font-mono text-xs">"{kw}"</Badge>)}</div>
                            </div>
                          )}
                          {ag.exactMatch?.length > 0 && (
                            <div><p className="text-xs text-muted-foreground mb-1">Exact Match:</p>
                              <div className="flex flex-wrap gap-1">{ag.exactMatch.map((kw, k) => <Badge key={k} className="font-mono text-xs">[{kw}]</Badge>)}</div>
                            </div>
                          )}
                          {ag.negatives?.length > 0 && (
                            <div><p className="text-xs text-muted-foreground mb-1">Negativa:</p>
                              <div className="flex flex-wrap gap-1">{ag.negatives.map((kw, k) => <Badge key={k} variant="destructive" className="font-mono text-xs">-{kw}</Badge>)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Quick Wins */}
          <TabsContent value="quickwins">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {result.quickWins?.map((qw, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardContent className="p-4 space-y-2">
                    <p className="font-mono text-sm font-medium text-primary">{qw.keyword}</p>
                    <p className="text-xs text-muted-foreground">{qw.reason}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">{qw.channel}</Badge>
                      <Badge variant="secondary">{qw.intent}</Badge>
                      <span className="text-muted-foreground">{qw.volumeEstimate}</span>
                    </div>
                    <p className="text-xs text-foreground border-t border-border pt-2 mt-2">→ {qw.action}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Webscan */}
          {scanData && (
            <TabsContent value="webscan">
              <div className="grid gap-4 md:grid-cols-2">
                {scanData.map((scan, i) => (
                  <Card key={i} className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="font-serif text-lg">{scan.company}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">{scan.domain}</p>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div><p className="text-muted-foreground">Vad de gör:</p><p>{scan.whatTheyDo}</p></div>
                      <div>
                        <p className="text-muted-foreground mb-1">Språk de använder:</p>
                        <div className="flex flex-wrap gap-1">{scan.languageTheyUse?.map((s, j) => <Badge key={j} variant="secondary">{s}</Badge>)}</div>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Troliga behov:</p>
                        <ul className="list-disc pl-4">{scan.likelyNeeds?.map((s, j) => <li key={j}>{s}</li>)}</ul>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Sökintent-hints:</p>
                        <div className="flex flex-wrap gap-1">{scan.searchIntentHints?.map((s, j) => <Badge key={j} variant="outline" className="font-mono">{s}</Badge>)}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
