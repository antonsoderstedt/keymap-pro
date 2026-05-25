// cron-ads-outcomes — mäter utfall av regel-rekommendationer.
// Kör: jämför kampanjmetrics 7d/14d/30d FÖRE vs EFTER applied_at och sparar
// i measured_7d/14d/30d. Efter mätning utvärderas eventuell auto_revert_policy
// på den länkade proposalen och vid behov anropas ads-revert-mutation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { searchGaql, getAdsContext } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AutoRevertMetric = "ctr" | "clicks" | "cost" | "conversions";
interface AutoRevertPolicy {
  metric: AutoRevertMetric;
  threshold_pct: number;
  window_days: 7 | 14 | 30;
  enabled: boolean;
}

interface OutcomeRow {
  id: string;
  project_id: string;
  rule_id: string;
  campaign_id: string | null;
  applied_at: string;
  measured_7d: any;
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

function ctr(t: { clicks: number; impressions: number }): number {
  return t.impressions > 0 ? t.clicks / t.impressions : 0;
}

function buildMeasurement(
  before: { clicks: number; impressions: number; cost_micros: number; conversions: number },
  after: { clicks: number; impressions: number; cost_micros: number; conversions: number },
) {
  return {
    before, after,
    delta: {
      clicks_pct: deltaPct(before.clicks, after.clicks),
      conversions_pct: deltaPct(before.conversions, after.conversions),
      cost_pct: deltaPct(before.cost_micros, after.cost_micros),
      ctr_pct: deltaPct(ctr(before), ctr(after)),
      cpa_before: before.conversions > 0 ? Math.round(before.cost_micros / before.conversions / 1_000_000) : null,
      cpa_after: after.conversions > 0 ? Math.round(after.cost_micros / after.conversions / 1_000_000) : null,
    },
    delta_pct: {
      clicks: deltaPct(before.clicks, after.clicks),
      conversions: deltaPct(before.conversions, after.conversions),
      cost: deltaPct(before.cost_micros, after.cost_micros),
      ctr: deltaPct(ctr(before), ctr(after)),
    },
  };
}

function evaluateAutoRevert(
  policy: AutoRevertPolicy,
  measurement: any,
): { revert: boolean; reason: string } {
  if (!policy?.enabled) return { revert: false, reason: "disabled" };
  const m = measurement?.delta_pct ?? {};
  const delta = m[policy.metric];
  if (typeof delta !== "number") return { revert: false, reason: "no_measurement" };
  if (delta <= policy.threshold_pct) {
    return { revert: true, reason: `${policy.metric} ${delta}% (threshold ${policy.threshold_pct}%)` };
  }
  return { revert: false, reason: "within_threshold" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date();

    const cutoff7 = new Date(now); cutoff7.setDate(cutoff7.getDate() - 7);
    const cutoff14 = new Date(now); cutoff14.setDate(cutoff14.getDate() - 14);
    const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);

    const SELECT_COLS =
      "id, project_id, rule_id, campaign_id, applied_at, measured_7d, measured_14d, measured_30d, predicted";

    const { data: due7 } = await admin
      .from("ads_recommendation_outcomes")
      .select(SELECT_COLS)
      .not("applied_at", "is", null)
      .is("measured_7d", null)
      .lte("applied_at", cutoff7.toISOString())
      .limit(50);

    const { data: due14 } = await admin
      .from("ads_recommendation_outcomes")
      .select(SELECT_COLS)
      .not("applied_at", "is", null)
      .is("measured_14d", null)
      .lte("applied_at", cutoff14.toISOString())
      .limit(50);

    const { data: due30 } = await admin
      .from("ads_recommendation_outcomes")
      .select(SELECT_COLS)
      .not("applied_at", "is", null)
      .is("measured_30d", null)
      .lte("applied_at", cutoff30.toISOString())
      .limit(50);

    const all = new Map<string, OutcomeRow>();
    for (const r of (due7 ?? []) as OutcomeRow[]) all.set(r.id, r);
    for (const r of (due14 ?? []) as OutcomeRow[]) all.set(r.id, { ...(all.get(r.id) ?? r), ...r });
    for (const r of (due30 ?? []) as OutcomeRow[]) all.set(r.id, { ...(all.get(r.id) ?? r), ...r });

    const measured: any[] = [];
    const skipped: any[] = [];
    const autoReverted: any[] = [];

    const customerCache = new Map<string, string | null>();

    for (const o of all.values()) {
      if (!o.campaign_id) {
        skipped.push({ id: o.id, reason: "no_campaign_id" });
        continue;
      }

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

      let ctx;
      try {
        ctx = await getAdsContext(req.headers.get("Authorization"));
      } catch (e) {
        skipped.push({ id: o.id, reason: "no_ads_ctx", error: (e as Error).message });
        continue;
      }

      const applied = new Date(o.applied_at);
      const windows: Array<{ key: "measured_7d" | "measured_14d" | "measured_30d"; days: number }> = [
        { key: "measured_7d", days: 7 },
        { key: "measured_14d", days: 14 },
        { key: "measured_30d", days: 30 },
      ];

      const update: any = {};
      const newlyMeasured: Record<string, any> = {};

      for (const w of windows) {
        if ((o as any)[w.key]) continue;
        const beforeEnd = new Date(applied); beforeEnd.setDate(beforeEnd.getDate() - 1);
        const beforeStart = new Date(applied); beforeStart.setDate(beforeStart.getDate() - w.days);
        const afterStart = new Date(applied);
        const afterEnd = new Date(applied); afterEnd.setDate(afterEnd.getDate() + w.days);
        if (afterEnd > now) continue;
        const [before, after] = await Promise.all([
          fetchCampaignMetricsBetween(ctx, customerId, o.campaign_id, fmtDate(beforeStart), fmtDate(beforeEnd)),
          fetchCampaignMetricsBetween(ctx, customerId, o.campaign_id, fmtDate(afterStart), fmtDate(afterEnd)),
        ]);
        const m = buildMeasurement(before, after);
        update[w.key] = m;
        newlyMeasured[w.key] = m;
      }

      if (Object.keys(update).length === 0) {
        skipped.push({ id: o.id, reason: "not_due" });
        continue;
      }

      await admin.from("ads_recommendation_outcomes").update(update).eq("id", o.id);
      measured.push({ id: o.id, rule_id: o.rule_id, ...update });

      // ── Auto-revert evaluation ────────────────────────────────
      try {
        const { data: thisOutcome } = await admin
          .from("ads_recommendation_outcomes")
          .select("proposal_id, mutation_id")
          .eq("id", o.id)
          .maybeSingle();
        const mutationId = thisOutcome?.mutation_id;
        const proposalId = thisOutcome?.proposal_id;
        if (!mutationId || !proposalId) continue;

        const { data: mut } = await admin
          .from("ads_mutations")
          .select("id, reverted_at")
          .eq("id", mutationId)
          .maybeSingle();
        if (!mut || mut.reverted_at) continue;

        const { data: proposal } = await admin
          .from("ads_change_proposals")
          .select("auto_revert_policy")
          .eq("id", proposalId)
          .maybeSingle();
        const policy = proposal?.auto_revert_policy as AutoRevertPolicy | null;
        if (!policy?.enabled) continue;

        const measurementKey = `measured_${policy.window_days}d` as
          "measured_7d" | "measured_14d" | "measured_30d";
        const measurement = newlyMeasured[measurementKey] ?? (o as any)[measurementKey];
        if (!measurement) continue;

        const decision = evaluateAutoRevert(policy, measurement);
        if (!decision.revert) continue;

        const { error: revertErr } = await admin.functions.invoke("ads-revert-mutation", {
          body: { mutation_id: mutationId },
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        });
        if (revertErr) {
          await admin.from("ads_recommendation_outcomes").update({
            auto_revert_reason: `revert_failed: ${revertErr.message}`,
          }).eq("id", o.id);
          continue;
        }
        await admin.from("ads_recommendation_outcomes").update({
          auto_reverted_at: new Date().toISOString(),
          auto_revert_reason: decision.reason,
        }).eq("id", o.id);
        autoReverted.push({ id: o.id, mutation_id: mutationId, reason: decision.reason });
      } catch (autoErr) {
        console.error("auto-revert eval failed", autoErr);
      }
      // silence unused warning
      void candidateMutation;
    }

    return new Response(JSON.stringify({
      ok: true,
      candidates: all.size,
      measured: measured.length,
      auto_reverted: autoReverted.length,
      skipped: skipped.length,
      details: { measured, auto_reverted: autoReverted, skipped },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("cron-ads-outcomes error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
