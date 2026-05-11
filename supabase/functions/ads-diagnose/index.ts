// ads-diagnose — Fas 0: skelett som returnerar account_health + ev. blockers.
// Inga regler i Fas 0; tom diagnoses-array. AdsAudit/AuctionInsights ändras inte här.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";
import { evaluateGates } from "../_shared/diagnostics/gates.ts";
import { applyRootCauseTree, detectBrand, estimateValue } from "../_shared/diagnostics/tree.ts";
import { runAllRules } from "../_shared/diagnostics/runner.ts";
import type {
  AccountSnapshot,
  AdGroupSnapshot,
  AdSnapshot,
  CampaignSnapshot,
  Diagnosis,
  DiagnosisReport,
  KeywordSnapshot,
  ProjectGoals,
} from "../_shared/diagnostics/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function hourBucket(d = new Date()): string {
  return d.toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
}

function micros(v: unknown): number {
  return Number(v ?? 0);
}

async function buildSnapshot(
  ctx: Awaited<ReturnType<typeof getAdsContext>>,
  customerId: string,
  goals: ProjectGoals | null,
): Promise<AccountSnapshot> {
  const brandTerms = goals?.brand_terms ?? [];

  const [campaignsRaw, customerRaw, conversionActions, changeHistory] = await Promise.all([
    searchGaql(
      ctx,
      customerId,
      `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros, campaign.maximize_conversion_value.target_roas,
        campaign_budget.amount_micros,
        metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions,
        metrics.ctr, metrics.average_cpc,
        metrics.search_impression_share, metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share,
        segments.date
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status != 'REMOVED'
    `,
    ).catch(() => []),
    searchGaql(
      ctx,
      customerId,
      `SELECT customer.id, customer.descriptive_name, customer.optimization_score FROM customer LIMIT 1`,
    ).catch(() => []),
    searchGaql(
      ctx,
      customerId,
      `SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.primary_for_goal
       FROM conversion_action WHERE conversion_action.status = 'ENABLED'`,
    ).catch(() => []),
    searchGaql(
      ctx,
      customerId,
      `SELECT change_event.change_date_time, change_event.campaign, change_event.change_resource_type, change_event.changed_fields
       FROM change_event WHERE change_event.change_date_time DURING LAST_14_DAYS LIMIT 500`,
    ).catch(() => []),
  ]);

  // Aggregera kampanjmetrics (raderna är per dag) → 30d totals
  const byCampaign = new Map<string, CampaignSnapshot>();
  for (const r of campaignsRaw as any[]) {
    const id = String(r.campaign?.id ?? "");
    if (!id) continue;
    let snap = byCampaign.get(id);
    if (!snap) {
      const name = String(r.campaign?.name ?? "");
      snap = {
        id,
        name,
        status: String(r.campaign?.status ?? ""),
        type: String(r.campaign?.advertisingChannelType ?? r.campaign?.advertising_channel_type ?? ""),
        bidding_strategy_type: String(r.campaign?.biddingStrategyType ?? r.campaign?.bidding_strategy_type ?? ""),
        target_cpa_micros: micros(r.campaign?.targetCpa?.targetCpaMicros),
        target_roas: Number(r.campaign?.maximizeConversionValue?.targetRoas ?? 0) || undefined,
        daily_budget_micros: micros(r.campaignBudget?.amountMicros),
        is_brand: detectBrand(name, brandTerms),
        metrics_7d: emptyMetrics(),
        metrics_30d: emptyMetrics(),
        ad_groups: [],
      };
      byCampaign.set(id, snap);
    }
    const cost = micros(r.metrics?.costMicros);
    const clicks = Number(r.metrics?.clicks ?? 0);
    const imps = Number(r.metrics?.impressions ?? 0);
    const conv = Number(r.metrics?.conversions ?? 0);
    snap.metrics_30d.clicks += clicks;
    snap.metrics_30d.impressions += imps;
    snap.metrics_30d.cost_micros += cost;
    snap.metrics_30d.conversions += conv;
    // last 7 days
    const date = String(r.segments?.date ?? "");
    if (date && isWithinDays(date, 7)) {
      snap.metrics_7d.clicks += clicks;
      snap.metrics_7d.impressions += imps;
      snap.metrics_7d.cost_micros += cost;
      snap.metrics_7d.conversions += conv;
    }
    // IS-värden — ta sista observationen
    if (r.metrics?.searchImpressionShare !== undefined) {
      snap.metrics_30d.search_impression_share = Number(r.metrics.searchImpressionShare);
    }
    if (r.metrics?.searchBudgetLostImpressionShare !== undefined) {
      snap.metrics_30d.search_budget_lost_is = Number(r.metrics.searchBudgetLostImpressionShare);
    }
    if (r.metrics?.searchRankLostImpressionShare !== undefined) {
      snap.metrics_30d.search_rank_lost_is = Number(r.metrics.searchRankLostImpressionShare);
    }
  }

  // Härled CTR/CPC
  for (const c of byCampaign.values()) {
    c.metrics_30d.ctr = c.metrics_30d.impressions > 0
      ? c.metrics_30d.clicks / c.metrics_30d.impressions
      : 0;
    c.metrics_30d.avg_cpc_micros = c.metrics_30d.clicks > 0
      ? Math.round(c.metrics_30d.cost_micros / c.metrics_30d.clicks)
      : 0;
    c.metrics_7d.ctr = c.metrics_7d.impressions > 0
      ? c.metrics_7d.clicks / c.metrics_7d.impressions
      : 0;
    c.metrics_7d.avg_cpc_micros = c.metrics_7d.clicks > 0
      ? Math.round(c.metrics_7d.cost_micros / c.metrics_7d.clicks)
      : 0;
  }

  // Hämta keywords + ads för aktiva kampanjer (parallellt, separata queries pga GAQL-restriktioner)
  const activeCampaignIds = Array.from(byCampaign.keys());
  const [keywordsRaw, adsRaw] = activeCampaignIds.length === 0
    ? [[], []]
    : await Promise.all([
      searchGaql(
        ctx,
        customerId,
        `SELECT campaign.id, ad_group.id, ad_group.name,
           ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           ad_group_criterion.quality_info.quality_score,
           ad_group_criterion.quality_info.creative_quality_score,
           ad_group_criterion.quality_info.post_click_quality_score,
           ad_group_criterion.quality_info.search_predicted_ctr,
           metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr
         FROM keyword_view
         WHERE segments.date DURING LAST_30_DAYS
           AND ad_group_criterion.status = 'ENABLED'
         LIMIT 5000`,
      ).catch(() => []),
      searchGaql(
        ctx,
        customerId,
        `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad_strength,
           ad_group_ad.policy_summary.approval_status
         FROM ad_group_ad
         WHERE ad_group_ad.status = 'ENABLED'
         LIMIT 5000`,
      ).catch(() => []),
    ]);

  // Bygg ad_groups per kampanj från keyword_view
  const adGroupsByCampaign = new Map<string, Map<string, AdGroupSnapshot>>();
  for (const r of keywordsRaw as any[]) {
    const campaignId = String(r.campaign?.id ?? "");
    const adGroupId = String(r.adGroup?.id ?? "");
    if (!campaignId || !adGroupId) continue;
    if (!adGroupsByCampaign.has(campaignId)) adGroupsByCampaign.set(campaignId, new Map());
    const groups = adGroupsByCampaign.get(campaignId)!;
    let group = groups.get(adGroupId);
    if (!group) {
      group = {
        id: adGroupId,
        name: String(r.adGroup?.name ?? ""),
        keywords: [],
        ads: [],
      };
      groups.set(adGroupId, group);
    }
    const kw: KeywordSnapshot = {
      criterion_id: String(r.adGroupCriterion?.criterionId ?? ""),
      text: String(r.adGroupCriterion?.keyword?.text ?? ""),
      match_type: String(r.adGroupCriterion?.keyword?.matchType ?? ""),
      quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
      creative_qs: r.adGroupCriterion?.qualityInfo?.creativeQualityScore ?? null,
      landing_qs: r.adGroupCriterion?.qualityInfo?.postClickQualityScore ?? null,
      search_predicted_ctr: r.adGroupCriterion?.qualityInfo?.searchPredictedCtr ?? null,
      metrics_30d: {
        clicks: Number(r.metrics?.clicks ?? 0),
        impressions: Number(r.metrics?.impressions ?? 0),
        cost_micros: Number(r.metrics?.costMicros ?? 0),
        conversions: Number(r.metrics?.conversions ?? 0),
        ctr: Number(r.metrics?.ctr ?? 0),
      },
    };
    group.keywords.push(kw);
  }

  // Lägg in ads
  for (const r of adsRaw as any[]) {
    const campaignId = String(r.campaign?.id ?? "");
    const adGroupId = String(r.adGroup?.id ?? "");
    const groups = adGroupsByCampaign.get(campaignId);
    if (!groups) continue;
    let group = groups.get(adGroupId);
    if (!group) {
      group = { id: adGroupId, name: "", keywords: [], ads: [] };
      groups.set(adGroupId, group);
    }
    const ad: AdSnapshot = {
      ad_id: String(r.adGroupAd?.ad?.id ?? ""),
      ad_strength: String(r.adGroupAd?.adStrength ?? ""),
      policy_summary_status: String(r.adGroupAd?.policySummary?.approvalStatus ?? ""),
    };
    group.ads.push(ad);
  }

  // Koppla till kampanjsnapshots
  for (const [campaignId, groups] of adGroupsByCampaign) {
    const c = byCampaign.get(campaignId);
    if (c) c.ad_groups = Array.from(groups.values());
  }

  const customer = (customerRaw as any[])[0]?.customer ?? {};
  const changeEvents = (changeHistory as any[]).map((ce) => ({
    campaign_id: ce.changeEvent?.campaign
      ? String(ce.changeEvent.campaign).split("/").pop()
      : undefined,
    change_date: String(ce.changeEvent?.changeDateTime ?? ""),
    change_type: ce.changeEvent?.changeResourceType,
    changed_fields: ce.changeEvent?.changedFields,
  }));

  return {
    customer_id: customerId,
    customer,
    campaigns: Array.from(byCampaign.values()),
    conversion_actions: conversionActions as unknown[],
    change_history_14d: changeEvents,
    goals,
  };
}

function emptyMetrics() {
  return { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0, ctr: 0, avg_cpc_micros: 0 };
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 86_400_000 < days;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();

  try {
    const { project_id, scope = null } = await req.json();
    if (!project_id) {
      return jsonError("project_id required", 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const [{ data: settings }, { data: goalsRow }] = await Promise.all([
      admin
        .from("project_google_settings")
        .select("ads_customer_id")
        .eq("project_id", project_id)
        .maybeSingle(),
      admin
        .from("project_goals")
        .select("conversion_type, conversion_value, conversion_rate_pct, brand_terms, strategy_split")
        .eq("project_id", project_id)
        .maybeSingle(),
    ]);

    if (!settings?.ads_customer_id) {
      return jsonError("NO_ADS_CUSTOMER: Inget Google Ads-konto valt", 400);
    }

    const customerId: string = settings.ads_customer_id;
    const goals: ProjectGoals | null = goalsRow
      ? {
        conversion_type: goalsRow.conversion_type ?? "conversion",
        conversion_value: Number(goalsRow.conversion_value ?? 0),
        conversion_rate_pct: Number(goalsRow.conversion_rate_pct ?? 0),
        brand_terms: Array.isArray(goalsRow.brand_terms) ? goalsRow.brand_terms : [],
        strategy_split: (goalsRow.strategy_split as Record<string, number>) ?? {},
      }
      : null;

    // Cache lookup
    const bucket = hourBucket();
    const { data: cached } = await admin
      .from("ads_diagnostics_cache")
      .select("snapshot")
      .eq("project_id", project_id)
      .eq("hour_bucket", bucket)
      .maybeSingle();

    let snapshot: AccountSnapshot;
    let cacheHit = false;
    if (cached?.snapshot) {
      snapshot = cached.snapshot as AccountSnapshot;
      cacheHit = true;
    } else {
      const ctx = await getAdsContext(req.headers.get("Authorization"));
      snapshot = await buildSnapshot(ctx, customerId, goals);
      await admin
        .from("ads_diagnostics_cache")
        .upsert(
          { project_id, customer_id: customerId, hour_bucket: bucket, snapshot },
          { onConflict: "project_id,hour_bucket" },
        );
    }

    // Quality gates
    const { blockers, campaignGates } = evaluateGates(snapshot);

    // Kör regelmotorn — om TRACKING-blocker finns hoppar vi över alla downstream-regler
    let diagnoses: Diagnosis[] = [];
    let rulesEvaluated = 0;
    let rulesFired = 0;
    const hasTrackingBlocker = blockers.some((b) => b.gate === "TRACKING");
    if (!hasTrackingBlocker) {
      const scopedIds = (scope?.campaign_ids ?? null) as string[] | null;
      const result = runAllRules(snapshot, campaignGates, scopedIds ?? undefined);
      diagnoses = result.diagnoses;
      rulesEvaluated = result.evaluated;
      rulesFired = result.fired;
    }

    const sortedDiagnoses = applyRootCauseTree(diagnoses);
    for (const d of sortedDiagnoses) {
      d.estimated_value_sek = estimateValue(d.expected_impact, snapshot.goals);
    }
    sortedDiagnoses.sort(
      (a, b) =>
        (b.confidence * Math.max(b.estimated_value_sek ?? 0, 1)) -
        (a.confidence * Math.max(a.estimated_value_sek ?? 0, 1)),
    );

    const optScore = Number((snapshot.customer as any)?.optimizationScore ?? NaN);
    const report: DiagnosisReport = {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      customer_id: customerId,
      project_id,
      scope: scope ?? null,
      snapshot_window: {
        start: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        end: new Date().toISOString(),
      },
      blockers,
      account_health: {
        optimization_score: Number.isFinite(optScore) ? optScore : null,
        healthy: blockers.length === 0 && (Number.isFinite(optScore) ? optScore >= 0.6 : true),
        summary: blockers.length > 0
          ? `${blockers.length} blocker(s) hittade — åtgärda först.`
          : "Kontot ser stabilt ut på account-nivå.",
      },
      diagnoses: sortedDiagnoses,
      meta: {
        rules_evaluated: rulesEvaluated,
        rules_fired: rulesFired,
        cache_hit: cacheHit,
        duration_ms: Date.now() - t0,
      },
    };

    await admin.from("ads_diagnostics_runs").insert({
      project_id,
      customer_id: customerId,
      scope: scope ?? null,
      rules_evaluated: rulesEvaluated,
      rules_fired: rulesFired,
      cache_hit: cacheHit,
      duration_ms: Date.now() - t0,
      report,
    });

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ads-diagnose error", e);
    const msg = (e as Error).message ?? "internal error";
    const reauthCodes = ["GOOGLE_NOT_CONNECTED", "GOOGLE_REAUTH_REQUIRED", "OAUTH_INVALID", "MISSING_ADS_SCOPE"];
    const matched = reauthCodes.find((c) => msg.includes(c)) ?? (msg === "Google not connected" ? "GOOGLE_NOT_CONNECTED" : null);
    if (matched) {
      return new Response(
        JSON.stringify({ error: msg, code: matched, reauthRequired: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return jsonError(msg, 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
