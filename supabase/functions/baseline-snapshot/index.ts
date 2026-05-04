// baseline-snapshot — Fas 6
// Tar en veckovis snapshot av KPI per projekt och skriver till project_baselines.
// Aggregerar från befintliga ga4_metrics_daily / gsc_metrics_daily / kpi_targets om de finns.
// Tål att en källa saknas — sparar då bara delmängden.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, serviceKey);

  try {
    const today = new Date();
    const sevenAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
    const isoToday = today.toISOString().slice(0, 10);
    const isoFrom = sevenAgo.toISOString().slice(0, 10);

    // Hitta projekt som har minst en datakälla
    const { data: settings } = await sb
      .from("project_google_settings")
      .select("project_id, ga4_property_id, gsc_site_url, ads_customer_id");

    const projects = (settings || []).filter(
      (s: any) => s.ga4_property_id || s.gsc_site_url || s.ads_customer_id,
    );

    let written = 0;
    const errors: any[] = [];

    for (const p of projects) {
      const metrics: Record<string, any> = { period_days: 7, period_to: isoToday, period_from: isoFrom };

      // GA4 — om vi har en lokal cache-tabell ga4_metrics_daily
      try {
        const { data: ga4Rows } = await sb
          .from("ga4_metrics_daily" as any)
          .select("sessions, users, conversions, revenue, date")
          .eq("project_id", p.project_id)
          .gte("date", isoFrom)
          .lte("date", isoToday);
        if (ga4Rows && ga4Rows.length > 0) {
          metrics.ga4 = (ga4Rows as any[]).reduce(
            (acc: any, r: any) => ({
              sessions: (acc.sessions || 0) + (r.sessions || 0),
              users: (acc.users || 0) + (r.users || 0),
              conversions: (acc.conversions || 0) + (r.conversions || 0),
              revenue: (acc.revenue || 0) + (Number(r.revenue) || 0),
            }),
            {},
          );
        }
      } catch (_) {/* tabell finns ev. ej */}

      // GSC — om vi har gsc_metrics_daily
      try {
        const { data: gscRows } = await sb
          .from("gsc_metrics_daily" as any)
          .select("clicks, impressions, ctr, position, date")
          .eq("project_id", p.project_id)
          .gte("date", isoFrom)
          .lte("date", isoToday);
        if (gscRows && gscRows.length > 0) {
          const rows = gscRows as any[];
          const totalClicks = rows.reduce((s: number, r: any) => s + (r.clicks || 0), 0);
          const totalImpr = rows.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
          const avgPos = rows.length ? rows.reduce((s: number, r: any) => s + (Number(r.position) || 0), 0) / rows.length : 0;
          metrics.gsc = {
            clicks: totalClicks,
            impressions: totalImpr,
            ctr: totalImpr ? totalClicks / totalImpr : 0,
            avg_position: Number(avgPos.toFixed(2)),
          };
        }
      } catch (_) {/* tabell finns ev. ej */}

      // KPI-targets — speglar gärna senaste status
      try {
        const { data: kpi } = await sb
          .from("kpi_targets")
          .select("metric, target_value, direction, is_active")
          .eq("project_id", p.project_id)
          .eq("is_active", true);
        if (kpi && kpi.length > 0) metrics.kpi_targets = kpi;
      } catch (_) {/* */}

      const { error } = await sb.from("project_baselines").insert({
        project_id: p.project_id,
        snapshot_date: isoToday,
        metrics,
        source: "cron-weekly",
      });
      if (error) errors.push({ project_id: p.project_id, error: error.message });
      else written++;
    }

    return new Response(
      JSON.stringify({ ok: true, projects_checked: projects.length, snapshots_written: written, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("baseline-snapshot error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
