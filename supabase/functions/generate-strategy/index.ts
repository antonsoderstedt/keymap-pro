import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, analysis_id } = await req.json();
    if (!project_id || !analysis_id) {
      return new Response(JSON.stringify({ error: "project_id and analysis_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
    const { data: analysis } = await supabase.from("analyses").select("keyword_universe_json,options").eq("id", analysis_id).single();
    const universe = (analysis as any)?.keyword_universe_json;
    if (!universe) throw new Error("Universe not found for analysis");

    // Compact summary to send to AI
    const top50 = (universe.keywords || [])
      .filter((k: any) => !k.isNegative && (k.searchVolume ?? 0) > 0)
      .sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, 50)
      .map((k: any) => ({
        kw: k.keyword, vol: k.searchVolume, cpc: k.cpc, kd: k.kd,
        intent: k.intent, channel: k.channel, priority: k.priority, cluster: k.cluster,
      }));

    const channelCount: Record<string, number> = {};
    const clusterVol: Record<string, number> = {};
    (universe.keywords || []).forEach((k: any) => {
      if (k.isNegative) return;
      channelCount[k.channel] = (channelCount[k.channel] || 0) + 1;
      clusterVol[k.cluster] = (clusterVol[k.cluster] || 0) + (k.searchVolume || 0);
    });

    const schema = {
      type: "object",
      properties: {
        budgetSplit: { type: "array", items: { type: "object", properties: {
          campaign: { type: "string" }, monthlyBudgetSek: { type: "number" }, rationale: { type: "string" },
        }, required: ["campaign", "monthlyBudgetSek", "rationale"] } },
        biddingStrategy: { type: "array", items: { type: "object", properties: {
          campaign: { type: "string" },
          type: { type: "string", enum: ["Manual CPC", "Maximize Clicks", "Maximize Conversions", "Target CPA", "Target ROAS", "Maximize Conversion Value"] },
          target: { type: "string" }, rationale: { type: "string" },
        }, required: ["campaign", "type", "target", "rationale"] } },
        launchOrder: { type: "array", items: { type: "object", properties: {
          phase: { type: "string" }, week: { type: "number" }, campaigns: { type: "array", items: { type: "string" } }, focus: { type: "string" },
        }, required: ["phase", "week", "campaigns", "focus"] } },
        landingPageRequirements: { type: "array", items: { type: "object", properties: {
          adGroup: { type: "string" }, h1: { type: "string" }, mustHaves: { type: "array", items: { type: "string" } }, cta: { type: "string" },
        }, required: ["adGroup", "h1", "mustHaves", "cta"] } },
        seoVsAdsAdvice: { type: "string" },
        quickWins: { type: "array", items: { type: "object", properties: {
          keyword: { type: "string" }, action: { type: "string" }, why: { type: "string" },
        }, required: ["keyword", "action", "why"] } },
        risks: { type: "array", items: { type: "string" } },
        kpis: { type: "array", items: { type: "object", properties: {
          metric: { type: "string" }, target: { type: "string" }, timeframe: { type: "string" },
        }, required: ["metric", "target", "timeframe"] } },
      },
      required: ["budgetSplit", "biddingStrategy", "launchOrder", "landingPageRequirements", "seoVsAdsAdvice", "quickWins", "risks", "kpis"],
    };

    const prompt = `Skapa en Google Ads & SEO-strategi för:
Företag: ${project?.company}
Domän: ${project?.domain || "n/a"}
Marknad: ${project?.market || "se-sv"}
Konkurrenter: ${project?.competitors || "n/a"}

Universe-stats:
- Totalt: ${universe.totalKeywords} sökord, ${universe.totalEnriched} med riktig data
- Kanalfördelning: ${JSON.stringify(channelCount)}
- Top kluster (per total volym): ${Object.entries(clusterVol).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 8).map(([c, v]) => `${c} (${v})`).join(", ")}

Top 50 sökord:
${JSON.stringify(top50)}

Returnera STRIKT enligt schema, på svenska. Var konkret och numerisk där möjligt (t.ex. budgetar i SEK, mål-CPA, vecka 1-12). Tänk realistiskt för svenskt B2B.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "Du är seniorkonsult inom Google Ads och SEO för svenska B2B-företag." },
          { role: "user", content: prompt },
        ],
        tools: [{ type: "function", function: { name: "build_strategy", description: "Bygg strategi", parameters: schema } }],
        tool_choice: { type: "function", function: { name: "build_strategy" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[generate-strategy] AI fail:", aiRes.status, t);
      throw new Error(`AI ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    const strategy = JSON.parse(toolCall.function.arguments);

    await supabase.from("strategy_drafts").upsert({
      analysis_id, payload: strategy, updated_at: new Date().toISOString(),
    }, { onConflict: "analysis_id" });

    return new Response(JSON.stringify({ success: true, strategy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-strategy] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
