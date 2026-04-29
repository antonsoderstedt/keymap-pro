// Fetches Google Ads campaign-level Impression Share metrics (Search) for a project.
// Stores result in auction_insights_snapshots.
// Note: True per-domain auction_insight metrics are not available via the Ads API REST surface;
// we surface campaign-level IS + lost-share so users can act on it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    const { project_id, customer_id, days = 30 } = await req.json();
    if (!project_id || !customer_id) throw new Error("project_id and customer_id required");

    const ctx = await getAdsContext(auth);
    const end = new Date();
    const start = new Date(); start.setDate(end.getDate() - days);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Campaign-level IS / lost-share (this is what actually exists in v21)
    const campRows = await searchGaql(ctx, customer_id, `
      SELECT campaign.id, campaign.name,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share,
        metrics.search_rank_lost_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions
      FROM campaign
      WHERE segments.date BETWEEN '${fmt(start)}' AND '${fmt(end)}'
        AND campaign.advertising_channel_type = 'SEARCH'
        AND campaign.status = 'ENABLED'
      LIMIT 100
    `);

    const campaigns = (campRows || []).map((r: any) => ({
      id: r.campaign?.id,
      name: r.campaign?.name,
      impressionShare: r.metrics?.searchImpressionShare ?? null,
      topIS: r.metrics?.searchTopImpressionShare ?? null,
      absTopIS: r.metrics?.searchAbsoluteTopImpressionShare ?? null,
      lostRank: r.metrics?.searchRankLostImpressionShare ?? null,
      lostBudget: r.metrics?.searchBudgetLostImpressionShare ?? null,
      cost: Number(r.metrics?.costMicros || 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions || 0),
      clicks: Number(r.metrics?.clicks || 0),
      impressions: Number(r.metrics?.impressions || 0),
    }));

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await supabase.from("auction_insights_snapshots").insert({
      project_id,
      start_date: fmt(start),
      end_date: fmt(end),
      rows: { competitors: [], campaigns },
    });
    if (error) throw error;

    return json({ ok: true, competitors: 0, campaigns: campaigns.length });
  } catch (e: any) {
    console.error("ads-fetch-auction-insights", e);
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
