// ads-outcome-timeseries — dagliga metrics ±N dagar runt en push (applied_at)
// för en specifik kampanj. Används av Resultat-fliken för drilldown-graf.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const fmt = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { project_id, campaign_id, applied_at, window_days = 28 } = await req.json();
    if (!project_id || !campaign_id || !applied_at) {
      return new Response(JSON.stringify({ error: "project_id, campaign_id, applied_at required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("project_google_settings")
      .select("ads_customer_id")
      .eq("project_id", project_id)
      .maybeSingle();
    if (!settings?.ads_customer_id) {
      return new Response(JSON.stringify({ error: "NO_ADS_CUSTOMER" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cid = String(settings.ads_customer_id).replace(/[^0-9]/g, "");

    const applied = new Date(applied_at);
    const start = new Date(applied); start.setUTCDate(start.getUTCDate() - window_days);
    const end = new Date(applied); end.setUTCDate(end.getUTCDate() + window_days);
    const today = new Date();
    const endClamped = end > today ? today : end;

    const ctx = await getAdsContext(req.headers.get("Authorization"));
    const cidClean = String(campaign_id).replace(/[^0-9]/g, "");

    const rows = await searchGaql(ctx, cid, `
      SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.clicks, metrics.impressions
      FROM campaign
      WHERE campaign.id = ${cidClean}
        AND segments.date BETWEEN '${fmt(start)}' AND '${fmt(endClamped)}'
      ORDER BY segments.date
    `);

    const series = rows.map((r: any) => {
      const cost = Number(r.metrics?.costMicros ?? 0) / 1_000_000;
      const conv = Number(r.metrics?.conversions ?? 0);
      const value = Number(r.metrics?.conversionsValue ?? 0);
      return {
        date: r.segments?.date,
        spend: Math.round(cost),
        conversions: Math.round(conv * 100) / 100,
        roas: cost > 0 ? Math.round((value / cost) * 100) / 100 : 0,
        cpa: conv > 0 ? Math.round(cost / conv) : 0,
        clicks: Number(r.metrics?.clicks ?? 0),
        impressions: Number(r.metrics?.impressions ?? 0),
      };
    });

    return new Response(JSON.stringify({
      series, applied_at, window_days,
      campaign_id: cidClean, customer_id: cid,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ads-outcome-timeseries error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
