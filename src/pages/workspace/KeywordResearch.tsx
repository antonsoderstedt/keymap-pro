import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDataSourcesStatus } from "@/hooks/useDataSourcesStatus";
import { downloadCsv, toCsv } from "@/lib/csv";

type ResearchRow = {
  keyword: string;
  score: number;
  confidence: number;
  customerRelevance: number;
  sources: string[];
  volume: number;
  cpc: number | null;
  kd: number | null;
  plannerCompetitionIndex: number | null;
  gscClicks: number;
  gscCtr: number | null;
  gscPosition: number | null;
  estimatedMonthlyValue: number;
  updatedAt: string | null;
};

type GoalsData = {
  conversion_rate_pct: number;
  conversion_value: number;
  currency: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toLowerKeyword(v: string | null | undefined) {
  return String(v || "").trim().toLowerCase();
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const parsed = Number(v || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtMoney(v: number, currency = "SEK") {
  return `${Math.round(v).toLocaleString("sv-SE")} ${currency}`;
}

function sourceBadgeTone(status: string): "secondary" | "destructive" | "outline" {
  if (status === "ok") return "secondary";
  if (status === "error" || status === "reauth_required") return "destructive";
  return "outline";
}

const STOPWORDS = new Set([
  "och", "att", "för", "med", "som", "det", "den", "ett", "till", "från", "inom", "utan", "samt", "eller",
  "your", "our", "the", "and", "for", "with", "from", "you", "vi", "ni", "oss", "er", "av", "på", "i",
]);

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function tokenizeTerms(input: string | null | undefined): string[] {
  return unique(
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9åäö\s-]/gi, " ")
      .split(/\s+/)
      .map((v) => v.trim())
      .filter((v) => v.length >= 3 && !STOPWORDS.has(v)),
  );
}

function parseCsvish(input: string | null | undefined): string[] {
  return unique(
    String(input || "")
      .split(/[\n,;|]+/)
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length >= 3),
  );
}

const SNI_V2_TERMS: Array<{ prefix: string; terms: string[]; useCases: string[] }> = [
  { prefix: "41", terms: ["nybyggnation", "byggföretag", "entreprenad", "totalentreprenad", "byggprojekt", "byggnation"], useCases: ["bygga", "renovera", "projektledning"] },
  { prefix: "42", terms: ["anläggning", "infrastruktur", "markarbete", "asfaltering", "vägbygge", "ledning"], useCases: ["upphandling", "entreprenad", "drift"] },
  { prefix: "43", terms: ["installation", "elinstallation", "vvs", "renovering", "service", "offert"], useCases: ["reparation", "akut", "underhåll"] },
  { prefix: "45", terms: ["bilservice", "verkstad", "däck", "bilreparation", "reservdelar", "begagnad bil"], useCases: ["boka tid", "jämför pris", "närservice"] },
  { prefix: "46", terms: ["grossist", "partihandel", "leverantör", "inköp", "distribution", "lager"], useCases: ["b2b", "volymköp", "leverans"] },
  { prefix: "47", terms: ["köpa", "butik", "online", "erbjudande", "leverans", "fri frakt"], useCases: ["jämföra", "beställa", "recension"] },
  { prefix: "55", terms: ["hotell", "boende", "övernattning", "weekend", "spa", "konferens"], useCases: ["boka", "nära", "paket"] },
  { prefix: "56", terms: ["restaurang", "catering", "lunch", "middag", "takeaway", "bordsbokning"], useCases: ["boka bord", "meny", "öppet idag"] },
  { prefix: "62", terms: ["system", "integration", "it konsult", "automation", "api", "plattform"], useCases: ["implementation", "migrering", "support"] },
  { prefix: "63", terms: ["digital marknadsföring", "seo", "analys", "data", "spårning", "insikter"], useCases: ["optimera", "mäta", "rapportera"] },
  { prefix: "68", terms: ["mäklare", "fastighet", "lokal", "hyra", "värdering", "bostad"], useCases: ["sälja", "köpa", "investera"] },
  { prefix: "69", terms: ["redovisning", "bokföring", "juridik", "rådgivning", "deklaration", "konsult"], useCases: ["hjälp", "outsourcing", "företag"] },
  { prefix: "70", terms: ["strategi", "management", "konsult", "förändring", "tillväxt", "ledning"], useCases: ["workshop", "roadmap", "upplägg"] },
  { prefix: "71", terms: ["arkitekt", "konstruktion", "projektering", "ritning", "teknikkonsult", "besiktning"], useCases: ["planera", "bygga", "krav"] },
  { prefix: "73", terms: ["byrå", "annonsering", "kampanj", "branding", "innehåll", "kommunikation"], useCases: ["generera leads", "öka försäljning", "bygga varumärke"] },
  { prefix: "74", terms: ["design", "foto", "produktion", "kreativ", "grafisk", "varumärke"], useCases: ["ta fram", "förnya", "paketera"] },
  { prefix: "81", terms: ["städning", "facility", "kontorsstäd", "fönsterputs", "skötsel", "serviceavtal"], useCases: ["abonnemang", "upphandling", "pris per timme"] },
  { prefix: "85", terms: ["utbildning", "kurs", "certifiering", "lärande", "workshop", "kompetens"], useCases: ["online", "företag", "distans"] },
  { prefix: "86", terms: ["hälsovård", "klinik", "behandling", "vård", "specialist", "mottagning"], useCases: ["boka", "symptom", "nära mig"] },
  { prefix: "96", terms: ["frisör", "skönhet", "wellness", "massage", "behandling", "bokning"], useCases: ["tid", "prislista", "erbjudande"] },
];

function sniTermHints(code: string): string[] {
  const normalized = code.replace(/\s+/g, "").trim();
  if (!normalized) return [];
  const match = SNI_V2_TERMS.find((item) => normalized.startsWith(item.prefix));
  if (!match) return ["tjänst", "företag", "pris", "offert", "lösning"];
  return [...match.terms, ...match.useCases];
}

function sniBehaviorPatterns(code: string, terms: string[]): string[] {
  const normalized = code.replace(/\s+/g, "").trim();
  const match = SNI_V2_TERMS.find((item) => normalized.startsWith(item.prefix));
  const domainTerms = terms.slice(0, 12);
  const useCases = match?.useCases || ["hjälp", "pris", "offert"];
  const patterns: string[] = [];

  for (const term of domainTerms) {
    patterns.push(`hur fungerar ${term}`);
    patterns.push(`vad kostar ${term}`);
    patterns.push(`${term} för företag`);
    patterns.push(`${term} guide`);
    patterns.push(`bästa ${term}`);
    for (const useCase of useCases.slice(0, 3)) {
      patterns.push(`${term} ${useCase}`);
    }
  }
  return unique(patterns);
}

function buildCustomerSeedKeywords(params: {
  terms: string[];
  market: string;
  notes: string;
  sni: string;
  languageHints: string[];
}): string[] {
  const intentSuffix = ["pris", "kostnad", "offert", "bäst", "företag", "guide", "jämförelse"];
  const baseTerms = unique([
    ...params.terms,
    ...tokenizeTerms(params.notes),
    ...sniTermHints(params.sni),
  ]).slice(0, 40);
  const behaviorPatterns = sniBehaviorPatterns(params.sni, baseTerms);

  const market = params.market.trim().toLowerCase();
  const seeds: string[] = [];
  for (const term of baseTerms) {
    seeds.push(term);
    if (market) seeds.push(`${term} ${market}`);
    for (const suffix of intentSuffix) {
      seeds.push(`${term} ${suffix}`);
    }
    for (const hint of params.languageHints.slice(0, 4)) {
      seeds.push(`${term} ${hint}`);
    }
  }
  seeds.push(...behaviorPatterns);
  return unique(seeds.filter((v) => v.length >= 3)).slice(0, 300);
}

export default function KeywordResearch() {
  const { id } = useParams<{ id: string }>();
  const { data: sourceStatus } = useDataSourcesStatus(id);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ResearchRow[]>([]);
  const [query, setQuery] = useState("");
  const [sniCode, setSniCode] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [generatedSeeds, setGeneratedSeeds] = useState<string[]>([]);
  const [profilePreview, setProfilePreview] = useState<string>("");
  const [goals, setGoals] = useState<GoalsData>({
    conversion_rate_pct: 2.5,
    conversion_value: 1200,
    currency: "SEK",
  });

  const runResearch = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [dfsRes, semrushRes, plannerRes, gscRes, ga4Res, goalsRes, projectRes] = await Promise.all([
        supabase
          .from("keyword_metrics")
          .select("keyword,search_volume,cpc_sek,competition,updated_at")
          .limit(4000),
        supabase
          .from("semrush_metrics")
          .select("keyword,kd,updated_at")
          .limit(4000),
        supabase
          .from("keyword_planner_ideas")
          .select("keyword,avg_monthly_searches,competition_index,low_top_of_page_bid_micros,high_top_of_page_bid_micros,fetched_at")
          .eq("project_id", id)
          .order("fetched_at", { ascending: false })
          .limit(4000),
        supabase
          .from("gsc_snapshots")
          .select("rows,created_at")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("ga4_snapshots")
          .select("totals,created_at")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("project_goals")
          .select("conversion_rate_pct,conversion_value,currency")
          .eq("project_id", id)
          .maybeSingle(),
        supabase
          .from("projects")
          .select("name,company,description,products,known_segments,competitors,market,domain")
          .eq("id", id)
          .maybeSingle(),
      ]);

      if (dfsRes.error || semrushRes.error || plannerRes.error || gscRes.error || ga4Res.error || goalsRes.error || projectRes.error) {
        throw new Error(
          dfsRes.error?.message ||
            semrushRes.error?.message ||
            plannerRes.error?.message ||
            gscRes.error?.message ||
            ga4Res.error?.message ||
            goalsRes.error?.message ||
            projectRes.error?.message ||
            "Kunde inte köra keyword research",
        );
      }

      const project = projectRes.data;
      const projectTerms = unique([
        ...tokenizeTerms(project?.name),
        ...tokenizeTerms(project?.company),
        ...tokenizeTerms(project?.description),
        ...parseCsvish(project?.products),
        ...parseCsvish(project?.known_segments),
        ...parseCsvish(project?.competitors),
      ]).slice(0, 80);

      const gscRows = ((gscRes.data?.rows as any[]) || []).slice(0, 5000);
      const languageHintCounts = new Map<string, number>();
      for (const row of gscRows) {
        const parts = tokenizeTerms(row.query);
        const first = parts[0];
        if (first) languageHintCounts.set(first, (languageHintCounts.get(first) || 0) + 1);
      }
      const languageHints = Array.from(languageHintCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);

      const customerSeedKeywords = buildCustomerSeedKeywords({
        terms: projectTerms,
        market: project?.market || "",
        notes: customerNotes,
        sni: sniCode,
        languageHints,
      });
      setGeneratedSeeds(customerSeedKeywords);
      setProfilePreview([project?.company, project?.market, project?.domain].filter(Boolean).join(" · "));

      const goalsData = {
        conversion_rate_pct: toNum(goalsRes.data?.conversion_rate_pct) || 2.5,
        conversion_value: toNum(goalsRes.data?.conversion_value) || 1200,
        currency: goalsRes.data?.currency || "SEK",
      };
      setGoals(goalsData);

      const map = new Map<string, Partial<ResearchRow>>();

      for (const row of dfsRes.data || []) {
        const keyword = toLowerKeyword(row.keyword);
        if (!keyword) continue;
        const existing = map.get(keyword) || { keyword, sources: [] };
        existing.volume = Math.max(toNum(existing.volume), toNum(row.search_volume));
        existing.cpc = row.cpc_sek ?? existing.cpc ?? null;
        existing.updatedAt = row.updated_at || existing.updatedAt || null;
        existing.sources = Array.from(new Set([...(existing.sources || []), "DataForSEO"]));
        map.set(keyword, existing);
      }

      for (const row of semrushRes.data || []) {
        const keyword = toLowerKeyword(row.keyword);
        if (!keyword) continue;
        const existing = map.get(keyword) || { keyword, sources: [] };
        existing.kd = row.kd ?? existing.kd ?? null;
        existing.updatedAt = row.updated_at || existing.updatedAt || null;
        existing.sources = Array.from(new Set([...(existing.sources || []), "Semrush"]));
        map.set(keyword, existing);
      }

      for (const row of plannerRes.data || []) {
        const keyword = toLowerKeyword(row.keyword);
        if (!keyword) continue;
        const existing = map.get(keyword) || { keyword, sources: [] };
        const plannerVolume = toNum(row.avg_monthly_searches);
        existing.volume = Math.max(toNum(existing.volume), plannerVolume);
        existing.plannerCompetitionIndex = row.competition_index ?? existing.plannerCompetitionIndex ?? null;

        if (existing.cpc == null) {
          const low = toNum(row.low_top_of_page_bid_micros);
          const high = toNum(row.high_top_of_page_bid_micros);
          const bidAvg = low > 0 || high > 0 ? (low + high) / 2 / 1_000_000 : 0;
          existing.cpc = bidAvg > 0 ? bidAvg : null;
        }

        existing.updatedAt = row.fetched_at || existing.updatedAt || null;
        existing.sources = Array.from(new Set([...(existing.sources || []), "Keyword Planner"]));
        map.set(keyword, existing);
      }

      for (const row of gscRows) {
        const keyword = toLowerKeyword(row.query);
        if (!keyword) continue;
        const existing = map.get(keyword) || { keyword, sources: [] };
        existing.gscClicks = toNum(existing.gscClicks) + toNum(row.clicks);
        if (existing.gscCtr == null && row.ctr != null) existing.gscCtr = toNum(row.ctr);
        if (existing.gscPosition == null && row.position != null) existing.gscPosition = toNum(row.position);
        existing.sources = Array.from(new Set([...(existing.sources || []), "Search Console"]));
        map.set(keyword, existing);
      }

      const existingVolumes = Array.from(map.values()).map((v) => toNum(v.volume)).filter((v) => v > 0);
      const fallbackVolume = existingVolumes.length
        ? Math.max(10, Math.round(existingVolumes.reduce((sum, n) => sum + n, 0) / existingVolumes.length * 0.05))
        : 15;

      for (const seed of customerSeedKeywords) {
        const keyword = toLowerKeyword(seed);
        if (!keyword) continue;
        const existing = map.get(keyword) || { keyword, sources: [] };
        if (toNum(existing.volume) === 0) existing.volume = fallbackVolume;
        existing.sources = Array.from(new Set([...(existing.sources || []), "Customer Profile"]));
        existing.updatedAt = existing.updatedAt || new Date().toISOString();
        map.set(keyword, existing);
      }

      const ga4Totals = (ga4Res.data?.totals as Record<string, unknown> | null) || null;
      const ga4Sessions = toNum(ga4Totals?.sessions || ga4Totals?.screenPageViews || ga4Totals?.totalUsers || 0);
      const ga4Conversions = toNum(ga4Totals?.conversions || 0);
      const ga4BusinessSignal = clamp(Math.log10(ga4Sessions + ga4Conversions + 1) * 4, 0, 20);

      const result: ResearchRow[] = Array.from(map.values())
        .map((entry) => {
          const volume = toNum(entry.volume);
          const cpc = entry.cpc ?? null;
          const kd = entry.kd ?? null;
          const plannerComp = entry.plannerCompetitionIndex ?? null;
          const gscClicks = toNum(entry.gscClicks);
          const gscCtr = entry.gscCtr ?? null;
          const gscPos = entry.gscPosition ?? null;
          const keywordTerms = tokenizeTerms(entry.keyword);
          const overlap = keywordTerms.filter((term) => projectTerms.includes(term)).length;
          const customerRelevance = clamp(overlap / Math.max(1, Math.min(4, keywordTerms.length)), 0, 1);

          const demandScore = clamp(Math.log10(volume + 1) * 24, 0, 40);
          const intentScore = clamp(toNum(cpc) * 2.8, 0, 22);
          const tractionScore = clamp(Math.log10(gscClicks + 1) * 9, 0, 18);
          const positionBoost = gscPos != null ? clamp((20 - gscPos) * 0.6, 0, 10) : 0;
          const customerBoost = customerRelevance * 18;
          const difficultyPenalty = clamp((toNum(kd) * 0.2) + (toNum(plannerComp) * 0.08), 0, 28);
          const sourceBonus = clamp((entry.sources?.length || 0) * 3, 0, 15);

          const score = clamp(
            demandScore + intentScore + tractionScore + positionBoost + customerBoost + ga4BusinessSignal + sourceBonus - difficultyPenalty,
            0,
            100,
          );

          const confidence = clamp(((entry.sources?.length || 0) / 6) * 100, 15, 100);

          const convRate = goalsData.conversion_rate_pct / 100;
          const convValue = goalsData.conversion_value;
          const difficultyFactor = kd == null ? 0.75 : clamp((100 - kd) / 100, 0.2, 0.95);
          const estimatedMonthlyValue = volume * convRate * convValue * 0.25 * difficultyFactor;

          return {
            keyword: entry.keyword || "",
            score,
            confidence,
            customerRelevance,
            sources: entry.sources || [],
            volume,
            cpc,
            kd,
            plannerCompetitionIndex: plannerComp,
            gscClicks,
            gscCtr,
            gscPosition: gscPos,
            estimatedMonthlyValue,
            updatedAt: entry.updatedAt || null,
          };
        })
        .filter((r) => r.keyword && r.volume > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 500);

      setRows(result);
      toast.success(`Research klar: ${result.length} prioriterade sökord`);
    } catch (e: any) {
      toast.error(e?.message || "Keyword research misslyckades");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.keyword.includes(q));
  }, [rows, query]);

  const avgConfidence = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length);
  }, [rows]);

  const highPriorityCount = useMemo(() => rows.filter((r) => r.score >= 70).length, [rows]);

  const sourceCoverage = useMemo(() => {
    const out: Record<string, number> = {
      "Keyword Planner": 0,
      "DataForSEO": 0,
      "Semrush": 0,
      "Search Console": 0,
      "GA4": 0,
      "Customer Profile": 0,
    };
    for (const row of rows) {
      for (const source of row.sources) {
        if (out[source] != null) out[source] += 1;
      }
    }
    if (rows.length) {
      out["GA4"] = rows.length;
    }
    return out;
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Keyword Research Studio</h1>
        <p className="text-sm text-muted-foreground">
          En samlad researchyta som väger ihop Keyword Planner, DataForSEO, Semrush, GA4, Search Console och kundmål till en
          prioriterad keywordlista.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kör samlad analys</CardTitle>
          <CardDescription>
            Systemet hämtar alla tillgängliga källor och beräknar score, confidence och estimerat månadsvärde.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">SNI-kod (valfritt)</p>
              <Input
                value={sniCode}
                onChange={(e) => setSniCode(e.target.value)}
                placeholder="t.ex. 43210"
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Kundinsikt / noteringar</p>
              <Textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Vad är viktigast för kunden, hur köper de, vilka tjänster/produkter driver affären?"
                className="min-h-20"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runResearch} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Kör analys..." : "Kör keyword research"}
          </Button>
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => {
              const csv = toCsv(
                rows.map((r) => ({
                  keyword: r.keyword,
                  score: r.score,
                  confidence: r.confidence,
                  volume: r.volume,
                  cpc: r.cpc,
                  kd: r.kd,
                  planner_competition_index: r.plannerCompetitionIndex,
                  gsc_clicks: r.gscClicks,
                  estimated_monthly_value: Math.round(r.estimatedMonthlyValue),
                  sources: r.sources.join(" | "),
                })),
              );
              downloadCsv(`keyword-research-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            Modell: score 0-100, confidence baserad på källtäckning.
          </div>
          </div>
          {profilePreview && (
            <p className="text-xs text-muted-foreground">Kundprofil: {profilePreview}</p>
          )}
        </CardContent>
      </Card>

      {!!generatedSeeds.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kundgenererade seed-sökord</CardTitle>
            <CardDescription>
              Byggs från kunddata, SNI-hints, produkter/segment och språk i befintliga sökningar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-xs text-muted-foreground">{generatedSeeds.length} seed-sökord genererade</div>
            <div className="flex flex-wrap gap-1.5">
              {generatedSeeds.slice(0, 60).map((seed) => (
                <Badge key={seed} variant="outline" className="text-[10px]">{seed}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prioriterade sökord</CardDescription>
            <CardTitle className="text-xl">{rows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hög prioritet (score ≥ 70)</CardDescription>
            <CardTitle className="text-xl">{highPriorityCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Snitt confidence</CardDescription>
            <CardTitle className="text-xl">{avgConfidence}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={avgConfidence} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Standardvärde per konvertering</CardDescription>
            <CardTitle className="text-xl">{fmtMoney(goals.conversion_value, goals.currency)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datakällor och coverage</CardTitle>
          <CardDescription>Visar status i datakällor och hur många keywords som stöds per källa i analysen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(sourceStatus?.sources || []).map((s) => (
              <Badge key={s.source} variant={sourceBadgeTone(s.status)}>
                {s.source}: {s.status}
              </Badge>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-5 text-sm">
            {Object.entries(sourceCoverage).map(([name, count]) => (
              <div key={name} className="rounded border px-3 py-2">
                <div className="text-muted-foreground text-xs">{name}</div>
                <div className="font-medium">{count.toLocaleString("sv-SE")}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prioriteringslista</CardTitle>
          <CardDescription>Filtrera och granska samlad ranking med signaler från samtliga källor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrera keywords"
              className="pl-7"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="text-right">Kundfit</TableHead>
                <TableHead className="text-right">Volym</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">KD</TableHead>
                <TableHead className="text-right">GSC klick</TableHead>
                <TableHead className="text-right">Månadsvärde</TableHead>
                <TableHead>Källor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((row) => (
                <TableRow key={row.keyword}>
                  <TableCell className="font-medium">{row.keyword}</TableCell>
                  <TableCell className="text-right">{Math.round(row.score)}</TableCell>
                  <TableCell className="text-right">{Math.round(row.confidence)}%</TableCell>
                  <TableCell className="text-right">{Math.round(row.customerRelevance * 100)}%</TableCell>
                  <TableCell className="text-right">{row.volume.toLocaleString("sv-SE")}</TableCell>
                  <TableCell className="text-right">{row.cpc == null ? "-" : row.cpc.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{row.kd == null ? "-" : Math.round(row.kd)}</TableCell>
                  <TableCell className="text-right">{row.gscClicks.toLocaleString("sv-SE")}</TableCell>
                  <TableCell className="text-right">{fmtMoney(row.estimatedMonthlyValue, goals.currency)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.sources.map((source) => (
                        <Badge key={source} variant="outline" className="text-[10px]">
                          {source}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
