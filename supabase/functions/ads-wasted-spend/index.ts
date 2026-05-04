// Wasted Spend Finder — hittar keywords med spend men inga konverteringar de senaste 30 dagarna.
// Skapar topp-N som action_items med expected_savings_sek.
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
    const { project_id, min_cost_sek = 200, create_action_items = true } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings").select("ads_customer_id").eq("project_id", project_id).maybeSingle();
    if (!settings?.ads_customer_id) throw new Error("NO_ADS_CUSTOMER: Inget Google Ads-konto valt");

    const ctx = await getAdsContext(req.headers.get("Authorization"));

    const minMicros = Math.round(min_cost_sek * 1_000_000);
    const rows = await searchGaql(ctx, settings.ads_customer_id, `
      SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr, metrics.conversions,
        campaign.id, campaign.name, ad_group.id, ad_group.name
      FROM keyword_view
      WHERE segments.date DURING LAST_30_DAYS
        AND metrics.conversions = 0
        AND metrics.cost_micros >= ${minMicros}
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `);

    const wasted = rows.map((r: any) => {
      const cost = Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000 * 100) / 100;
      const clicks = Number(r.metrics?.clicks || 0);
      const ctr = Number(r.metrics?.ctr || 0); // 0..1
      const qs = r.adGroupCriterion?.qualityInfo?.qualityScore ?? null;

      // Default: granska manuellt (säkrast — pausa aldrig blint)
      let action = "Granska manuellt";

      const highCtr = ctr >= 0.05;        // ≥ 5%
      const lowCtr = ctr < 0.01 && clicks > 5;
      const highQs = qs != null && qs >= 7;
      const lowQs = qs != null && qs <= 4;

      if (highCtr && highQs) {
        // Kärnsökord presterar — annonsen funkar, problemet ligger nedströms
        action = "Kontrollera landningssida & konverteringsspårning";
      } else if (lowCtr) {
        action = "Lägg som negativt sökord";
      } else if (lowQs) {
        action = "Förbättra QS eller pausa";
      } else if (cost > 1000) {
        action = "Sänk maxbud −40%";
      } else if (clicks <= 3) {
        // Knappt någon data — för tidigt att agera
        action = "För lite data — vänta";
      }
      return {
        keyword: r.adGroupCriterion?.keyword?.text,
        match_type: r.adGroupCriterion?.keyword?.matchType,
        criterion_id: String(r.adGroupCriterion?.criterionId ?? ""),
        campaign: r.campaign?.name,
        campaign_id: String(r.campaign?.id ?? ""),
        ad_group: r.adGroup?.name,
        ad_group_id: String(r.adGroup?.id ?? ""),
        cost_sek: cost,
        clicks,
        ctr: Math.round(ctr * 10000) / 100,
        quality_score: qs,
        suggested_action: action,
      };
    });

    const totalWaste = wasted.reduce((s, w) => s + w.cost_sek, 0);

    let createdItems = 0;
    if (create_action_items && wasted.length > 0) {
      const top = wasted.slice(0, 5);
      const items = top.map((w) => {
        const isTrackingCheck = w.suggested_action.startsWith("Kontrollera landningssida");
        return {
          project_id,
          title: `${w.suggested_action}: "${w.keyword}"`,
          description: `Kampanj "${w.campaign}" — ${w.cost_sek} SEK på 30d, ${w.clicks} klick, CTR ${w.ctr}%, 0 konverteringar${w.quality_score ? `, QS ${w.quality_score}` : ""}.`,
          category: "ads",
          priority: w.cost_sek > 500 ? "high" : "medium",
          status: "open",
          source_type: "ads_wasted_spend",
          source_payload: w,
          expected_impact: isTrackingCheck
            ? `Lås upp konverteringar (sökordet driver redan ${w.clicks} klick/30d)`
            : `Spara ~${w.cost_sek} SEK/månad`,
          expected_impact_sek: isTrackingCheck ? 0 : w.cost_sek,
        };
      });
      const { error } = await admin.from("action_items").insert(items);
      if (!error) createdItems = items.length;
    }

    return json({
      ok: true,
      wasted,
      total_wasted_sek: Math.round(totalWaste * 100) / 100,
      action_items_created: createdItems,
    });
  } catch (e: any) {
    console.error("ads-wasted-spend", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    return json({ error: msg, code }, code === "NO_ADS_CUSTOMER" ? 400 : 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
