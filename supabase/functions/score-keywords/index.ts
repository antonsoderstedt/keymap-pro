/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScoreRow = {
  project_id: string;
  keyword: string;
  score: number;
  confidence: number;
  kundfit: number;
  dimension: string;
  intent_class: string;
  volume: number;
  cpc: number | null;
  kd: number | null;
  gsc_clicks: number;
  gsc_position: number | null;
  monthly_value_sek: number;
  sources: string[];
  insufficient_data: boolean;
  scored_at: string;
};

const STOPWORDS = new Set([
  "och", "att", "för", "med", "som", "det", "den", "ett", "till", "från", "inom", "utan", "samt", "eller",
  "the", "and", "for", "with", "from", "you", "vi", "ni", "oss", "er", "av", "på", "i",
]);

const INTENT_PATTERNS = {
  kop: ["pris", "kostnad", "offert", "köpa", "beställ", "leverantör", "erbjudande"],
  jamforelse: ["jämför", "bäst", "skillnad", "alternativ", "vs", "omdöme", "recension"],
  retention: ["support", "service", "uppgradering", "förläng", "underhåll", "manual"],
  problem: ["problem", "felsök", "varför", "hur", "guide", "hjälp", "lösning"],
} as const;

const SNI_V2_TERMS: Array<{ prefix: string; terms: string[]; useCases: string[] }> = [
  { prefix: "24", terms: ["stalproduktion", "metallverk", "smide", "gjutning"], useCases: ["volymbestallning", "specifikation", "certifikat"] },
  { prefix: "25", terms: ["laserkarning", "stalplat", "platbearbetning", "svetsning", "bockning", "rostfritt", "aluminium", "konstruktionstal", "tunnplat", "ror", "profiler"], useCases: ["offert", "prototyp", "liten serie", "snabb leverans", "ritning"] },
  { prefix: "28", terms: ["maskintillverkning", "industrikomponent", "precision", "cnc", "svarvning", "frasning", "mekanisk bearbetning"], useCases: ["specifikation", "ritning", "tolerans", "certifiering"] },
  { prefix: "33", terms: ["reparation", "underhall", "service", "kalibrering", "reservdelar"], useCases: ["akut", "serviceavtal", "forebyggande"] },
  { prefix: "41", terms: ["nybyggnation", "byggföretag", "entreprenad", "totalentreprenad", "byggprojekt", "byggnation"], useCases: ["bygga", "renovera", "projektledning"] },
  { prefix: "43", terms: ["installation", "elinstallation", "vvs", "renovering", "service", "offert"], useCases: ["reparation", "akut", "underhåll"] },
  { prefix: "46", terms: ["grossist", "partihandel", "leverantör", "inköp", "distribution", "lager"], useCases: ["b2b", "volymköp", "leverans"] },
  { prefix: "47", terms: ["köpa", "butik", "online", "erbjudande", "leverans", "fri frakt"], useCases: ["jämföra", "beställa", "recension"] },
  { prefix: "62", terms: ["system", "integration", "it konsult", "automation", "api", "plattform"], useCases: ["implementation", "migrering", "support"] },
  { prefix: "73", terms: ["byrå", "annonsering", "kampanj", "branding", "innehåll", "kommunikation"], useCases: ["generera leads", "öka försäljning", "bygga varumärke"] },
];

function normalizeKeyword(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

function tokenizeTerms(input: unknown): string[] {
  return Array.from(
    new Set(
      String(input || "")
        .toLowerCase()
        .replace(/[^a-z0-9åäö\s-]/gi, " ")
        .split(/\s+/)
        .map((v) => v.trim())
        .filter((v) => v.length >= 3 && !STOPWORDS.has(v)),
    ),
  );
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function classifyIntent(keyword: string): "kop" | "jamforelse" | "retention" | "problem" {
  const k = keyword.toLowerCase();
  const has = (arr: readonly string[]) => arr.some((p) => k.includes(p));
  if (has(INTENT_PATTERNS.retention)) return "retention";
  if (has(INTENT_PATTERNS.kop)) return "kop";
  if (has(INTENT_PATTERNS.jamforelse)) return "jamforelse";
  return "problem";
}

function guessDimension(keyword: string) {
  if (keyword.includes("stockholm") || keyword.includes("göteborg") || keyword.includes("malmö")) return "location";
  if (keyword.includes("problem") || keyword.includes("felsök") || keyword.includes("guide")) return "problem";
  if (keyword.includes("pris") || keyword.includes("offert") || keyword.includes("kostnad")) return "commercial";
  return "service";
}

function sniHints(sniCode: string | null) {
  const normalized = String(sniCode || "").replace(/\s+/g, "").trim();
  if (!normalized) return [] as string[];
  const match = SNI_V2_TERMS.find((item) => normalized.startsWith(item.prefix));
  if (!match) return ["tjänst", "företag", "pris", "offert", "lösning"];
  return [...match.terms, ...match.useCases];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseService);

    const [projectRes, goalsRes, kmRes, semRes, plannerRes, gscRes] = await Promise.all([
      sb.from("projects").select("id,name,company,products,known_segments,sni_code").eq("id", project_id).maybeSingle(),
      sb.from("project_goals").select("conversion_rate_pct,conversion_value").eq("project_id", project_id).maybeSingle(),
      sb.from("keyword_metrics").select("keyword,search_volume,cpc_sek,updated_at").limit(6000),
      sb.from("semrush_metrics").select("keyword,kd,updated_at").limit(6000),
      sb.from("keyword_planner_ideas").select("keyword,avg_monthly_searches,competition_index,low_top_of_page_bid_micros,high_top_of_page_bid_micros,fetched_at").eq("project_id", project_id).order("fetched_at", { ascending: false }).limit(6000),
      sb.from("gsc_snapshots").select("rows,created_at").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (projectRes.error) throw projectRes.error;
    if (!projectRes.data) return json({ error: "project not found" }, 404);

    const project = projectRes.data as any;
    const convRate = clamp(toNum(goalsRes.data?.conversion_rate_pct) / 100, 0.002, 1);
    const convValue = Math.max(1, toNum(goalsRes.data?.conversion_value) || 1000);

    const gscRows = ((gscRes.data as any)?.rows as any[]) || [];
    const gscByKeyword = new Map<string, { clicks: number; position: number | null }>();
    for (const row of gscRows) {
      const keyword = normalizeKeyword(row.query || row.keyword || row.keys?.[0]);
      if (!keyword) continue;
      gscByKeyword.set(keyword, {
        clicks: toNum(row.clicks),
        position: row.position == null ? null : toNum(row.position),
      });
    }

    const customerTerms = new Set<string>([
      ...tokenizeTerms(project.name),
      ...tokenizeTerms(project.company),
      ...tokenizeTerms(project.products),
      ...tokenizeTerms(project.known_segments),
      ...sniHints(project.sni_code ?? null),
    ]);

    const map = new Map<string, { keyword: string; volume: number; cpc: number | null; kd: number | null; plannerComp: number | null; sources: Set<string>; gscClicks: number; gscPosition: number | null }>();

    for (const row of kmRes.data || []) {
      const keyword = normalizeKeyword((row as any).keyword);
      if (!keyword) continue;
      const item = map.get(keyword) || { keyword, volume: 0, cpc: null, kd: null, plannerComp: null, sources: new Set<string>(), gscClicks: 0, gscPosition: null };
      item.volume = Math.max(item.volume, toNum((row as any).search_volume));
      item.cpc = (row as any).cpc_sek ?? item.cpc;
      item.sources.add("DataForSEO");
      map.set(keyword, item);
    }

    for (const row of semRes.data || []) {
      const keyword = normalizeKeyword((row as any).keyword);
      if (!keyword) continue;
      const item = map.get(keyword) || { keyword, volume: 0, cpc: null, kd: null, plannerComp: null, sources: new Set<string>(), gscClicks: 0, gscPosition: null };
      item.kd = (row as any).kd ?? item.kd;
      item.sources.add("Semrush");
      map.set(keyword, item);
    }

    for (const row of plannerRes.data || []) {
      const keyword = normalizeKeyword((row as any).keyword);
      if (!keyword) continue;
      const item = map.get(keyword) || { keyword, volume: 0, cpc: null, kd: null, plannerComp: null, sources: new Set<string>(), gscClicks: 0, gscPosition: null };
      item.volume = Math.max(item.volume, toNum((row as any).avg_monthly_searches));
      item.plannerComp = (row as any).competition_index ?? item.plannerComp;
      if (item.cpc == null) {
        const low = toNum((row as any).low_top_of_page_bid_micros);
        const high = toNum((row as any).high_top_of_page_bid_micros);
        const bidAvg = low > 0 || high > 0 ? (low + high) / 2 / 1_000_000 : 0;
        if (bidAvg > 0) item.cpc = bidAvg;
      }
      item.sources.add("Keyword Planner");
      map.set(keyword, item);
    }

    for (const [keyword, signal] of gscByKeyword.entries()) {
      const item = map.get(keyword) || { keyword, volume: 0, cpc: null, kd: null, plannerComp: null, sources: new Set<string>(), gscClicks: 0, gscPosition: null };
      item.gscClicks = signal.clicks;
      item.gscPosition = signal.position;
      item.sources.add("Search Console");
      map.set(keyword, item);
    }

    const scoredAt = new Date().toISOString();
    const payload: ScoreRow[] = [];

    for (const item of map.values()) {
      const kwTerms = tokenizeTerms(item.keyword);
      const overlap = kwTerms.filter((term) => customerTerms.has(term)).length;
      const sniTermMatch = clamp(overlap / Math.max(1, Math.min(4, kwTerms.length)), 0, 1);
      const intentClass = classifyIntent(item.keyword);

      const journeyFit = intentClass === "kop" ? 1 : intentClass === "jamforelse" ? 0.8 : intentClass === "retention" ? 0.6 : 0.4;
      const gscEngagement = clamp(Math.log10(item.gscClicks + 1) / 3, 0, 1);
      const kundfit = clamp((sniTermMatch * 0.5 + journeyFit * 0.3 + gscEngagement * 0.2) * 100, 0, 100);

      const sourceCount = item.sources.size;
      const rawConf = sourceCount / 6;
      const confidence = Math.round(rawConf * 100);
      const insufficientData = sourceCount < 1 || rawConf < 0.15;
      const confMultiplier = 0.4 + 0.6 * clamp(rawConf, 0, 1);

      const demandScore = clamp(Math.log10(item.volume + 1) * 24, 0, 40);
      const intentBase = intentClass === "kop" ? 15 : intentClass === "jamforelse" ? 8 : intentClass === "retention" ? 5 : 3;
      const intentScore = clamp(intentBase + toNum(item.cpc) * 2, 0, 22);
      const tractionScore = clamp(Math.log10(item.gscClicks + 1) * 9, 0, 18);
      const positionBoost = item.gscPosition != null ? clamp((20 - item.gscPosition) * 0.6, 0, 10) : 0;
      const difficultyPenalty = clamp((toNum(item.kd) * 0.2) + (toNum(item.plannerComp) * 0.08), 0, 28);
      const sourceBonus = clamp(sourceCount * 3, 0, 15);

      let score = clamp((demandScore + intentScore + tractionScore + positionBoost + (kundfit * 0.18) + sourceBonus - difficultyPenalty) * confMultiplier, 0, 100);
      if (insufficientData) score = 0;

      const difficultyFactor = item.kd == null ? 0.75 : clamp((100 - item.kd) / 100, 0.2, 0.95);
      const monthlyValue = Math.round(item.volume * convRate * convValue * 0.25 * difficultyFactor);

      payload.push({
        project_id,
        keyword: item.keyword,
        score,
        confidence,
        kundfit,
        dimension: guessDimension(item.keyword),
        intent_class: intentClass,
        volume: item.volume,
        cpc: item.cpc,
        kd: item.kd,
        gsc_clicks: item.gscClicks,
        gsc_position: item.gscPosition,
        monthly_value_sek: monthlyValue,
        sources: Array.from(item.sources),
        insufficient_data: insufficientData,
        scored_at: scoredAt,
      });
    }

    if (payload.length) {
      const { error: upsertError } = await sb
        .from("keyword_scores")
        .upsert(payload as any, { onConflict: "project_id,keyword" });
      if (upsertError) throw upsertError;
    }

    return json({ ok: true, count: payload.length, scored_at: scoredAt });
  } catch (e) {
    console.error("score-keywords error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
