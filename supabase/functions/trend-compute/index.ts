// Trend Compute — hämtar GA4 + Ads + GSC för current period vs MoM (-30d) och YoY (-365d).
// Skapar en trend-snapshot lagrad som workspace_artifact (artifact_type='trend').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGoogleAccessToken } from "../_shared/google-token.ts";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PeriodMetrics {
  start: string; end: string;
  ga4?: { sessions: number; conversions: number; revenue: number };
  ads?: { spend: number; conversions: number; conv_value: number; clicks: number };
  gsc?: { clicks: number; impressions: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const { project_id, end_date, window_days = 30 } = body;
    if (!project_id) return j({ error: "project_id required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: gset } = await supabase
      .from("project_google_settings")
      .select("ga4_property_id, ads_customer_id, gsc_site_url")
      .eq("project_id", project_id).maybeSingle();

    const end = end_date ? new Date(end_date) : new Date();
    const periods = {
      current: range(end, window_days),
      mom: range(shiftDays(end, -window_days), window_days),
      yoy: range(shiftDays(end, -365), window_days),
    };

    const fetchPeriod = async (label: string, p: { start: Date; end: Date }): Promise<PeriodMetrics> => {
      const out: PeriodMetrics = { start: fmt(p.start), end: fmt(p.end) };
      // GA4
      if (gset?.ga4_property_id) {
        try {
          const { token } = await getGoogleAccessToken(auth);
          const pid = String(gset.ga4_property_id).replace(/^properties\//i, "").replace(/\D/g, "");
          const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              dateRanges: [{ startDate: fmt(p.start), endDate: fmt(p.end) }],
              metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
            }),
          });
          if (r.ok && (r.headers.get("content-type") || "").includes("application/json")) {
            const d = await r.json();
            const m = d.rows?.[0]?.metricValues || [];
            out.ga4 = { sessions: +(m[0]?.value || 0), conversions: +(m[1]?.value || 0), revenue: +(m[2]?.value || 0) };
          }
        } catch (e) { console.warn(`ga4 ${label}`, e); }
      }
      // Ads
      if (gset?.ads_customer_id) {
        try {
          const ctx = await getAdsContext(auth);
          const rows = await searchGaql(ctx, gset.ads_customer_id, `
            SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks
            FROM customer
            WHERE segments.date BETWEEN '${fmt(p.start)}' AND '${fmt(p.end)}'
          `);
          let spend = 0, conv = 0, val = 0, clicks = 0;
          for (const r of (rows || [])) {
            spend += Number(r.metrics?.costMicros || 0) / 1_000_000;
            conv += Number(r.metrics?.conversions || 0);
            val += Number(r.metrics?.conversionsValue || 0);
            clicks += Number(r.metrics?.clicks || 0);
          }
          out.ads = { spend, conversions: conv, conv_value: val, clicks };
        } catch (e) { console.warn(`ads ${label}`, e); }
      }
      // GSC
      if (gset?.gsc_site_url) {
        try {
          const { token } = await getGoogleAccessToken(auth);
          const r = await fetch(
            `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gset.gsc_site_url)}/searchAnalytics/query`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ startDate: fmt(p.start), endDate: fmt(p.end), dimensions: [], rowLimit: 1 }),
            },
          );
          if (r.ok && (r.headers.get("content-type") || "").includes("application/json")) {
            const d = await r.json();
            const row = d.rows?.[0];
            if (row) out.gsc = { clicks: row.clicks || 0, impressions: row.impressions || 0 };
          }
        } catch (e) { console.warn(`gsc ${label}`, e); }
      }
      return out;
    };

    const [current, mom, yoy] = await Promise.all([
      fetchPeriod("current", periods.current),
      fetchPeriod("mom", periods.mom),
      fetchPeriod("yoy", periods.yoy),
    ]);

    const delta = (cur?: number, prev?: number) => {
      if (cur == null || prev == null) return null;
      if (!prev) return cur ? { abs: cur, pct: null } : { abs: 0, pct: 0 };
      return { abs: cur - prev, pct: Math.round(((cur - prev) / prev) * 1000) / 10 };
    };

    const trend = {
      window_days,
      periods: { current, mom, yoy },
      ga4_delta: {
        sessions: { mom: delta(current.ga4?.sessions, mom.ga4?.sessions), yoy: delta(current.ga4?.sessions, yoy.ga4?.sessions) },
        conversions: { mom: delta(current.ga4?.conversions, mom.ga4?.conversions), yoy: delta(current.ga4?.conversions, yoy.ga4?.conversions) },
        revenue: { mom: delta(current.ga4?.revenue, mom.ga4?.revenue), yoy: delta(current.ga4?.revenue, yoy.ga4?.revenue) },
      },
      ads_delta: {
        spend: { mom: delta(current.ads?.spend, mom.ads?.spend), yoy: delta(current.ads?.spend, yoy.ads?.spend) },
        conv_value: { mom: delta(current.ads?.conv_value, mom.ads?.conv_value), yoy: delta(current.ads?.conv_value, yoy.ads?.conv_value) },
        roas_current: current.ads?.spend ? Math.round((current.ads.conv_value / current.ads.spend) * 100) / 100 : null,
        roas_yoy: yoy.ads?.spend ? Math.round((yoy.ads.conv_value / yoy.ads.spend) * 100) / 100 : null,
      },
      gsc_delta: {
        clicks: { mom: delta(current.gsc?.clicks, mom.gsc?.clicks), yoy: delta(current.gsc?.clicks, yoy.gsc?.clicks) },
        impressions: { mom: delta(current.gsc?.impressions, mom.gsc?.impressions), yoy: delta(current.gsc?.impressions, yoy.gsc?.impressions) },
      },
    };

    const { data: artifact, error } = await supabase.from("workspace_artifacts").insert({
      project_id,
      artifact_type: "trend",
      name: `Trend ${fmt(periods.current.start)} → ${fmt(periods.current.end)}`,
      description: "Auto-genererad YoY/MoM trend",
      payload: trend,
    }).select("*").single();
    if (error) throw error;

    return j({ ok: true, trend, artifact });
  } catch (e: any) {
    console.error("trend-compute", e);
    return j({ error: e.message || String(e) }, 500);
  }
});

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function shiftDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function range(end: Date, days: number) {
  const start = new Date(end); start.setDate(start.getDate() - days);
  return { start, end };
}

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
