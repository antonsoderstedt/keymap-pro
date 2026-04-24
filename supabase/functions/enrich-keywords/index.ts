import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCATION_CODE = 2752; // Sweden
const LANGUAGE_CODE = "sv";
const CACHE_TTL_DAYS = 30;
const BATCH_SIZE = 700; // DataForSEO accepts up to 1000 per request

type Metric = {
  search_volume: number | null;
  cpc_sek: number | null;
  competition: number | null;
  trend_json: any;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords } = await req.json();
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "keywords array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const login = Deno.env.get("DATAFORSEO_LOGIN");
    const password = Deno.env.get("DATAFORSEO_PASSWORD");
    if (!login || !password) {
      return new Response(JSON.stringify({ error: "DataForSEO credentials missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Normalize: lowercase, trim, dedupe
    const unique = Array.from(new Set(
      keywords.map((k: string) => String(k || "").toLowerCase().trim()).filter(Boolean)
    ));

    // 1. Check cache
    const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("keyword_metrics")
      .select("*")
      .eq("location_code", LOCATION_CODE)
      .in("keyword", unique)
      .gte("updated_at", cutoff);

    const cacheMap = new Map<string, Metric>();
    (cached || []).forEach((row: any) => {
      cacheMap.set(row.keyword, {
        search_volume: row.search_volume,
        cpc_sek: row.cpc_sek,
        competition: row.competition,
        trend_json: row.trend_json,
      });
    });

    const missing = unique.filter((k) => !cacheMap.has(k));
    console.log(`Cache hit: ${cacheMap.size}/${unique.length}, fetching ${missing.length} from DataForSEO`);

    // 2. Fetch missing from DataForSEO in batches
    if (missing.length > 0) {
      const auth = btoa(`${login}:${password}`);
      const upserts: any[] = [];

      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        const body = [{
          keywords: batch,
          location_code: LOCATION_CODE,
          language_code: LANGUAGE_CODE,
        }];

        const res = await fetch(
          "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error(`DataForSEO ${res.status}:`, errText);
          continue;
        }

        const data = await res.json();
        const items = data?.tasks?.[0]?.result || [];

        items.forEach((item: any) => {
          const keyword = String(item.keyword || "").toLowerCase().trim();
          if (!keyword) return;
          const metric: Metric = {
            search_volume: item.search_volume ?? 0,
            cpc_sek: item.cpc != null ? Number(item.cpc) : null,
            competition: item.competition_index != null
              ? Number(item.competition_index) / 100
              : (item.competition != null ? Number(item.competition) : null),
            trend_json: item.monthly_searches || null,
          };
          cacheMap.set(keyword, metric);
          upserts.push({
            keyword,
            location_code: LOCATION_CODE,
            ...metric,
            updated_at: new Date().toISOString(),
          });
        });
      }

      // 3. Persist to cache
      if (upserts.length > 0) {
        const { error: upErr } = await supabase
          .from("keyword_metrics")
          .upsert(upserts, { onConflict: "keyword,location_code" });
        if (upErr) console.error("Cache upsert error:", upErr);
        else console.log(`Cached ${upserts.length} new metrics`);
      }
    }

    // 4. Build response keyed by lowercased keyword
    const result: Record<string, Metric> = {};
    cacheMap.forEach((v, k) => { result[k] = v; });

    return new Response(JSON.stringify({ metrics: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-keywords error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
