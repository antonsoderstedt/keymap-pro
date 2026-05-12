// ads-fetch-account-tree — hämtar hela kontoträdet (campaigns → ad_groups → keywords + ads + negatives)
// via GAQL och cachar 15 min i ads_account_tree_cache. Endast läs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TTL_SEC = 900; // 15 min

const num = (v: unknown) => Number(v ?? 0);
const micros = (v: unknown) => Math.round(num(v) / 1_000_000);

interface MetricsTotals {
  clicks: number;
  impressions: number;
  cost_sek: number;
  conversions: number;
  conv_value_sek: number;
  ctr: number;
  cpa_sek: number | null;
  roas: number | null;
}

const empty = (): MetricsTotals => ({
  clicks: 0, impressions: 0, cost_sek: 0, conversions: 0, conv_value_sek: 0, ctr: 0, cpa_sek: null, roas: null,
});

function finalize(m: MetricsTotals): MetricsTotals {
  m.ctr = m.impressions > 0 ? m.clicks / m.impressions : 0;
  m.cpa_sek = m.conversions > 0 ? m.cost_sek / m.conversions : null;
  m.roas = m.cost_sek > 0 ? m.conv_value_sek / m.cost_sek : null;
  return m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const { project_id, force = false } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings")
      .select("ads_customer_id")
      .eq("project_id", project_id)
      .maybeSingle();
    if (!settings?.ads_customer_id) {
      return new Response(JSON.stringify({ error: "NO_ADS_CUSTOMER" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cid = String(settings.ads_customer_id).replace(/[^0-9]/g, "");

    if (!force) {
      const { data: cached } = await admin
        .from("ads_account_tree_cache")
        .select("tree, fetched_at")
        .eq("project_id", project_id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.tree && cached.fetched_at) {
        const ageSec = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
        if (ageSec < TTL_SEC) {
          return new Response(JSON.stringify({
            tree: cached.tree, fetched_at: cached.fetched_at, cache_hit: true, customer_id: cid,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const ctx = await getAdsContext(req.headers.get("Authorization"));

    const [campaignsRaw, adGroupsRaw, keywordsRaw, adsRaw, negsCampaignRaw] = await Promise.all([
      searchGaql(ctx, cid, `
        SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
          campaign.bidding_strategy_type, campaign.optimization_score,
          campaign.target_cpa.target_cpa_micros, campaign.maximize_conversion_value.target_roas,
          campaign_budget.amount_micros,
          metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE segments.date DURING LAST_30_DAYS
          AND campaign.status != 'REMOVED'
      `).catch(() => []),
      searchGaql(ctx, cid, `
        SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.type,
          ad_group.cpc_bid_micros,
          metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions,
          metrics.conversions_value
        FROM ad_group
        WHERE segments.date DURING LAST_30_DAYS
          AND ad_group.status != 'REMOVED'
      `).catch(() => []),
      searchGaql(ctx, cid, `
        SELECT campaign.id, ad_group.id,
          ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type, ad_group_criterion.status,
          ad_group_criterion.quality_info.quality_score,
          ad_group_criterion.cpc_bid_micros,
          metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions,
          metrics.conversions_value
        FROM keyword_view
        WHERE segments.date DURING LAST_30_DAYS
          AND ad_group_criterion.status != 'REMOVED'
        LIMIT 5000
      `).catch(() => []),
      searchGaql(ctx, cid, `
        SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.type,
          ad_group_ad.status, ad_group_ad.ad_strength,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions,
          ad_group_ad.ad.responsive_search_ad.path1,
          ad_group_ad.ad.responsive_search_ad.path2,
          ad_group_ad.ad.final_urls,
          metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
        FROM ad_group_ad
        WHERE ad_group_ad.status != 'REMOVED'
          AND segments.date DURING LAST_30_DAYS
        LIMIT 2000
      `).catch(() => []),
      searchGaql(ctx, cid, `
        SELECT campaign.id, campaign_criterion.criterion_id,
          campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
        FROM campaign_criterion
        WHERE campaign_criterion.negative = TRUE
          AND campaign_criterion.type = 'KEYWORD'
        LIMIT 2000
      `).catch(() => []),
    ]);

    // Build campaigns
    const campaigns = new Map<string, any>();
    for (const r of campaignsRaw as any[]) {
      const id = String(r.campaign?.id ?? "");
      if (!id) continue;
      let c = campaigns.get(id);
      if (!c) {
        c = {
          id,
          name: String(r.campaign?.name ?? ""),
          status: String(r.campaign?.status ?? ""),
          channel: String(r.campaign?.advertisingChannelType ?? ""),
          bidding_strategy_type: String(r.campaign?.biddingStrategyType ?? ""),
          optimization_score: r.campaign?.optimizationScore ?? null,
          target_cpa_sek: r.campaign?.targetCpa?.targetCpaMicros ? micros(r.campaign.targetCpa.targetCpaMicros) : null,
          target_roas: r.campaign?.maximizeConversionValue?.targetRoas ?? null,
          daily_budget_sek: micros(r.campaignBudget?.amountMicros),
          metrics_30d: empty(),
          ad_groups: [] as any[],
          negatives: [] as any[],
        };
        campaigns.set(id, c);
      }
      c.metrics_30d.clicks += num(r.metrics?.clicks);
      c.metrics_30d.impressions += num(r.metrics?.impressions);
      c.metrics_30d.cost_sek += micros(r.metrics?.costMicros);
      c.metrics_30d.conversions += num(r.metrics?.conversions);
      c.metrics_30d.conv_value_sek += num(r.metrics?.conversionsValue);
    }
    for (const c of campaigns.values()) finalize(c.metrics_30d);

    // Ad groups
    const adGroups = new Map<string, any>();
    for (const r of adGroupsRaw as any[]) {
      const cid_ = String(r.campaign?.id ?? "");
      const agid = String(r.adGroup?.id ?? "");
      if (!agid) continue;
      let g = adGroups.get(agid);
      if (!g) {
        g = {
          id: agid,
          campaign_id: cid_,
          name: String(r.adGroup?.name ?? ""),
          status: String(r.adGroup?.status ?? ""),
          type: String(r.adGroup?.type ?? ""),
          cpc_bid_sek: r.adGroup?.cpcBidMicros ? micros(r.adGroup.cpcBidMicros) : null,
          metrics_30d: empty(),
          keywords: [] as any[],
          ads: [] as any[],
        };
        adGroups.set(agid, g);
      }
      g.metrics_30d.clicks += num(r.metrics?.clicks);
      g.metrics_30d.impressions += num(r.metrics?.impressions);
      g.metrics_30d.cost_sek += micros(r.metrics?.costMicros);
      g.metrics_30d.conversions += num(r.metrics?.conversions);
      g.metrics_30d.conv_value_sek += num(r.metrics?.conversionsValue);
    }
    for (const g of adGroups.values()) finalize(g.metrics_30d);

    // Keywords (aggregate by criterion+ag, since keyword_view returns per-day)
    const kwMap = new Map<string, any>();
    for (const r of keywordsRaw as any[]) {
      const agid = String(r.adGroup?.id ?? "");
      const crit = String(r.adGroupCriterion?.criterionId ?? "");
      const key = `${agid}~${crit}`;
      let k = kwMap.get(key);
      if (!k) {
        k = {
          ad_group_id: agid,
          criterion_id: crit,
          text: String(r.adGroupCriterion?.keyword?.text ?? ""),
          match_type: String(r.adGroupCriterion?.keyword?.matchType ?? ""),
          status: String(r.adGroupCriterion?.status ?? ""),
          quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
          cpc_bid_sek: r.adGroupCriterion?.cpcBidMicros ? micros(r.adGroupCriterion.cpcBidMicros) : null,
          metrics_30d: empty(),
        };
        kwMap.set(key, k);
      }
      k.metrics_30d.clicks += num(r.metrics?.clicks);
      k.metrics_30d.impressions += num(r.metrics?.impressions);
      k.metrics_30d.cost_sek += micros(r.metrics?.costMicros);
      k.metrics_30d.conversions += num(r.metrics?.conversions);
      k.metrics_30d.conv_value_sek += num(r.metrics?.conversionsValue);
    }
    for (const k of kwMap.values()) {
      finalize(k.metrics_30d);
      const g = adGroups.get(k.ad_group_id);
      if (g) g.keywords.push(k);
    }

    // Ads (aggregate by ad_id)
    const adMap = new Map<string, any>();
    for (const r of adsRaw as any[]) {
      const agid = String(r.adGroup?.id ?? "");
      const aid = String(r.adGroupAd?.ad?.id ?? "");
      if (!aid) continue;
      const key = `${agid}~${aid}`;
      let a = adMap.get(key);
      if (!a) {
        const rsa = r.adGroupAd?.ad?.responsiveSearchAd;
        a = {
          ad_group_id: agid,
          ad_id: aid,
          type: String(r.adGroupAd?.ad?.type ?? ""),
          status: String(r.adGroupAd?.status ?? ""),
          ad_strength: String(r.adGroupAd?.adStrength ?? ""),
          rsa: rsa
            ? {
                headlines: (rsa.headlines || []).map((h: any) => h.text),
                descriptions: (rsa.descriptions || []).map((d: any) => d.text),
                path1: rsa.path1 ?? "",
                path2: rsa.path2 ?? "",
              }
            : null,
          final_urls: r.adGroupAd?.ad?.finalUrls || [],
          metrics_30d: empty(),
        };
        adMap.set(key, a);
      }
      a.metrics_30d.clicks += num(r.metrics?.clicks);
      a.metrics_30d.impressions += num(r.metrics?.impressions);
      a.metrics_30d.cost_sek += micros(r.metrics?.costMicros);
      a.metrics_30d.conversions += num(r.metrics?.conversions);
    }
    for (const a of adMap.values()) {
      finalize(a.metrics_30d);
      const g = adGroups.get(a.ad_group_id);
      if (g) g.ads.push(a);
    }

    // Hook ad groups into campaigns
    for (const g of adGroups.values()) {
      const c = campaigns.get(g.campaign_id);
      if (c) c.ad_groups.push(g);
    }

    // Negative keywords (campaign-level)
    for (const r of negsCampaignRaw as any[]) {
      const cid_ = String(r.campaign?.id ?? "");
      const c = campaigns.get(cid_);
      if (!c) continue;
      c.negatives.push({
        criterion_id: String(r.campaignCriterion?.criterionId ?? ""),
        text: String(r.campaignCriterion?.keyword?.text ?? ""),
        match_type: String(r.campaignCriterion?.keyword?.matchType ?? ""),
      });
    }

    const tree = {
      customer_id: cid,
      fetched_at: new Date().toISOString(),
      campaigns: Array.from(campaigns.values()).sort((a, b) => b.metrics_30d.cost_sek - a.metrics_30d.cost_sek),
    };

    // Save cache (delete old entries to keep table small)
    await admin.from("ads_account_tree_cache").delete().eq("project_id", project_id);
    await admin.from("ads_account_tree_cache").insert({
      project_id, customer_id: cid, tree, ttl_seconds: TTL_SEC,
    });

    return new Response(JSON.stringify({
      tree, fetched_at: tree.fetched_at, cache_hit: false, customer_id: cid, duration_ms: Date.now() - t0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ads-fetch-account-tree error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
