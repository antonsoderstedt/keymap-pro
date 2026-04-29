// Computes SEO cannibalization: organic top-3 keywords (GSC) that are also being paid for in Google Ads.
// Joins latest gsc_snapshot with Google Ads search_term_view (last 30 days).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function norm(s: string): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Latest GSC snapshot — find organic top-3 queries
    const { data: gsc } = await admin
      .from("gsc_snapshots")
      .select("rows")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const organicTop3 = ((gsc?.rows as any[]) || [])
      .filter((r: any) => r.query && (r.position ?? 99) <= 3 && (r.clicks ?? 0) >= 1)
      .map((r: any) => ({
        keyword: norm(r.query),
        position: r.position,
        organic_clicks: r.clicks ?? 0,
        organic_impressions: r.impressions ?? 0,
        organic_ctr: r.ctr ?? 0,
      }));

    // 2) Look up which Ads customer is linked
    const { data: settings } = await admin
      .from("project_google_settings")
      .select("ads_customer_id")
      .eq("project_id", project_id)
      .maybeSingle();

    if (!settings?.ads_customer_id) {
      return json({ overlap: [], organic_top3_count: organicTop3.length, ads_customer_id: null, message: "Inget Google Ads-konto valt för kunden" });
    }

    // 3) Fetch Ads search terms for last 30 days
    const ctx = await getAdsContext(req.headers.get("Authorization"));
    const gaql = `
      SELECT
        search_term_view.search_term,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        campaign.name
      FROM search_term_view
      WHERE segments.date DURING LAST_30_DAYS
      AND metrics.clicks > 0
    `;
    const rows = await searchGaql(ctx, settings.ads_customer_id, gaql);

    // Aggregate by normalized search term
    const adsMap = new Map<string, { clicks: number; cost: number; conversions: number; campaigns: Set<string> }>();
    for (const r of rows) {
      const term = norm(r.searchTermView?.searchTerm || "");
      if (!term) continue;
      const cur = adsMap.get(term) || { clicks: 0, cost: 0, conversions: 0, campaigns: new Set<string>() };
      cur.clicks += Number(r.metrics?.clicks ?? 0);
      cur.cost += Number(r.metrics?.costMicros ?? 0) / 1_000_000;
      cur.conversions += Number(r.metrics?.conversions ?? 0);
      if (r.campaign?.name) cur.campaigns.add(r.campaign.name);
      adsMap.set(term, cur);
    }

    // 4) Compute overlap
    const overlap = organicTop3
      .map((og) => {
        const ad = adsMap.get(og.keyword);
        if (!ad) return null;
        return {
          keyword: og.keyword,
          organic_position: og.position,
          organic_clicks: og.organic_clicks,
          ads_clicks: ad.clicks,
          ads_cost_sek: Math.round(ad.cost * 100) / 100,
          ads_conversions: Math.round(ad.conversions * 100) / 100,
          campaigns: Array.from(ad.campaigns),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.ads_cost_sek - a.ads_cost_sek);

    const totalWastedSpend = overlap.reduce((s: number, o: any) => s + (o.ads_cost_sek || 0), 0);

    return json({
      overlap,
      organic_top3_count: organicTop3.length,
      ads_search_terms_count: adsMap.size,
      total_potential_savings_sek: Math.round(totalWastedSpend * 100) / 100,
      ads_customer_id: settings.ads_customer_id,
    });
  } catch (e: any) {
    console.error("ads-cannibalization", e);
    const message = e.message || "Unknown error";
    const codeMatch = message.match(/^([A-Z_]+):/);
    const code = codeMatch ? codeMatch[1] : "UNKNOWN";
    const statusMap: Record<string, number> = {
      NOT_AUTHENTICATED: 401,
      GOOGLE_NOT_CONNECTED: 400,
      MISSING_ADS_SCOPE: 403,
      DEVELOPER_TOKEN_NOT_APPROVED: 400,
      DEVELOPER_TOKEN_INVALID: 400,
      DEVELOPER_TOKEN_ERROR: 400,
      MCC_INVALID: 400,
      MCC_ERROR: 400,
      CONFIG_ERROR: 500,
      PERMISSION_DENIED: 403,
      USER_PERMISSION_DENIED: 403,
      OAUTH_INVALID: 401,
      FORBIDDEN: 403,
      ADS_API_ERROR: 502,
    };
    return json({ error: message, code }, statusMap[code] ?? 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
