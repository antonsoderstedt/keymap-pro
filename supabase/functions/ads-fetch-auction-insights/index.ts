// Fetches Google Ads Auction Insights for a project's linked customer ID.
// Stores result in auction_insights_snapshots.
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

    // Campaign-level auction insights (search)
    const query = `
      SELECT
        campaign.id, campaign.name,
        campaign_search_term_insight.category_label,
        ad_group_criterion_simulation.cpc_bid_point_list,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share,
        metrics.search_rank_lost_impression_share,
        metrics.search_budget_lost_impression_share
      FROM campaign
      WHERE segments.date BETWEEN '${fmt(start)}' AND '${fmt(end)}'
        AND campaign.advertising_channel_type = 'SEARCH'
      LIMIT 50
    `;

    // Auction insights are exposed via the dedicated report
    const aiQuery = `
      SELECT
        auction_insight_domain.domain,
        metrics.search_impression_share,
        metrics.search_overlap_rate,
        metrics.search_position_above_rate,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share,
        metrics.search_outranking_share,
        campaign.id, campaign.name
      FROM campaign_audience_view
      WHERE segments.date BETWEEN '${fmt(start)}' AND '${fmt(end)}'
      LIMIT 200
    `;

    let rows: any[] = [];
    try {
      // Newer Ads API exposes "domain auction insights" via this report:
      const insights = await searchGaql(ctx, customer_id, `
        SELECT
          auction_insight_domain.domain,
          metrics.search_impression_share,
          metrics.search_overlap_rate,
          metrics.search_position_above_rate,
          metrics.search_top_impression_share,
          metrics.search_absolute_top_impression_share,
          metrics.search_outranking_share,
          campaign.name
        FROM domain_category
        WHERE segments.date DURING LAST_30_DAYS
        LIMIT 200
      `).catch(() => []);
      rows = insights.map((r: any) => ({
        domain: r.auctionInsightDomain?.domain ?? r.domain ?? "unknown",
        impressionShare: r.metrics?.searchImpressionShare ?? null,
        overlapRate: r.metrics?.searchOverlapRate ?? null,
        positionAbove: r.metrics?.searchPositionAboveRate ?? null,
        topOfPage: r.metrics?.searchTopImpressionShare ?? null,
        absTopOfPage: r.metrics?.searchAbsoluteTopImpressionShare ?? null,
        outrankShare: r.metrics?.searchOutrankingShare ?? null,
        campaign: r.campaign?.name ?? null,
      }));
    } catch (e) {
      console.warn("Auction insights query unsupported, returning campaign IS only", e);
    }

    // Always also fetch campaign-level IS as fallback / supplement
    const campRows = await searchGaql(ctx, customer_id, `
      SELECT campaign.id, campaign.name,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_rank_lost_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.cost_micros, metrics.conversions, metrics.clicks
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.advertising_channel_type = 'SEARCH'
      LIMIT 100
    `).catch(() => []);

    const campaigns = campRows.map((r: any) => ({
      id: r.campaign?.id, name: r.campaign?.name,
      impressionShare: r.metrics?.searchImpressionShare,
      topIS: r.metrics?.searchTopImpressionShare,
      lostRank: r.metrics?.searchRankLostImpressionShare,
      lostBudget: r.metrics?.searchBudgetLostImpressionShare,
      cost: (Number(r.metrics?.costMicros || 0)) / 1_000_000,
      conversions: Number(r.metrics?.conversions || 0),
      clicks: Number(r.metrics?.clicks || 0),
    }));

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await supabase.from("auction_insights_snapshots").insert({
      project_id, start_date: fmt(start), end_date: fmt(end),
      rows: { competitors: rows, campaigns },
    });
    if (error) throw error;

    return json({ ok: true, competitors: rows.length, campaigns: campaigns.length });
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
