// Pre-launch Blueprint research: orchestrates Firecrawl + DataForSEO + Lovable AI
// to produce a complete market analysis, strategy, keyword universe, sitemap,
// personas and forecast for sites with no existing data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";
const LOCATION_CODE = 2752; // Sweden
const LANGUAGE_CODE = "sv";

const slugify = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function firecrawlScrape(url: string, apiKey: string) {
  try {
    const r = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "summary"],
        onlyMainContent: true,
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      url,
      summary: j?.data?.summary || j?.summary || "",
      markdown: (j?.data?.markdown || j?.markdown || "").slice(0, 8000),
      title: j?.data?.metadata?.title || j?.metadata?.title || url,
    };
  } catch (e) {
    console.error("scrape failed", url, e);
    return null;
  }
}

async function firecrawlMap(url: string, apiKey: string) {
  try {
    const r = await fetch(`${FIRECRAWL_V2}/map`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, limit: 100 }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.data?.links || j?.links || []).slice(0, 100);
  } catch {
    return [];
  }
}

async function dataforseoVolumes(keywords: string[], login: string, password: string) {
  const auth = btoa(`${login}:${password}`);
  const map = new Map<string, { volume: number; cpc: number | null; competition: number | null }>();
  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 700) batches.push(keywords.slice(i, i + 700));
  for (const batch of batches) {
    try {
      const r = await fetch(
        `${DATAFORSEO_BASE}/keywords_data/google_ads/search_volume/live`,
        {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify([{ keywords: batch, location_code: LOCATION_CODE, language_code: LANGUAGE_CODE }]),
        },
      );
      if (!r.ok) continue;
      const data = await r.json();
      const items = data?.tasks?.[0]?.result || [];
      for (const it of items) {
        const kw = String(it.keyword || "").toLowerCase().trim();
        if (!kw) continue;
        map.set(kw, {
          volume: it.search_volume ?? 0,
          cpc: it.cpc != null ? Number(it.cpc) : null,
          competition: it.competition_index != null ? Number(it.competition_index) / 100 : null,
        });
      }
    } catch (e) {
      console.error("dataforseo batch failed", e);
    }
  }
  return map;
}

async function callAI(prompt: string, schema: any, schemaName: string, lovableKey: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "function", function: { name: schemaName, parameters: schema } }],
      tool_choice: { type: "function", function: { name: schemaName } },
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call output");
  return JSON.parse(args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief_id } = await req.json();
    if (!brief_id) throw new Error("brief_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const dfsLogin = Deno.env.get("DATAFORSEO_LOGIN");
    const dfsPass = Deno.env.get("DATAFORSEO_PASSWORD");
    if (!lovableKey || !firecrawlKey || !dfsLogin || !dfsPass) {
      throw new Error("Missing required API credentials");
    }

    const { data: brief, error: bErr } = await supabase
      .from("prelaunch_briefs").select("*").eq("id", brief_id).single();
    if (bErr || !brief) throw new Error("Brief not found");

    await supabase.from("prelaunch_briefs")
      .update({ status: "researching", error_message: null }).eq("id", brief_id);

    // 0. Faktakoll först — kör om den saknas, så vi har verifierad verklighet
    let factCheck: any = brief.fact_check || null;
    if (!factCheck) {
      try {
        console.log("[prelaunch] no fact_check found, running prelaunch-factcheck first");
        const fcRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/prelaunch-factcheck`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ brief_id }),
        });
        if (fcRes.ok) {
          const fcJson = await fcRes.json();
          factCheck = fcJson?.fact_check || null;
        } else {
          console.error("[prelaunch] factcheck failed:", await fcRes.text());
        }
      } catch (e) {
        console.error("[prelaunch] factcheck error:", e);
      }
    }

    // Bygg "verified facts"-kontext att injicera i AI-prompten
    const factsContext = factCheck?.claims?.length
      ? `\n\n=== VERIFIED FACTS (use these instead of client claims when they conflict) ===\n${
          factCheck.claims.map((c: any, i: number) =>
            `${i + 1}. "${c.claim}" → ${c.verdict.toUpperCase()} (${c.confidence})\n   Evidens: ${c.evidence}\n   Rekommendation: ${c.recommendation}`
          ).join("\n\n")
        }\n\nVIKTIGT: När klientens påstående är CONTRADICTED — ignorera klientpåståendet helt och basera analys/sökord/strategi på den verifierade verkligheten. Nämn omkonstruktiv ompositionering i strategin.\n=== END VERIFIED FACTS ===\n`
      : "";

    const { data: revSettings } = await supabase
      .from("project_revenue_settings").select("*").eq("project_id", brief.project_id).maybeSingle();
    const settings = {
      avg_order_value: revSettings?.avg_order_value ?? 1000,
      conversion_rate_pct: revSettings?.conversion_rate_pct ?? 2,
      gross_margin_pct: revSettings?.gross_margin_pct ?? 100,
      currency: revSettings?.currency ?? "SEK",
    };

    // 1. Firecrawl konkurrenter
    const competitors = (brief.competitors || []).slice(0, 5);
    console.log(`[prelaunch] scraping ${competitors.length} competitors`);
    const scraped = await Promise.all(
      competitors.map(async (c: string) => {
        const url = c.startsWith("http") ? c : `https://${c}`;
        const [page, links] = await Promise.all([
          firecrawlScrape(url, firecrawlKey),
          firecrawlMap(url, firecrawlKey),
        ]);
        return { domain: c, page, links };
      }),
    );

    // 2. AI: extrahera seed-sökord + personas
    const seedSchema = {
      type: "object",
      properties: {
        seed_keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              intent: { type: "string", enum: ["informational", "commercial", "transactional", "navigational"] },
              cluster: { type: "string" },
            },
            required: ["keyword", "intent", "cluster"],
          },
          description: "25-40 svenska sökord relevanta för verksamheten, klustrade",
        },
        personas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              pain_points: { type: "array", items: { type: "string" } },
              triggers: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description", "pain_points", "triggers"],
          },
          description: "2-3 personas",
        },
      },
      required: ["seed_keywords", "personas"],
    };

    const compContext = scraped
      .filter(s => s.page)
      .map(s => `--- ${s.domain} ---\nTitel: ${s.page!.title}\nSammanfattning: ${s.page!.summary}\nSidor (struktur): ${s.links.slice(0, 30).join(", ")}`)
      .join("\n\n");

    const seedPrompt = `Du är svensk SEO-strateg. En kund ska bygga ny sajt och saknar data.

VERKSAMHET: ${brief.business_idea || "—"}
MÅLGRUPP: ${brief.target_audience || "—"}
USP: ${brief.usp || "—"}
GEOGRAFISKA MARKNADER: ${(brief.locations || []).join(", ") || "Sverige"}

KONKURRENTER (innehåll):
${compContext || "Ingen data"}
${factsContext}
Extrahera 25–40 relevanta svenska sökord (mix av kort/long-tail, samtliga intent), klustrade tematiskt. Inkludera lokala varianter där det är relevant. Skapa även 2–3 personas baserat på målgruppen.`;

    console.log("[prelaunch] calling AI for seed keywords");
    const seedResult = await callAI(seedPrompt, seedSchema, "extract_seeds", lovableKey);
    const seedKws: any[] = seedResult.seed_keywords || [];
    console.log(`[prelaunch] got ${seedKws.length} seed keywords`);

    // 3. DataForSEO volymer
    const volumeMap = await dataforseoVolumes(
      seedKws.map(k => k.keyword.toLowerCase().trim()),
      dfsLogin, dfsPass,
    );
    const enrichedKws = seedKws.map(k => {
      const m = volumeMap.get(k.keyword.toLowerCase().trim());
      return { ...k, volume: m?.volume || 0, cpc: m?.cpc, competition: m?.competition };
    }).sort((a, b) => (b.volume || 0) - (a.volume || 0));

    // Cache to keyword_metrics
    const upserts = enrichedKws.filter(k => k.volume > 0).map(k => ({
      keyword: k.keyword.toLowerCase().trim(),
      location_code: LOCATION_CODE,
      search_volume: k.volume,
      cpc_sek: k.cpc,
      competition: k.competition,
      updated_at: new Date().toISOString(),
    }));
    if (upserts.length) {
      await supabase.from("keyword_metrics").upsert(upserts, { onConflict: "keyword,location_code" });
    }

    // 4. AI: syntes — marknadsanalys, strategi, sajtkarta, innehållsplan
    const synthesisSchema = {
      type: "object",
      properties: {
        market_analysis: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Markdown-formaterad sammanfattning (3-5 stycken)" },
            assessment: {
              type: "array",
              items: {
                type: "object",
                properties: { factor: { type: "string" }, rating: { type: "string" }, note: { type: "string" } },
                required: ["factor", "rating", "note"],
              },
            },
            demographics: { type: "string", description: "Markdown om demografi/upptagningsområde" },
            competitors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", description: "direkt|indirekt|regional" },
                  threat_level: { type: "string", enum: ["låg", "medel", "hög"] },
                  positioning: { type: "string" },
                },
                required: ["name", "type", "threat_level", "positioning"],
              },
            },
            implications: { type: "array", items: { type: "string" }, description: "Strategiska implikationer (3-5 punkter)" },
          },
          required: ["summary", "assessment", "competitors", "implications"],
        },
        strategy: {
          type: "object",
          properties: {
            positioning: { type: "string" },
            tonality: { type: "string" },
            channels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  channel: { type: "string" },
                  role: { type: "string" },
                  priority: { type: "string", enum: ["kritisk", "hög", "medel", "låg"] },
                  start_when: { type: "string" },
                },
                required: ["channel", "role", "priority", "start_when"],
              },
            },
            goals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  metric: { type: "string" },
                  target: { type: "string" },
                  timeframe: { type: "string" },
                },
                required: ["metric", "target", "timeframe"],
              },
            },
            content_plan: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  month: { type: "number" },
                  type: { type: "string", enum: ["pillar", "support", "blog"] },
                  title: { type: "string" },
                  target_kw: { type: "string" },
                },
                required: ["month", "type", "title", "target_kw"],
              },
              description: "12-18 innehållsförslag fördelat över 6 månader",
            },
          },
          required: ["positioning", "tonality", "channels", "goals", "content_plan"],
        },
        sitemap: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slug: { type: "string" },
              h1: { type: "string" },
              meta_title: { type: "string" },
              meta_description: { type: "string" },
              primary_kw: { type: "string" },
              secondary_kws: { type: "array", items: { type: "string" } },
              intent: { type: "string", enum: ["informational", "commercial", "transactional", "navigational"] },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              parent_slug: { type: "string" },
            },
            required: ["slug", "h1", "primary_kw", "secondary_kws", "intent", "priority"],
          },
          description: "10-25 sidor (startsida + landningssidor + kategori + bloggpelare). Använd primary_kw från seed-sökord.",
        },
      },
      required: ["market_analysis", "strategy", "sitemap"],
    };

    const topKws = enrichedKws.slice(0, 30)
      .map(k => `${k.keyword} (vol ${k.volume}, intent ${k.intent}, kluster ${k.cluster})`).join("\n");

    const synthesisPrompt = `Bygg en komplett pre-launch blueprint för denna verksamhet. Skriv på svenska.

VERKSAMHET: ${brief.business_idea}
MÅLGRUPP: ${brief.target_audience}
USP: ${brief.usp}
GEOGRAFI: ${(brief.locations || []).join(", ")}
KONKURRENTER: ${competitors.join(", ")}

TOPP SÖKORD MED VOLYM:
${topKws}

KONKURRENTKONTEXT:
${compContext.slice(0, 4000)}
${factsContext}
Generera:
1. Marknadsanalys (sammanfattning, bedömningsmatris, konkurrentkartläggning, strategiska implikationer). Om VERIFIED FACTS visar att klientens unika position är motbevisad — beskriv det öppet och föreslå ny ompositionering.
2. Marknadsstrategi (positionering, tonalitet, kanalstrategi med prioritet/timing, 12-mån mål, innehållsplan 6 mån). Använd verifierad verklighet, inte klientpåståenden.
3. Sajtkarta: 10-25 sidor. Varje sida MÅSTE ha primary_kw från sökordslistan ovan. Slug på svenska, kort. Inkludera startsida, om-oss, kategori-/landningssidor, kontakt och 3-5 blogginnehåll.`;

    console.log("[prelaunch] calling AI for synthesis");
    const synth = await callAI(synthesisPrompt, synthesisSchema, "build_blueprint", lovableKey);

    // 5. Berika sajtkarta med volymer + forecast
    const volByKw = new Map(enrichedKws.map(k => [k.keyword.toLowerCase().trim(), k.volume]));
    const sitemap = (synth.sitemap || []).map((p: any) => {
      const v = volByKw.get(String(p.primary_kw || "").toLowerCase().trim()) || 0;
      const secondary_volume = (p.secondary_kws || [])
        .reduce((sum: number, kw: string) => sum + (volByKw.get(kw.toLowerCase().trim()) || 0), 0);
      return {
        ...p,
        slug: p.slug || slugify(p.h1 || p.primary_kw),
        primary_volume: v,
        total_addressable_volume: v + secondary_volume,
      };
    });

    // 6. Forecast
    const totalVol = sitemap.reduce((s: number, p: any) => s + (p.primary_volume || 0), 0);
    const ctrAt = (pos: number) => {
      const t = [0, 0.319, 0.247, 0.187, 0.137, 0.099, 0.072, 0.054, 0.04, 0.031, 0.025];
      const r = Math.max(1, Math.round(pos));
      if (r <= 10) return t[r];
      if (r <= 20) return 0.012;
      if (r <= 30) return 0.005;
      return 0.001;
    };
    const ramp = (months: number, target: number, start = 30) => {
      return Array.from({ length: months }, (_, i) => {
        const m = i + 1;
        const t = Math.min(1, Math.log(m + 1) / Math.log(months + 1));
        return start - (start - target) * t;
      });
    };
    const buildScenario = (target: number) => {
      let cum = 0;
      return ramp(12, target).map((pos, i) => {
        const clicks = totalVol * ctrAt(pos);
        const conv = clicks * (settings.conversion_rate_pct / 100);
        const rev = Math.round(conv * settings.avg_order_value * (settings.gross_margin_pct / 100));
        cum += rev;
        return {
          month: i + 1,
          avgPosition: Math.round(pos * 10) / 10,
          monthlyClicks: Math.round(clicks),
          monthlyConversions: Math.round(conv * 10) / 10,
          monthlyRevenue: rev,
          cumulativeRevenue: cum,
        };
      });
    };
    const forecast = {
      pessimistic: buildScenario(12),
      realistic: buildScenario(6),
      optimistic: buildScenario(3),
    };

    // 7. Persist
    const { data: blueprint, error: bpErr } = await supabase
      .from("prelaunch_blueprints")
      .insert({
        brief_id,
        project_id: brief.project_id,
        market_analysis: synth.market_analysis,
        strategy: synth.strategy,
        keyword_universe: { keywords: enrichedKws, total: enrichedKws.length },
        sitemap,
        personas: seedResult.personas || [],
        forecast,
      })
      .select()
      .single();
    if (bpErr) throw bpErr;

    await supabase.from("prelaunch_briefs")
      .update({ status: "complete" }).eq("id", brief_id);

    return new Response(
      JSON.stringify({ blueprint_id: blueprint.id, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("prelaunch-research error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      const { brief_id } = await req.json().catch(() => ({}));
      if (brief_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.from("prelaunch_briefs")
          .update({ status: "failed", error_message: msg }).eq("id", brief_id);
      }
    } catch {}
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
