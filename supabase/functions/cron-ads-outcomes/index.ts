// cron-ads-outcomes — mäter utfall av regel-rekommendationer.
// Kör: jämför kampanjmetrics 14d (och 30d) FÖRE vs EFTER applied_at och sparar i measured_14d/30d.
// Triggas via pg_cron 1 ggr/dag. Idempotent: skriver bara om mätning saknas och perioden är klar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { searchGaql, getAdsContext } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface OutcomeRow {
  id: string;
  project_id: string;
  rule_id: string;
  campaign_id: string | null;
  applied_at: string;
  measured_14d: any;
  measured_30d: any;
  predicted: any;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchCampaignMetricsBetween(
  ctx: Awaited<ReturnType<typeof getAdsContext>>,
  customerId: string,
  campaignId: string,
  startISO: string,
  endISO: string,
) {
  const rows = await searchGaql(
    ctx,
    customerId,
    `SELECT campaign.id,
       metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
     FROM campaign
     WHERE campaign.id = ${campaignId}
       AND segments.date BETWEEN '${startISO}' AND '${endISO}'`,
  ).catch(() => []);
  const tot = { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0 };
  for (const r of rows as any[]) {
    tot.clicks += Number(r.metrics?.clicks ?? 0);
    tot.impressions += Number(r.metrics?.impressions ?? 0);
    tot.cost_micros += Number(r.metrics?.costMicros ?? 0);
    tot.conversions += Number(r.metrics?.conversions ?? 0);
  }
  return tot;
}

function deltaPct(before: number, after: number): number | null {
  if (before <= 0) return after > 0 ? null : 0;
  return Math.round(((after - before) / before) * 1000) / 10; // 1 decimal
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date();

    // Hitta outcomes som behöver mätas (applied_at finns, mätning saknas, period är klar)
    const cutoff14 = new Date(now); cutoff14.setDate(cutoff14.getDate() - 14);
    const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);

    const { data: due14 } = await admin
      .from("ads_recommendation_outcomes")
      .select("id, project_id, rule_id, campaign_id, applied_at, measured_14d, measured_30d, predicted")
      .not("applied_at", "is", null)
      .is("measured_14d", null)
      .lte("applied_at", cutoff14.toISOString())
      .limit(50);

    const { data: due30 } = await admin
      .from("ads_recommendation_outcomes")
      .select("id, project_id, rule_id, campaign_id, applied_at, measured_14d, measured_30d, predicted")
      .not("applied_at", "is", null)
      .is("measured_30d", null)
      .lte("applied_at", cutoff30.toISOString())
      .limit(50);

    const all = new Map<string, OutcomeRow>();
    for (const r of (due14 ?? []) as OutcomeRow[]) all.set(r.id, r);
    for (const r of (due30 ?? []) as OutcomeRow[]) all.set(r.id, { ...(all.get(r.id) ?? r), ...r });

    const measured: any[] = [];
    const skipped: any[] = [];

    // Cache customer_id per projekt + ctx (ctx kräver auth-header — vi använder service-context här)
    const customerCache = new Map<string, string | null>();

    for (const o of all.values()) {
      if (!o.campaign_id) {
        skipped.push({ id: o.id, reason: "no_campaign_id" });
        continue;
      }

      // Resolva customer_id
      let customerId = customerCache.get(o.project_id);
      if (customerId === undefined) {
        const { data: settings } = await admin
          .from("project_google_settings")
          .select("ads_customer_id")
          .eq("project_id", o.project_id)
          .maybeSingle();
        customerId = settings?.ads_customer_id ?? null;
        customerCache.set(o.project_id, customerId);
      }
      if (!customerId) {
        skipped.push({ id: o.id, reason: "no_customer" });
        continue;
      }

      // Service-mode: vi kör utan user-Authorization (getAdsContext stödjer service-token via login customer)
      // OBS: getAdsContext kräver req-headers — skapa en minimal context med service-OAuth via project-token.
      // Förenkling: hoppa över outcome om vi inte kan bygga ctx (logga och skip).
      let ctx;
      try {
        ctx = await getAdsContext(req.headers.get("Authorization"));
      } catch (e) {
        skipped.push({ id: o.id, reason: "no_ads_ctx", error: (e as Error).message });
        continue;
      }

      const applied = new Date(o.applied_at);
      const before14End = new Date(applied); before14End.setDate(before14End.getDate() - 1);
      const before14Start = new Date(applied); before14Start.setDate(before14Start.getDate() - 14);
      const after14Start = new Date(applied);
      const after14End = new Date(applied); after14End.setDate(after14End.getDate() + 14);

      const before30End = new Date(applied); before30End.setDate(before30End.getDate() - 1);
      const before30Start = new Date(applied); before30Start.setDate(before30Start.getDate() - 30);
      const after30Start = new Date(applied);
      const after30End = new Date(applied); after30End.setDate(after30End.getDate() + 30);

      const update: any = {};

      if (!o.measured_14d && new Date(after14End) <= now) {
        const [before, after] = await Promise.all([
          fetchCampaignMetricsBetween(ctx, customerId, o.campaign_id, fmtDate(before14Start), fmtDate(before14End)),
          fetchCampaignMetricsBetween(ctx, customerId, o.campaign_id, fmtDate(after14Start), fmtDate(after14End)),
        ]);
        update.measured_14d = {
          before, after,
          delta: {
            clicks_pct: deltaPct(before.clicks, after.clicks),
            conversions_pct: deltaPct(before.conversions, after.conversions),
            cost_pct: deltaPct(before.cost_micros, after.cost_micros),
            cpa_before: before.conversions > 0 ? Math.round(before.cost_micros / before.conversions / 1_000_000) : null,
            cpa_after: after.conversions > 0 ? Math.round(after.cost_micros / after.conversions / 1_000_000) : null,
          },
        };
      }

      if (!o.measured_30d && new Date(after30End) <= now) {
        const [before, after] = await Promise.all([
          fetchCampaignMetricsBetween(ctx, customerId, o.campaign_id, fmtDate(before30Start), fmtDate(before30End)),
          fetchCampaignMetricsBetween(ctx, customerId, o.campaign_id, fmtDate(after30Start), fmtDate(after30End)),
        ]);
        update.measured_30d = {
          before, after,
          delta: {
            clicks_pct: deltaPct(before.clicks, after.clicks),
            conversions_pct: deltaPct(before.conversions, after.conversions),
            cost_pct: deltaPct(before.cost_micros, after.cost_micros),
            cpa_before: before.conversions > 0 ? Math.round(before.cost_micros / before.conversions / 1_000_000) : null,
            cpa_after: after.conversions > 0 ? Math.round(after.cost_micros / after.conversions / 1_000_000) : null,
          },
        };
      }

      if (Object.keys(update).length === 0) {
        skipped.push({ id: o.id, reason: "not_due" });
        continue;
      }

      await admin.from("ads_recommendation_outcomes").update(update).eq("id", o.id);
      measured.push({ id: o.id, rule_id: o.rule_id, ...update });
    }

    return new Response(JSON.stringify({
      ok: true,
      candidates: all.size,
      measured: measured.length,
      skipped: skipped.length,
      details: { measured, skipped },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("cron-ads-outcomes error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
