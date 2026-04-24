import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATABASE = "se"; // Sweden
const LOCATION_CODE = 2752;
const CACHE_TTL_DAYS = 30;
// Semrush units cost: phrase_kdi ~10 units, phrase_these ~10, phrase_organic ~10
// Cap conservative defaults to protect 50k/month budget
const MAX_KEYWORDS_DEFAULT = 600;

type Metric = {
  kd: number | null;
  serp_features: string[] | null;
  top_domains: string[] | null;
};

async function fetchSemrush(params: Record<string, string>, key: string): Promise<string> {
  const url = new URL("https://api.semrush.com/");
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Semrush ${res.status}: ${await res.text()}`);
  return await res.text();
}

// Parse semicolon-delimited CSV (Semrush format) — first row is header
function parseSemrushCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => row[h] = cols[i] ?? "");
    return row;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords, max_keywords } = await req.json();
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "keywords array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("SEMRUSH_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SEMRUSH_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cap = Math.min(Number(max_keywords) || MAX_KEYWORDS_DEFAULT, 1500);
    const unique = Array.from(new Set(
      keywords.map((k: string) => String(k || "").toLowerCase().trim()).filter(Boolean)
    )).slice(0, cap);

    // 1. Cache lookup
    const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("semrush_metrics")
      .select("*")
      .eq("location_code", LOCATION_CODE)
      .in("keyword", unique)
      .gte("updated_at", cutoff);

    const cacheMap = new Map<string, Metric>();
    (cached || []).forEach((row: any) => {
      cacheMap.set(row.keyword, {
        kd: row.kd != null ? Number(row.kd) : null,
        serp_features: row.serp_features || null,
        top_domains: row.top_domains || null,
      });
    });

    const missing = unique.filter((k) => !cacheMap.has(k));
    console.log(`[semrush] cache hit ${cacheMap.size}/${unique.length}, fetching ${missing.length}`);

    const upserts: any[] = [];

    // 2. Fetch missing one by one (Semrush phrase APIs accept single phrase per call)
    // To control units we limit concurrency to 4 in parallel batches.
    const concurrency = 4;
    for (let i = 0; i < missing.length; i += concurrency) {
      const batch = missing.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map(async (kw) => {
        let kd: number | null = null;
        let serpFeatures: string[] | null = null;
        let topDomains: string[] | null = null;

        // KD via phrase_kdi (Keyword Difficulty Index)
        try {
          const kdText = await fetchSemrush({
            type: "phrase_kdi",
            phrase: kw,
            database: DATABASE,
            export_columns: "Ph,Kd",
          }, apiKey);
          const rows = parseSemrushCsv(kdText);
          if (rows[0]?.Kd) kd = Number(rows[0].Kd);
        } catch (e) {
          console.warn(`[semrush] kd fail for "${kw}":`, (e as Error).message);
        }

        // Top organic domains
        try {
          const orgText = await fetchSemrush({
            type: "phrase_organic",
            phrase: kw,
            database: DATABASE,
            display_limit: "5",
            export_columns: "Dn,Ur",
          }, apiKey);
          const rows = parseSemrushCsv(orgText);
          topDomains = rows.map((r) => r.Dn).filter(Boolean);
        } catch (e) {
          console.warn(`[semrush] organic fail for "${kw}":`, (e as Error).message);
        }

        return { kw, kd, serpFeatures, topDomains };
      }));

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { kw, kd, serpFeatures, topDomains } = r.value;
        const metric: Metric = { kd, serp_features: serpFeatures, top_domains: topDomains };
        cacheMap.set(kw, metric);
        upserts.push({
          keyword: kw,
          location_code: LOCATION_CODE,
          kd,
          serp_features: serpFeatures,
          top_domains: topDomains,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (upserts.length > 0) {
      const { error: upErr } = await supabase
        .from("semrush_metrics")
        .upsert(upserts, { onConflict: "keyword,location_code" });
      if (upErr) console.error("[semrush] cache upsert error:", upErr);
    }

    const result: Record<string, Metric> = {};
    cacheMap.forEach((v, k) => { result[k] = v; });

    return new Response(JSON.stringify({ metrics: result, fetched: upserts.length, cached: cacheMap.size - upserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[semrush] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
