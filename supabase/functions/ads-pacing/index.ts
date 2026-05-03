// Budget Pacing & Anomaly Alerts. Jämför dagens spend-rate och 7d trend mot 30d baseline,
// skapar entries i `alerts` när vi ser pace-overshoot, CPC-spikes eller konverteringsras.
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
      .from("project_google_settings").select("ads_customer_id").eq("project_id", project_id).maybeSingle();
    if (!settings?.ads_customer_id) throw new Error("NO_ADS_CUSTOMER");

    const ctx = await getAdsContext(req.headers.get("Authorization"));
    const cid = settings.ads_customer_id;

    // Last 7 days vs prior 30 days
    const recent = await searchGaql(ctx, cid, `
      SELECT campaign.id, campaign.name, campaign_budget.amount_micros,
        metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_7_DAYS
        AND campaign.status = 'ENABLED'
    `);
    const baseline = await searchGaql(ctx, cid, `
      SELECT campaign.id, campaign.name,
        metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status = 'ENABLED'
    `);

    const aggregate = (rows: any[], days: number) => {
      const map = new Map<string, { name: string; budget: number; cost_per_day: number; cpc: number; conv_per_day: number }>();
      for (const r of rows) {
        const id = String(r.campaign?.id);
        const cur = map.get(id) || { name: r.campaign?.name, budget: Number(r.campaignBudget?.amountMicros || 0) / 1_000_000, cost_per_day: 0, cpc: 0, conv_per_day: 0 };
        cur.cost_per_day += Number(r.metrics?.costMicros || 0) / 1_000_000 / days;
        cur.cpc = Number(r.metrics?.averageCpc || 0) / 1_000_000;
        cur.conv_per_day += Number(r.metrics?.conversions || 0) / days;
        map.set(id, cur);
      }
      return map;
    };

    const cur7 = aggregate(recent, 7);
    const base30 = aggregate(baseline, 30);

    const alerts: any[] = [];
    for (const [id, cur] of cur7.entries()) {
      const base = base30.get(id);
      if (!base || base.cost_per_day < 10) continue;

      const paceVsBudget = cur.budget > 0 ? cur.cost_per_day / cur.budget : 0;
      if (paceVsBudget > 1.5) {
        alerts.push({
          type: "ads_pacing_overshoot", category: "ads", severity: "warning",
          title: `${cur.name}: bränner ${Math.round(paceVsBudget * 100)}% av dagsbudget`,
          message: `Snittspend senaste 7d är ${Math.round(cur.cost_per_day)} SEK/dag mot budget ${Math.round(cur.budget)} SEK/dag.`,
          suggested_action: "Höj budget eller granska bidstrategi",
          payload: { campaign_id: id, pace_pct: Math.round(paceVsBudget * 100), cost_per_day: cur.cost_per_day, budget: cur.budget },
        });
      }

      const cpcDelta = base.cpc > 0 ? (cur.cpc - base.cpc) / base.cpc : 0;
      if (cpcDelta > 0.3) {
        alerts.push({
          type: "ads_cpc_spike", category: "ads", severity: "warning",
          title: `${cur.name}: CPC +${Math.round(cpcDelta * 100)}%`,
          message: `Snitt-CPC har gått från ${base.cpc.toFixed(2)} till ${cur.cpc.toFixed(2)} SEK senaste 7d.`,
          suggested_action: "Kontrollera auktion, Quality Score och konkurrenter",
          payload: { campaign_id: id, cpc_old: base.cpc, cpc_new: cur.cpc, delta_pct: Math.round(cpcDelta * 100) },
        });
      }

      const convDelta = base.conv_per_day > 0 ? (cur.conv_per_day - base.conv_per_day) / base.conv_per_day : 0;
      if (convDelta < -0.3 && base.conv_per_day > 0.5) {
        alerts.push({
          type: "ads_conv_drop", category: "ads", severity: "critical",
          title: `${cur.name}: konverteringar ${Math.round(convDelta * 100)}%`,
          message: `Konverteringar/dag har sjunkit från ${base.conv_per_day.toFixed(1)} till ${cur.conv_per_day.toFixed(1)}.`,
          suggested_action: "Granska landningssida, tracking och säsongseffekt",
          payload: { campaign_id: id, conv_old: base.conv_per_day, conv_new: cur.conv_per_day, delta_pct: Math.round(convDelta * 100) },
        });
      }
    }

    if (alerts.length > 0) {
      await admin.from("alerts").insert(alerts.map((a) => ({ ...a, project_id })));
    }

    return json({ ok: true, generated: alerts.length, alerts });
  } catch (e: any) {
    console.error("ads-pacing", e);
    const msg = e.message || "Unknown";
    const code = (msg.match(/^([A-Z_]+):/)?.[1]) || "UNKNOWN";
    return json({ error: msg, code }, code === "NO_ADS_CUSTOMER" ? 400 : 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
