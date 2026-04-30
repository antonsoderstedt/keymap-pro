// Hämtar GSC-historik (date + query+date) för 90/180 dgr och sparar som snapshot.
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
    const { projectId, siteUrl, days = 90 } = body;
    if (!projectId || !siteUrl) {
      return json({ error: "projectId och siteUrl krävs" }, 400);
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - Number(days));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // 1. Per-day totals
    const dailyRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["date"],
          rowLimit: 1000,
        }),
      },
    );
    const daily = await dailyRes.json();
    if (!dailyRes.ok) return json({ error: "GSC daily failed", detail: daily }, 500);

    // 2. Per query+date (för sparkline + delta)
    const qdRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query", "date"],
          rowLimit: 5000,
        }),
      },
    );
    const qd = await qdRes.json();
    if (!qdRes.ok) return json({ error: "GSC query+date failed", detail: qd }, 500);

    // 3. Per query aggregat
    const qRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query"],
          rowLimit: 500,
        }),
      },
    );
    const q = await qRes.json();
    if (!qRes.ok) return json({ error: "GSC query failed", detail: q }, 500);

    // 4. Per query+page (för URL-mapping)
    const qpRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query", "page"],
          rowLimit: 1000,
        }),
      },
    );
    const qp = await qpRes.json();

    // Normalisera till rader
    const rows: any[] = [];
    for (const r of daily.rows ?? []) rows.push({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    for (const r of qd.rows ?? []) rows.push({ query: r.keys[0], date: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    for (const r of q.rows ?? []) rows.push({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    for (const r of (qp.rows ?? [])) rows.push({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });

    const totals = {
      clicks: (daily.rows ?? []).reduce((s: number, r: any) => s + (r.clicks || 0), 0),
      impressions: (daily.rows ?? []).reduce((s: number, r: any) => s + (r.impressions || 0), 0),
      days,
    };

    // Spara snapshot via service role (RLS bypassas men vi anger user-context i auth header för säkerhet i framtid)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: snap, error } = await supabase
      .from("gsc_snapshots")
      .insert({
        project_id: projectId,
        site_url: siteUrl,
        start_date: fmt(startDate),
        end_date: fmt(endDate),
        rows,
        totals,
      })
      .select()
      .single();
    if (error) return json({ error: "DB insert failed", detail: error.message }, 500);

    return json({ ok: true, snapshot: snap, totals });
  } catch (e) {
    console.error("gsc-fetch-history error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
