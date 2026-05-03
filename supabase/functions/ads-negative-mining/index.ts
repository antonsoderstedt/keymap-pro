// Negative Keyword Mining — hämtar search terms 90d, låter Lovable AI klustra irrelevanta termer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { project_id, min_cost_sek = 50 } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings").select("ads_customer_id").eq("project_id", project_id).maybeSingle();
    if (!settings?.ads_customer_id) throw new Error("NO_ADS_CUSTOMER: Inget Google Ads-konto valt");

    const { data: project } = await admin.from("projects").select("company,domain,products,market,known_segments").eq("id", project_id).maybeSingle();

    const ctx = await getAdsContext(req.headers.get("Authorization"));

    const minMicros = Math.round(min_cost_sek * 1_000_000);
    const rows = await searchGaql(ctx, settings.ads_customer_id, `
      SELECT search_term_view.search_term, metrics.clicks, metrics.cost_micros,
        metrics.conversions, campaign.name
      FROM search_term_view
      WHERE segments.date DURING LAST_90_DAYS
        AND metrics.cost_micros >= ${minMicros}
      ORDER BY metrics.cost_micros DESC
      LIMIT 200
    `);

    const terms = rows.map((r: any) => ({
      term: r.searchTermView?.searchTerm,
      clicks: Number(r.metrics?.clicks || 0),
      cost_sek: Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000 * 100) / 100,
      conversions: Number(r.metrics?.conversions || 0),
      campaign: r.campaign?.name,
    })).filter((t: any) => t.term);

    if (terms.length === 0) return json({ ok: true, clusters: [], terms_analysed: 0 });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du är PPC-expert. Identifiera irrelevanta search terms som bör läggas som negativa sökord. Klustra liknande termer ihop." },
          { role: "user", content: `Företag: ${project?.company || "okänt"} (${project?.domain || ""}). Produkter: ${project?.products || ""}. Marknad: ${project?.market || ""}.\n\nSearch terms (90d):\n${JSON.stringify(terms, null, 2)}\n\nIdentifiera kluster av IRRELEVANTA termer (inte matchande produkterbjudandet, jobbsökare, fel intent, fel geo, etc).` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "negative_clusters",
            description: "Kluster av föreslagna negativa sökord",
            parameters: {
              type: "object",
              properties: {
                clusters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      theme: { type: "string", description: "Kort tema, t.ex. 'Jobbsökare'" },
                      reasoning: { type: "string", description: "Varför irrelevant" },
                      terms: { type: "array", items: { type: "string" } },
                      suggested_negatives: { type: "array", items: { type: "string" }, description: "Faktiska negativa sökord att lägga till (kan vara delar av termen)" },
                      match_type: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"] },
                      wasted_sek: { type: "number" },
                      scope: { type: "string", enum: ["account", "campaign"], description: "Lägg på konto- eller kampanjnivå" },
                    },
                    required: ["theme", "terms", "suggested_negatives", "match_type", "wasted_sek"],
                  },
                },
              },
              required: ["clusters"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "negative_clusters" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) throw new Error("RATE_LIMITED");
      if (aiRes.status === 402) throw new Error("PAYMENT_REQUIRED");
      throw new Error(`AI_ERROR: ${aiRes.status} ${t.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = toolCall ? JSON.parse(toolCall.function.arguments) : { clusters: [] };

    return json({ ok: true, clusters: parsed.clusters || [], terms_analysed: terms.length });
  } catch (e: any) {
    console.error("ads-negative-mining", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    return json({ error: msg, code }, code === "NO_ADS_CUSTOMER" ? 400 : code === "RATE_LIMITED" ? 429 : code === "PAYMENT_REQUIRED" ? 402 : 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
