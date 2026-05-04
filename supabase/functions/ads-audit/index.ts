// PPC Audit Agent — kör hälsokontroll mot Google Ads och låter Lovable AI scora + summera.
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
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings")
      .select("ads_customer_id")
      .eq("project_id", project_id)
      .maybeSingle();
    if (!settings?.ads_customer_id) throw new Error("NO_ADS_CUSTOMER: Inget Google Ads-konto valt");
    const customerId = settings.ads_customer_id;

    const ctx = await getAdsContext(req.headers.get("Authorization"));

    const campRows = await searchGaql(ctx, customerId, `
      SELECT campaign.id, campaign.name, campaign.status,
        metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions,
        metrics.conversions_value, metrics.ctr, metrics.average_cpc,
        metrics.search_impression_share, metrics.search_rank_lost_impression_share,
        metrics.search_budget_lost_impression_share
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status = 'ENABLED'
      LIMIT 200
    `);

    const kwRows = await searchGaql(ctx, customerId, `
      SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score,
        metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.impressions,
        campaign.name, ad_group.name
      FROM keyword_view
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.cost_micros DESC
      LIMIT 100
    `);

    const stRows = await searchGaql(ctx, customerId, `
      SELECT search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions, campaign.name
      FROM search_term_view
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.cost_micros DESC
      LIMIT 100
    `);

    const totalCost = campRows.reduce((s: number, r: any) => s + Number(r.metrics?.costMicros || 0), 0) / 1_000_000;
    const totalConv = campRows.reduce((s: number, r: any) => s + Number(r.metrics?.conversions || 0), 0);
    const totalConvValue = campRows.reduce((s: number, r: any) => s + Number(r.metrics?.conversionsValue || 0), 0);

    // Hämta senaste konkurrent-data (Auction Insights) för att kunna ge defensiv brand-rekommendation
    const { data: aiSnap } = await admin
      .from("auction_insights_snapshots")
      .select("rows, source, created_at")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const aiRows = (aiSnap?.rows as any) || {};
    const allCompetitors = Array.isArray(aiRows.competitors) ? aiRows.competitors : [];
    const aiCampaigns = Array.isArray(aiRows.campaigns) ? aiRows.campaigns : [];
    const brandCampaign = aiCampaigns.find((c: any) => c.is_brand) ||
      aiCampaigns.find((c: any) => /brand|varum[äa]rk/i.test(c.name || ""));
    const brandCompetitors = brandCampaign?.competitors?.filter((c: any) =>
      c.domain && c.domain !== "you" && (c.impression_share ?? 0) >= 0.05
    ) || [];

    const summaryInput = {
      period: "Senaste 30 dagarna",
      totals: {
        cost_sek: Math.round(totalCost),
        conversions: Math.round(totalConv * 10) / 10,
        conversions_value_sek: Math.round(totalConvValue),
        roas: totalCost > 0 ? Math.round((totalConvValue / totalCost) * 100) / 100 : 0,
        campaigns: campRows.length,
      },
      top_cost_campaigns: campRows.slice(0, 10).map((r: any) => ({
        name: r.campaign?.name,
        cost: Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000),
        conv: Number(r.metrics?.conversions || 0),
        is: r.metrics?.searchImpressionShare,
        lost_rank: r.metrics?.searchRankLostImpressionShare,
        lost_budget: r.metrics?.searchBudgetLostImpressionShare,
      })),
      keywords_low_qs: kwRows
        .filter((r: any) => (r.adGroupCriterion?.qualityInfo?.qualityScore ?? 10) <= 5)
        .slice(0, 20)
        .map((r: any) => ({
          kw: r.adGroupCriterion?.keyword?.text,
          qs: r.adGroupCriterion?.qualityInfo?.qualityScore,
          cost: Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000),
          conv: Number(r.metrics?.conversions || 0),
        })),
      wasted_keywords: kwRows
        .filter((r: any) => Number(r.metrics?.conversions || 0) === 0 && Number(r.metrics?.costMicros || 0) > 200_000_000)
        .slice(0, 20)
        .map((r: any) => ({
          kw: r.adGroupCriterion?.keyword?.text,
          cost: Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000),
          clicks: Number(r.metrics?.clicks || 0),
        })),
      // Konkurrent-kontext från Auction Insights (script-källa)
      brand_auction_context: brandCampaign ? {
        campaign_name: brandCampaign.name,
        competitor_count: brandCompetitors.length,
        top_competitors: brandCompetitors.slice(0, 5).map((c: any) => ({
          domain: c.domain,
          impression_share: c.impression_share,
          outranking_share: c.outranking_share,
        })),
        guidance: brandCompetitors.length >= 2
          ? "VIKTIGT: Konkurrenter budar aktivt på varumärket. Rekommendera DEFENSIV brand-budget (behåll/höj måttligt) snarare än att pausa, även om SEO-kannibalisering finns. Utan brand-skydd riskerar konkurrenter ta klick på varumärkesord."
          : "Ingen aktiv konkurrens på brand-termer detekterad — om SEO rankar #1 organiskt på varumärket är brand-budget mindre kritisk.",
      } : {
        note: "Ingen Auction Insights-data tillgänglig. Be användaren installera Google Ads Script under Auction Insights för att få konkurrent-data.",
      },
    };


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du är en senior PPC-strateg. Bedöm hälsa på Google Ads-kontot baserat på data och returnera kortfattat på svenska." },
          { role: "user", content: `Här är kontodata för senaste 30 dagar:\n${JSON.stringify(summaryInput, null, 2)}\n\nGenerera en hälsobedömning.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "ads_health_report",
            description: "Strukturerad PPC-hälsorapport",
            parameters: {
              type: "object",
              properties: {
                health_score: { type: "integer", description: "1-10 där 10 är perfekt" },
                headline: { type: "string", description: "Kort sammanfattning, 1 mening" },
                strengths: { type: "array", items: { type: "string" }, description: "2-4 styrkor" },
                issues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      severity: { type: "string", enum: ["critical", "warning", "info"] },
                      title: { type: "string" },
                      detail: { type: "string" },
                      fix: { type: "string" },
                      impact_sek: { type: "number", description: "Uppskattad besparing/uplift per månad" },
                    },
                    required: ["severity", "title", "fix"],
                  },
                },
                quick_wins: { type: "array", items: { type: "string" }, description: "3-5 åtgärder att göra idag" },
              },
              required: ["health_score", "headline", "strengths", "issues", "quick_wins"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "ads_health_report" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) throw new Error("RATE_LIMITED: Lovable AI rate limit");
      if (aiRes.status === 402) throw new Error("PAYMENT_REQUIRED: Slut på AI-krediter");
      throw new Error(`AI_ERROR: ${aiRes.status} ${t.slice(0, 300)}`);
    }
    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    const summary = toolCall ? JSON.parse(toolCall.function.arguments) : { health_score: 0, headline: "Kunde inte generera", strengths: [], issues: [], quick_wins: [] };

    const { data: inserted, error: insErr } = await admin.from("ads_audits").insert({
      project_id,
      health_score: summary.health_score,
      summary,
      raw: summaryInput,
      customer_id: customerId,
    }).select().single();
    if (insErr) throw insErr;

    return json({ ok: true, audit: inserted });
  } catch (e: any) {
    console.error("ads-audit", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    const map: Record<string, number> = { NO_ADS_CUSTOMER: 400, RATE_LIMITED: 429, PAYMENT_REQUIRED: 402, MISSING_ADS_SCOPE: 403, AI_ERROR: 502 };
    return json({ error: msg, code }, map[code] ?? 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
