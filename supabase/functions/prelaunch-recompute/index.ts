// prelaunch-recompute — tar en blueprint + en delmängd valda sökord och
// regenererar sajtkarta, innehållsplan, ads-plan och prognos från valen.
// Kör INTE om Firecrawl/SERP/factcheck — använder existerande keyword_universe.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const slugify = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

const ctrAt = (pos: number) => {
  const t = [0, 0.319, 0.247, 0.187, 0.137, 0.099, 0.072, 0.054, 0.04, 0.031, 0.025];
  const r = Math.max(1, Math.round(pos));
  if (r <= 10) return t[r];
  if (r <= 20) return 0.012;
  if (r <= 30) return 0.005;
  return 0.001;
};

const ramp = (months: number, target: number, start = 30) =>
  Array.from({ length: months }, (_, i) => {
    const m = i + 1;
    const t = Math.min(1, Math.log(m + 1) / Math.log(months + 1));
    return start - (start - target) * t;
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { blueprint_id, selected_keywords } = await req.json();
    if (!blueprint_id) throw new Error("blueprint_id required");
    if (!Array.isArray(selected_keywords) || selected_keywords.length === 0) {
      throw new Error("selected_keywords (non-empty array) required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");

    // 1. Hämta blueprint + brief + revenue settings
    const { data: bp, error: bpErr } = await supabase
      .from("prelaunch_blueprints").select("*").eq("id", blueprint_id).single();
    if (bpErr || !bp) throw new Error("Blueprint not found");

    const { data: brief } = await supabase
      .from("prelaunch_briefs").select("*").eq("id", bp.brief_id).single();

    const { data: rev } = await supabase
      .from("project_revenue_settings").select("*").eq("project_id", bp.project_id).maybeSingle();
    const settings = {
      avg_order_value: rev?.avg_order_value ?? 1000,
      conversion_rate_pct: rev?.conversion_rate_pct ?? 2,
      gross_margin_pct: rev?.gross_margin_pct ?? 100,
    };

    // 2. Filtrera till valda sökord ur befintlig universe
    const universe: any[] = bp.keyword_universe?.keywords || [];
    const selectedSet = new Set(selected_keywords.map((k: string) => k.toLowerCase().trim()));
    const selected = universe.filter(k =>
      selectedSet.has(String(k.keyword || "").toLowerCase().trim())
    );
    if (selected.length === 0) {
      throw new Error("None of the selected keywords found in blueprint universe");
    }

    const factsContext = brief?.fact_check?.claims?.length
      ? `\n=== VERIFIED FACTS ===\n${brief.fact_check.claims.map((c: any) =>
          `- "${c.claim}" → ${c.verdict.toUpperCase()}: ${c.evidence}`
        ).join("\n")}\n`
      : "";

    // 3. AI: bygg sajtkarta + innehållsplan + ads-plan från valda sökord
    const schema = {
      type: "object",
      properties: {
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
        },
        ads_plan: {
          type: "object",
          properties: {
            campaigns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["search", "pmax", "shopping"] },
                  daily_budget_sek: { type: "number" },
                  ad_groups: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        match_type: { type: "string", enum: ["exact", "phrase", "broad"] },
                        keywords: { type: "array", items: { type: "string" } },
                        headlines: { type: "array", items: { type: "string" }, description: "10-15 RSA headlines, max 30 tecken" },
                        descriptions: { type: "array", items: { type: "string" }, description: "4 RSA descriptions, max 90 tecken" },
                        landing_slug: { type: "string" },
                      },
                      required: ["name", "match_type", "keywords", "headlines", "descriptions", "landing_slug"],
                    },
                  },
                },
                required: ["name", "type", "daily_budget_sek", "ad_groups"],
              },
            },
            negative_keywords: { type: "array", items: { type: "string" } },
            recommended_total_daily_sek: { type: "number" },
          },
          required: ["campaigns", "negative_keywords", "recommended_total_daily_sek"],
        },
      },
      required: ["sitemap", "content_plan", "ads_plan"],
    };

    const kwList = selected
      .map(k => `${k.keyword} (vol ${k.volume || 0}, intent ${k.intent || "—"}, kluster ${k.cluster || "—"}, cpc ${k.cpc || "—"})`)
      .join("\n");

    const prompt = `Du är svensk SEO/SEM-strateg. Klient har valt nedanstående sökord. Bygg sajtkarta, innehållsplan och Google Ads-plan KRING dessa sökord.

VERKSAMHET: ${brief?.business_idea || "—"}
USP: ${brief?.usp || "—"}
GEOGRAFI: ${(brief?.locations || []).join(", ") || "Sverige"}
${factsContext}
VALDA SÖKORD (${selected.length} st):
${kwList}

Generera:
1. Sajtkarta 8-20 sidor — varje sidas primary_kw MÅSTE komma från valda sökord. Gruppera relaterade sökord till secondary_kws på samma sida.
2. Innehållsplan 12-18 inlägg över 6 månader.
3. Ads-plan: 1-3 kampanjer (sök prioriterat). Ad groups per intent/kluster, RSA headlines (max 30 tecken) och descriptions (max 90 tecken) på svenska. Landing_slug måste matcha en slug i sajtkartan. Sätt daglig budget proportionellt mot CPC × volym × 0.05. Lägg generiska negativa sökord (gratis, jobb, wikipedia, etc).`;

    console.log(`[recompute] generating from ${selected.length} keywords`);
    const result = await callAI(prompt, schema, "build_recompute", lovableKey);

    // 4. Berika sajtkarta med volymer
    const volByKw = new Map(selected.map(k => [k.keyword.toLowerCase().trim(), k.volume || 0]));
    const sitemap = (result.sitemap || []).map((p: any) => {
      const v = volByKw.get(String(p.primary_kw || "").toLowerCase().trim()) || 0;
      const sec = (p.secondary_kws || []).reduce(
        (s: number, kw: string) => s + (volByKw.get(kw.toLowerCase().trim()) || 0), 0,
      );
      return {
        ...p,
        slug: p.slug || slugify(p.h1 || p.primary_kw),
        primary_volume: v,
        total_addressable_volume: v + sec,
      };
    });

    // 5. Forecast på valda sökord
    const totalVol = sitemap.reduce((s: number, p: any) => s + (p.primary_volume || 0), 0);
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

    // 6. Behåll befintlig strategy men uppdatera content_plan
    const strategy = {
      ...(bp.strategy || {}),
      content_plan: result.content_plan || bp.strategy?.content_plan || [],
    };

    const { error: updErr } = await supabase
      .from("prelaunch_blueprints")
      .update({
        selected_keywords,
        sitemap,
        strategy,
        ads_plan: result.ads_plan,
        forecast,
        updated_at: new Date().toISOString(),
      })
      .eq("id", blueprint_id);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        success: true,
        blueprint_id,
        sitemap_pages: sitemap.length,
        ads_campaigns: result.ads_plan?.campaigns?.length || 0,
        total_volume: totalVol,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("prelaunch-recompute error:", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
