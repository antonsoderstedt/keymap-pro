import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, Network, Sparkles, Megaphone, FileText, MapPin, Ban, Search, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { KeywordUniverse, UniverseKeyword } from "@/lib/types";
import { AdsExportModal } from "@/components/universe/AdsExportModal";
import { StrategyTab } from "@/components/universe/StrategyTab";

const DIMENSION_LABELS: Record<string, string> = {
  produkt: "Produkt", tjanst: "Tjänst", bransch: "Bransch", material: "Material",
  problem: "Problem", losning: "Lösning", location: "Geografi", kundsegment: "Kundsegment",
  use_case: "Use case", kommersiell: "Kommersiell", fraga: "Fråga", konkurrent: "Konkurrent",
};

const INTENT_LABELS: Record<string, string> = {
  informational: "Info", commercial: "Kommersiell", transactional: "Transaktionell", navigational: "Navigations",
};

const PRIORITY_COLOR: Record<string, string> = {
  high: "default", medium: "secondary", low: "outline",
};

export default function KeywordUniversePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [universe, setUniverse] = useState<KeywordUniverse | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [adsModalOpen, setAdsModalOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [intent, setIntent] = useState<string>("all");
  const [funnel, setFunnel] = useState<string>("all");
  const [dimension, setDimension] = useState<string>("all");
  const [channel, setChannel] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [hideZeroVolume, setHideZeroVolume] = useState(true);
  const [onlyReal, setOnlyReal] = useState(false);
  const [onlyGap, setOnlyGap] = useState(false);
  const [maxKd, setMaxKd] = useState<string>("100");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = async () => {
    const { data: project } = await supabase.from("projects").select("name").eq("id", id!).single();
    if (project) setProjectName((project as any).name);
    const { data, error } = await supabase
      .from("analyses")
      .select("id, keyword_universe_json")
      .eq("project_id", id!)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) {
      toast({ title: "Inget universe hittat", description: "Kör analysen med Keyword Universe aktiverat.", variant: "destructive" });
      setLoading(false);
      return;
    }
    setAnalysisId((data as any).id);
    setUniverse((data as any).keyword_universe_json as KeywordUniverse | null);
    setLoading(false);
  };

  const filtered = useMemo<UniverseKeyword[]>(() => {
    if (!universe) return [];
    const kdLimit = Number(maxKd) || 100;
    return universe.keywords.filter((k) => {
      if (search && !k.keyword.includes(search.toLowerCase())) return false;
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
    }).sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
  }, [universe, search, intent, funnel, dimension, channel, priority, hideZeroVolume, onlyReal, onlyGap, maxKd]);

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportFiltered = (filename = "keyword-universe.csv") => {
    if (filtered.length === 0) {
      toast({ title: "Inga sökord", description: "Filtret matchar inga sökord.", variant: "destructive" });
      return;
    }
    const rows = [["Sökord", "Kluster", "Dimension", "Intent", "Funnel", "Prioritet", "Kanal", "Volym/mån", "CPC (SEK)", "Konkurrens", "KD%", "Konkurrent-gap", "SERP features", "Top domäner", "Datakälla", "Landningssida", "Annonsgrupp", "Contentidé", "Negativt"]];
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
    downloadCSV(rows, filename);
    toast({ title: "Export klar", description: `${filtered.length} sökord exporterade` });
  };

  // Curated views
  const priorityKeywords = useMemo(() => (universe?.keywords || []).filter((k) =>
    k.priority === "high" && !k.isNegative
  ).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);

  const seoOpps = useMemo(() => (universe?.keywords || []).filter((k) =>
    (k.channel === "SEO" || k.channel === "Landing Page") && !k.isNegative && (k.searchVolume ?? 0) > 0
  ).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);

  const adsOpps = useMemo(() => (universe?.keywords || []).filter((k) =>
    k.channel === "Google Ads" && !k.isNegative && k.intent === "transactional"
  ).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);

  const contentOpps = useMemo(() => (universe?.keywords || []).filter((k) =>
    k.channel === "Content" && !k.isNegative
  ).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);

  const localOpps = useMemo(() => (universe?.keywords || []).filter((k) =>
    k.channel === "Lokal SEO" && !k.isNegative
  ).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);

  const negatives = useMemo(() => (universe?.keywords || []).filter((k) => k.isNegative), [universe]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="h-8 w-8 rounded-full bg-primary animate-pulse-glow" /></div>;
  }

  if (!universe) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Inget Keyword Universe hittat för detta projekt.</p>
        <p className="text-xs text-muted-foreground">Kör en ny analys med modulen "Keyword Universe (skalad)" aktiverad.</p>
        <Button onClick={() => navigate(`/project/${id}/results`)} variant="outline">Tillbaka till resultat</Button>
      </div>
    );
  }

  const dimensions = Array.from(new Set(universe.keywords.map((k) => k.dimension)));
  const channels = Array.from(new Set(universe.keywords.map((k) => k.channel)));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/project/${id}/results`}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                <h1 className="font-serif text-xl">Keyword Universe</h1>
              </div>
              <p className="text-xs text-muted-foreground">
                {projectName} • {universe.totalKeywords} sökord • {universe.totalEnriched} berikade • skala: {universe.scale}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => exportFiltered()} className="gap-2">
            <Download className="h-3 w-3" /> Exportera ({filtered.length})
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-3 md:grid-cols-5">
          <StatCard icon={<Sparkles className="h-4 w-4" />} label="Prioriterade" value={priorityKeywords.length} />
          <StatCard icon={<FileText className="h-4 w-4" />} label="SEO" value={seoOpps.length} />
          <StatCard icon={<Megaphone className="h-4 w-4" />} label="Google Ads" value={adsOpps.length} />
          <StatCard icon={<MapPin className="h-4 w-4" />} label="Lokal SEO" value={localOpps.length} />
          <StatCard icon={<Ban className="h-4 w-4" />} label="Negativa" value={negatives.length} />
        </div>

        <Tabs defaultValue="universe">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="universe" className="gap-1"><Network className="h-3 w-3" />Universe</TabsTrigger>
            <TabsTrigger value="priority" className="gap-1"><Sparkles className="h-3 w-3" />Prioriterade</TabsTrigger>
            <TabsTrigger value="seo" className="gap-1"><FileText className="h-3 w-3" />SEO</TabsTrigger>
            <TabsTrigger value="ads" className="gap-1"><Megaphone className="h-3 w-3" />Google Ads</TabsTrigger>
            <TabsTrigger value="content" className="gap-1"><FileText className="h-3 w-3" />Content</TabsTrigger>
            <TabsTrigger value="local" className="gap-1"><MapPin className="h-3 w-3" />Lokal</TabsTrigger>
            <TabsTrigger value="negatives" className="gap-1"><Ban className="h-3 w-3" />Negativa</TabsTrigger>
          </TabsList>

          {/* Universe — full filtered table */}
          <TabsContent value="universe" className="space-y-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 grid gap-3 md:grid-cols-4 lg:grid-cols-6">
                <div className="md:col-span-2">
                  <Label className="text-xs">Sök</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrera sökord..." className="pl-7" />
                  </div>
                </div>
                <FilterSelect label="Intent" value={intent} onChange={setIntent} options={[["all","Alla"],["informational","Info"],["commercial","Kommersiell"],["transactional","Transaktionell"],["navigational","Navigations"]]} />
                <FilterSelect label="Funnel" value={funnel} onChange={setFunnel} options={[["all","Alla"],["awareness","Awareness"],["consideration","Consideration"],["conversion","Conversion"]]} />
                <FilterSelect label="Dimension" value={dimension} onChange={setDimension} options={[["all","Alla"], ...dimensions.map<[string,string]>((d) => [d, DIMENSION_LABELS[d] || d])]} />
                <FilterSelect label="Kanal" value={channel} onChange={setChannel} options={[["all","Alla"], ...channels.map<[string,string]>((c) => [c, c])]} />
                <FilterSelect label="Prioritet" value={priority} onChange={setPriority} options={[["all","Alla"],["high","Hög"],["medium","Medium"],["low","Låg"]]} />
                <div className="flex items-center gap-2 md:col-span-2">
                  <Switch id="zero" checked={hideZeroVolume} onCheckedChange={setHideZeroVolume} />
                  <Label htmlFor="zero" className="text-xs cursor-pointer">Dölj 0-volym</Label>
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <Switch id="real" checked={onlyReal} onCheckedChange={setOnlyReal} />
                  <Label htmlFor="real" className="text-xs cursor-pointer">Endast verklig data</Label>
                </div>
              </CardContent>
            </Card>

            <KeywordTable items={filtered} />
          </TabsContent>

          <TabsContent value="priority"><KeywordTable items={priorityKeywords} /></TabsContent>
          <TabsContent value="seo"><KeywordTable items={seoOpps} /></TabsContent>
          <TabsContent value="ads"><KeywordTable items={adsOpps} /></TabsContent>
          <TabsContent value="content"><KeywordTable items={contentOpps} /></TabsContent>
          <TabsContent value="local"><KeywordTable items={localOpps} /></TabsContent>
          <TabsContent value="negatives"><KeywordTable items={negatives} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
        <div className="font-mono text-2xl mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
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

function KeywordTable({ items }: { items: UniverseKeyword[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Inga sökord matchar.</p>;
  }
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sökord</TableHead>
              <TableHead className="text-right">Volym</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead>Dimension</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Funnel</TableHead>
              <TableHead>Prioritet</TableHead>
              <TableHead>Kanal</TableHead>
              <TableHead>Kluster</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 500).map((k, i) => (
              <TableRow key={i} className={k.isNegative ? "opacity-60" : ""}>
                <TableCell className="font-mono text-sm">
                  {k.keyword}
                  {k.dataSource !== "real" && <Badge variant="outline" className="ml-2 text-[10px]">Uppskattad</Badge>}
                  {k.isNegative && <Badge variant="destructive" className="ml-2 text-[10px]">Negativ</Badge>}
                </TableCell>
                <TableCell className="text-right font-mono">{k.searchVolume ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">{k.cpc != null ? k.cpc.toFixed(2) : "—"}</TableCell>
                <TableCell><Badge variant="outline">{DIMENSION_LABELS[k.dimension] || k.dimension}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{INTENT_LABELS[k.intent] || k.intent}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{k.funnelStage}</TableCell>
                <TableCell><Badge variant={(PRIORITY_COLOR[k.priority] as any) || "outline"}>{k.priority}</Badge></TableCell>
                <TableCell className="text-xs">{k.channel}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={k.cluster}>{k.cluster}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items.length > 500 && (
          <p className="text-xs text-muted-foreground text-center py-3 border-t border-border">
            Visar 500 av {items.length} — exportera CSV för komplett lista
          </p>
        )}
      </CardContent>
    </Card>
  );
}
