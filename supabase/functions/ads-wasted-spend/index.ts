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

    // Tracking probe: kollar om NÅGOT konto-konverterat senaste 30d.
    // Aktiv = spårning fungerar (problem nedströms). Missing = spårning saknas troligen.
    let trackingStatus: "active" | "missing" | "unknown" = "unknown";
    try {
      const probe = await searchGaql(ctx, settings.ads_customer_id, `
        SELECT metrics.conversions
        FROM customer
        WHERE segments.date DURING LAST_30_DAYS
        LIMIT 1
      `);
      const totalConv = probe.reduce((s: number, r: any) => s + Number(r.metrics?.conversions || 0), 0);
      trackingStatus = totalConv > 0 ? "active" : "missing";
    } catch (e) {
      console.warn("tracking probe failed", e);
    }

    // Hämta primär landningssida per ad_group (mest impressions vinner) — behövs för
    // att kunna gruppera tracking-/landningskontroller per faktisk URL.
    const adGroupIds = Array.from(new Set(rows.map((r: any) => String(r.adGroup?.id ?? "")).filter(Boolean)));
    const landingByAdGroup: Record<string, string> = {};
    if (adGroupIds.length > 0) {
      try {
        const adRows = await searchGaql(ctx, settings.ads_customer_id, `
          SELECT ad_group.id, ad_group_ad.ad.final_urls, metrics.impressions
          FROM ad_group_ad
          WHERE segments.date DURING LAST_30_DAYS
            AND ad_group.id IN (${adGroupIds.join(",")})
            AND ad_group_ad.status = 'ENABLED'
          ORDER BY metrics.impressions DESC
        `);
        for (const ar of adRows as any[]) {
          const agId = String(ar.adGroup?.id ?? "");
          const urls: string[] = ar.adGroupAd?.ad?.finalUrls || [];
          if (agId && urls[0] && !landingByAdGroup[agId]) landingByAdGroup[agId] = urls[0];
        }
      } catch (e) {
        console.warn("landing page fetch failed", e);
      }
    }

    const wasted = rows.map((r: any) => {
      const cost = Math.round(Number(r.metrics?.costMicros || 0) / 1_000_000 * 100) / 100;
      const clicks = Number(r.metrics?.clicks || 0);
      const ctr = Number(r.metrics?.ctr || 0); // 0..1
      const qs = r.adGroupCriterion?.qualityInfo?.qualityScore ?? null;

      let action = "Granska manuellt";

      const highCtr = ctr >= 0.05;
      const lowCtr = ctr < 0.01 && clicks > 5;
      const highQs = qs != null && qs >= 7;
      const lowQs = qs != null && qs <= 4;

      if (trackingStatus === "missing") {
        action = "Installera/verifiera konverteringsspårning (hela kontot)";
      } else if (highCtr && highQs) {
        action = trackingStatus === "active"
          ? "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)"
          : "Kontrollera landningssida & konverteringsspårning";
      } else if (lowCtr) {
        action = "Lägg som negativt sökord";
      } else if (lowQs) {
        action = "Förbättra QS eller pausa";
      } else if (cost > 1000) {
        action = "Sänk maxbud −40%";
      } else if (clicks <= 3) {
        action = "För lite data — vänta";
      }
      const agId = String(r.adGroup?.id ?? "");
      return {
        keyword: r.adGroupCriterion?.keyword?.text,
        match_type: r.adGroupCriterion?.keyword?.matchType,
        criterion_id: String(r.adGroupCriterion?.criterionId ?? ""),
        campaign: r.campaign?.name,
        campaign_id: String(r.campaign?.id ?? ""),
        ad_group: r.adGroup?.name,
        ad_group_id: agId,
        landing_page: landingByAdGroup[agId] || null,
        cost_sek: cost,
        clicks,
        ctr: Math.round(ctr * 10000) / 100,
        quality_score: qs,
        tracking_status: trackingStatus,
        suggested_action: action,
      };
    });

    // Aggregera landningssidor som berörs av tracking-/landningskontroller.
    // Grupperar per URL och räknar keywords + total cost/clicks. Sorterad på
    // total cost desc så att de mest prioriterade ligger högst.
    const landingMap = new Map<string, { url: string; keywords: string[]; total_cost_sek: number; total_clicks: number; campaigns: Set<string>; needs_check: boolean }>();
    for (const w of wasted) {
      if (!w.landing_page) continue;
      const needsCheck = w.suggested_action.startsWith("Kontrollera landningssida")
        || w.suggested_action.startsWith("Installera/verifiera");
      const key = w.landing_page;
      const entry = landingMap.get(key) || { url: key, keywords: [], total_cost_sek: 0, total_clicks: 0, campaigns: new Set<string>(), needs_check: false };
      if (w.keyword) entry.keywords.push(w.keyword);
      entry.total_cost_sek += w.cost_sek;
      entry.total_clicks += w.clicks;
      if (w.campaign) entry.campaigns.add(w.campaign);
      if (needsCheck) entry.needs_check = true;
      landingMap.set(key, entry);
    }
    const landing_pages = Array.from(landingMap.values())
      .map((e) => ({
        url: e.url,
        keyword_count: e.keywords.length,
        keywords: e.keywords,
        total_cost_sek: Math.round(e.total_cost_sek * 100) / 100,
        total_clicks: e.total_clicks,
        campaigns: Array.from(e.campaigns),
        needs_check: e.needs_check,
      }))
      .sort((a, b) => b.total_cost_sek - a.total_cost_sek);

    const totalWaste = wasted.reduce((s, w) => s + w.cost_sek, 0);

    let createdItems = 0;
    if (create_action_items && wasted.length > 0) {
      const top = wasted.slice(0, 5);
      const trackingNote = trackingStatus === "active"
        ? "Spårning verkar aktiv på kontot — problemet ligger troligen på landningssidan."
        : trackingStatus === "missing"
          ? "INGEN konvertering registrerad på hela kontot senaste 30d — spårning är troligen ej installerad."
          : "Spårningsstatus okänd.";
      const items = top.map((w) => {
        const isTrackingFix = trackingStatus === "missing";
        const isLandingCheck = w.suggested_action.startsWith("Kontrollera landningssida");
        // Datavolymen styr alltid prioriteten — ett sökord med 200 klick & 2000 SEK
        // är alltid viktigare att åtgärda än ett med 5 klick & 50 SEK,
        // även om det är tracking/landningskontroll.
        const dataPriority: "high" | "medium" | "low" =
          w.cost_sek >= 1000 || w.clicks >= 100
            ? "high"
            : w.cost_sek >= 200 || w.clicks >= 25
              ? "medium"
              : "low";
        return {
          project_id,
          title: `${w.suggested_action}: "${w.keyword}"`,
          description: `Kampanj "${w.campaign}" — ${w.cost_sek} SEK på 30d, ${w.clicks} klick, CTR ${w.ctr}%, 0 konverteringar${w.quality_score ? `, QS ${w.quality_score}` : ""}.\n\n${trackingNote}`,
          category: "ads",
          priority: dataPriority,
          status: "open",
          source_type: "ads_wasted_spend",
          source_payload: w,
          tracking_status: trackingStatus,
          expected_impact: isTrackingFix
            ? "Lås upp ROI-mätning för hela kontot"
            : isLandingCheck
              ? `Lås upp konverteringar (sökordet driver redan ${w.clicks} klick/30d)`
              : `Spara ~${w.cost_sek} SEK/månad`,
          expected_impact_sek: (isTrackingFix || isLandingCheck) ? 0 : w.cost_sek,
        };
      });
      const { error } = await admin.from("action_items").insert(items);
      if (!error) createdItems = items.length;
    }

    return json({
      ok: true,
      wasted,
      landing_pages,
      tracking_status: trackingStatus,
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
