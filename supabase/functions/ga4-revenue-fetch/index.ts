// GA4 Revenue Intelligence — pulls per-landing-page conversion value
// and writes a snapshot tagged with metadata.kind = 'revenue_by_page'
import { getGoogleAccessToken } from "../_shared/google-token.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    const { token } = await getGoogleAccessToken(auth);
    const body = await req.json().catch(() => ({}));
    const { projectId, propertyId, startDate = "28daysAgo", endDate = "today" } = body;
    if (!projectId || !propertyId) return j({ error: "projectId & propertyId required" }, 400);

    // GA4 report: landingPage → sessions, conversions, totalRevenue, purchaseRevenue
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [
            { name: "sessions" },
            { name: "conversions" },
            { name: "totalRevenue" },
            { name: "purchaseRevenue" },
          ],
          limit: 1000,
          orderBys: [{ desc: true, metric: { metricName: "totalRevenue" } }],
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) return j({ error: data.error?.message || "GA4 error", raw: data }, res.status);

    const rows = (data.rows || []).map((r: any) => ({
      page: r.dimensionValues?.[0]?.value || "/",
      sessions: Number(r.metricValues?.[0]?.value || 0),
      conversions: Number(r.metricValues?.[1]?.value || 0),
      total_revenue: Number(r.metricValues?.[2]?.value || 0),
      purchase_revenue: Number(r.metricValues?.[3]?.value || 0),
    }));
    const totals = rows.reduce(
      (acc: any, r: any) => ({
        sessions: acc.sessions + r.sessions,
        conversions: acc.conversions + r.conversions,
        total_revenue: acc.total_revenue + r.total_revenue,
        purchase_revenue: acc.purchase_revenue + r.purchase_revenue,
      }),
      { sessions: 0, conversions: 0, total_revenue: 0, purchase_revenue: 0 },
    );

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key, { global: { headers: { Authorization: auth || "" } } });

    // Resolve start/end ISO dates (GA4 accepts relative dates; compute approx)
    const today = new Date();
    const end = endDate === "today" ? today : new Date(endDate);
    const start = startDate.endsWith("daysAgo")
      ? new Date(today.getTime() - parseInt(startDate) * 86400000)
      : new Date(startDate);

    await sb.from("ga4_snapshots").insert({
      project_id: projectId,
      property_id: propertyId,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      rows,
      totals: { ...totals, kind: "revenue_by_page" },
    });

    return j({ ok: true, rows: rows.length, totals });
  } catch (e) {
    console.error("ga4-revenue-fetch", e);
    return j({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
