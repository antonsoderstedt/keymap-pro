/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExpandRequest = {
  project_id: string;
  seed: string;
  mode?: "keyword" | "url";
  depth?: "quick" | "full";
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

function tokenize(v: unknown) {
  return normalize(v)
    .replace(/[^a-z0-9åäö\s-]/gi, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function scoreMatch(keyword: string, seedTerms: string[]) {
  const k = normalize(keyword);
  if (!k) return 0;
  const terms = tokenize(k);
  const overlap = terms.filter((t) => seedTerms.includes(t)).length;
  return overlap + (k.includes(seedTerms.join(" ")) ? 1 : 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as ExpandRequest;
    if (!body.project_id) return json({ error: "project_id required" }, 400);
    if (!body.seed?.trim()) return json({ error: "seed required" }, 400);

    const mode = body.mode || "keyword";
    const depth = body.depth || "quick";
    const limit = depth === "full" ? 500 : 50;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseService);

    const seedTerms = tokenize(body.seed);
    const domainTerm = mode === "url"
      ? normalize(body.seed).replace(/^https?:\/\//, "").split("/")[0]?.split(".")[0]
      : "";

    const [metricsRes, semrushRes, plannerRes] = await Promise.all([
      sb.from("keyword_metrics").select("keyword,search_volume,cpc_sek,updated_at").limit(3000),
      sb.from("semrush_metrics").select("keyword,kd,updated_at").limit(3000),
      sb.from("keyword_planner_ideas")
        .select("keyword,avg_monthly_searches,competition_index,low_top_of_page_bid_micros,high_top_of_page_bid_micros")
        .eq("project_id", body.project_id)
        .order("fetched_at", { ascending: false })
        .limit(3000),
    ]);

    if (metricsRes.error) console.error("keyword_metrics error", metricsRes.error);
    if (semrushRes.error) console.error("semrush_metrics error", semrushRes.error);
    if (plannerRes.error) console.error("keyword_planner_ideas error", plannerRes.error);

    const byKeyword = new Map<string, any>();

    for (const row of plannerRes.data || []) {
      const keyword = normalize((row as any).keyword);
      if (!keyword) continue;
      const item = byKeyword.get(keyword) || {
        keyword, score: 0, confidence: 0, kundfit: 0,
        intent_class: "problem", dimension: "service",
        volume: 0, cpc: null, kd: null, monthly_value_sek: 0, sources: [],
      };
      item.volume = Math.max(Number(item.volume || 0), Number((row as any).avg_monthly_searches || 0));
      if (item.cpc == null) {
        const low = Number((row as any).low_top_of_page_bid_micros || 0);
        const high = Number((row as any).high_top_of_page_bid_micros || 0);
        const bidAvg = low > 0 || high > 0 ? (low + high) / 2 / 1_000_000 : 0;
        if (bidAvg > 0) item.cpc = bidAvg;
      }
      item.sources = Array.from(new Set([...(item.sources || []), "keyword_planner"]));
      byKeyword.set(keyword, item);
    }

    for (const row of metricsRes.data || []) {
      const keyword = normalize((row as any).keyword);
      if (!keyword) continue;
      const item = byKeyword.get(keyword) || {
        keyword, score: 0, confidence: 0, kundfit: 0,
        intent_class: "problem", dimension: "service",
        volume: 0, cpc: null, kd: null, monthly_value_sek: 0, sources: [],
      };
      item.volume = Math.max(Number(item.volume || 0), Number((row as any).search_volume || 0));
      item.cpc = item.cpc ?? (row as any).cpc_sek ?? null;
      item.sources = Array.from(new Set([...(item.sources || []), "keyword_metrics"]));
      byKeyword.set(keyword, item);
    }

    for (const row of semrushRes.data || []) {
      const keyword = normalize((row as any).keyword);
      if (!keyword) continue;
      const item = byKeyword.get(keyword) || {
        keyword, score: 0, confidence: 0, kundfit: 0,
        intent_class: "problem", dimension: "service",
        volume: 0, cpc: null, kd: null, monthly_value_sek: 0, sources: [],
      };
      item.kd = item.kd ?? (row as any).kd ?? null;
      item.sources = Array.from(new Set([...(item.sources || []), "semrush_metrics"]));
      byKeyword.set(keyword, item);
    }

    const allRows = Array.from(byKeyword.values())
      .filter((row) => {
        const k = normalize(row.keyword);
        if (domainTerm && k.includes(domainTerm)) return true;
        const overlap = scoreMatch(k, seedTerms);
        return overlap > 0;
      })
      .map((row) => {
        const overlap = scoreMatch(row.keyword, seedTerms);
        return {
          ...row,
          research_relevance: Math.min(100, Math.round(
            overlap * 18 +
            Number(row.kundfit || 0) * 0.5 +
            Number(row.confidence || 0) * 0.2 +
            Number(row.score || 0) * 0.2,
          )),
          channel: Number(row.cpc || 0) > 15 ? "Google Ads" : "SEO",
        };
      })
      .sort((a, b) => b.research_relevance - a.research_relevance)
      .slice(0, limit);

    // Persist session if the table exists; ignore if it doesn't.
    const { error: sessionError } = await sb.from("keyword_research_sessions").insert({
      project_id: body.project_id,
      seed: body.seed,
      mode,
      depth,
      result_count: allRows.length,
      results: allRows,
    } as any);
    if (sessionError && sessionError.code !== "PGRST205" && sessionError.code !== "42P01") {
      console.warn("keyword_research_sessions insert warning", sessionError);
    }

    return json({ ok: true, mode, depth, count: allRows.length, rows: allRows });
  } catch (e) {
    console.error("keyword-research-expand error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
