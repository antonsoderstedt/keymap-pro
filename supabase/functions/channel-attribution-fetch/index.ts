// Channel Attribution & ROI — kombinerar GA4 (revenue per kanal) + Google Ads (spend & conv value)
// och beräknar ROAS, ROI och spend-share per kanal för valt datumintervall.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGoogleAccessToken } from "../_shared/google-token.ts";
import { getAdsContext, searchGaql } from "../_shared/google-ads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChannelRow {
  channel: string;
  sessions: number;
  conversions: number;
  revenue: number;
  spend: number;
  ad_conversions: number;
  ad_conversion_value: number;
  roas: number | null;
  roi_pct: number | null;
  cpa: number | null;
  spend_share_pct: number;
  revenue_share_pct: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const { project_id, start_date, end_date } = body;
    if (!project_id) return j({ error: "project_id required" }, 400);

    // Default: senaste 30 dagar
    const end = end_date ? new Date(end_date) : new Date();
    const start = start_date ? new Date(start_date) : (() => { const d = new Date(end); d.setDate(d.getDate() - 30); return d; })();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: gset } = await supabase
      .from("project_google_settings")
      .select("ga4_property_id, ads_customer_id")
      .eq("project_id", project_id).maybeSingle();
    const { data: revSettings } = await supabase
      .from("project_revenue_settings").select("currency").eq("project_id", project_id).maybeSingle();
    const currency = revSettings?.currency || "SEK";

    const sources: string[] = [];
    const channels: Record<string, ChannelRow> = {};
    const ensure = (c: string) => channels[c] ??= {
      channel: c, sessions: 0, conversions: 0, revenue: 0,
      spend: 0, ad_conversions: 0, ad_conversion_value: 0,
      roas: null, roi_pct: null, cpa: null,
      spend_share_pct: 0, revenue_share_pct: 0,
    };

    // 1. GA4: sessions + revenue per sessionDefaultChannelGroup
    if (gset?.ga4_property_id) {
      try {
        const { token } = await getGoogleAccessToken(auth);
        const propertyId = String(gset.ga4_property_id).replace(/^properties\//i, "").replace(/\D/g, "");
        const ga4Res = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
              dimensions: [{ name: "sessionDefaultChannelGroup" }],
              metrics: [
                { name: "sessions" },
                { name: "conversions" },
                { name: "totalRevenue" },
                { name: "purchaseRevenue" },
              ],
              limit: 50,
            }),
          },
        );
        const ct = ga4Res.headers.get("content-type") || "";
        if (ga4Res.ok && ct.includes("application/json")) {
          const ga4 = await ga4Res.json();
          for (const row of (ga4.rows || [])) {
            const ch = normalizeChannel(row.dimensionValues?.[0]?.value || "Other");
            const r = ensure(ch);
            r.sessions += Number(row.metricValues?.[0]?.value || 0);
            r.conversions += Number(row.metricValues?.[1]?.value || 0);
            r.revenue += Number(row.metricValues?.[2]?.value || 0) || Number(row.metricValues?.[3]?.value || 0);
          }
          sources.push("ga4");
        } else {
          console.warn("ga4 non-ok", ga4Res.status, (await ga4Res.text()).slice(0, 200));
        }
      } catch (e) { console.warn("ga4 fetch failed", e); }
    }

    // 2. Google Ads: spend + conv value per kampanj-typ → mappa till kanal
    if (gset?.ads_customer_id) {
      try {
        const ctx = await getAdsContext(auth);
        const adsRows = await searchGaql(ctx, gset.ads_customer_id, `
          SELECT campaign.advertising_channel_type,
            metrics.cost_micros, metrics.conversions, metrics.conversions_value,
            metrics.clicks, metrics.impressions
          FROM campaign
          WHERE segments.date BETWEEN '${fmt(start)}' AND '${fmt(end)}'
            AND campaign.status != 'REMOVED'
        `);
        for (const r of (adsRows || [])) {
          const ct = r.campaign?.advertisingChannelType || "OTHER";
          const ch = adsTypeToChannel(ct);
          const row = ensure(ch);
          row.spend += Number(r.metrics?.costMicros || 0) / 1_000_000;
          row.ad_conversions += Number(r.metrics?.conversions || 0);
          row.ad_conversion_value += Number(r.metrics?.conversionsValue || 0);
        }
        sources.push("google_ads");
      } catch (e) { console.warn("ads fetch failed", e); }
    }

    // 3. Beräkna ROAS / ROI / shares
    const list = Object.values(channels);
    const totalSpend = list.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = list.reduce((s, c) => s + Math.max(c.revenue, c.ad_conversion_value), 0);
    for (const c of list) {
      const rev = Math.max(c.revenue, c.ad_conversion_value);
      c.roas = c.spend > 0 ? Math.round((rev / c.spend) * 100) / 100 : null;
      c.roi_pct = c.spend > 0 ? Math.round(((rev - c.spend) / c.spend) * 1000) / 10 : null;
      c.cpa = (c.ad_conversions || c.conversions) > 0 && c.spend > 0
        ? Math.round((c.spend / (c.ad_conversions || c.conversions)) * 100) / 100 : null;
      c.spend_share_pct = totalSpend > 0 ? Math.round((c.spend / totalSpend) * 1000) / 10 : 0;
      c.revenue_share_pct = totalRevenue > 0 ? Math.round((rev / totalRevenue) * 1000) / 10 : 0;
    }
    list.sort((a, b) => (Math.max(b.revenue, b.ad_conversion_value)) - (Math.max(a.revenue, a.ad_conversion_value)));

    const totals = {
      spend: Math.round(totalSpend),
      revenue: Math.round(totalRevenue),
      conversions: Math.round(list.reduce((s, c) => s + Math.max(c.conversions, c.ad_conversions), 0) * 10) / 10,
      blended_roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null,
      blended_roi_pct: totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 1000) / 10 : null,
    };

    if (!sources.length) {
      return j({ error: "Hittade varken GA4 eller Google Ads-data. Koppla in i Inställningar." }, 400);
    }

    const { data: inserted, error } = await supabase
      .from("channel_attribution_snapshots").insert({
        project_id,
        start_date: fmt(start),
        end_date: fmt(end),
        channels: list,
        totals,
        currency,
        sources,
      }).select("*").single();
    if (error) throw error;

    return j({ ok: true, snapshot: inserted });
  } catch (e: any) {
    console.error("channel-attribution-fetch", e);
    return j({ error: e.message || String(e) }, 500);
  }
});

function normalizeChannel(c: string): string {
  const v = (c || "").toLowerCase();
  if (v.includes("organic search")) return "Organic Search";
  if (v.includes("paid search")) return "Paid Search";
  if (v.includes("organic social")) return "Organic Social";
  if (v.includes("paid social")) return "Paid Social";
  if (v.includes("direct")) return "Direct";
  if (v.includes("email")) return "Email";
  if (v.includes("referral")) return "Referral";
  if (v.includes("display")) return "Display";
  if (v.includes("video")) return "Video";
  if (v.includes("affiliate")) return "Affiliate";
  return c || "Other";
}

function adsTypeToChannel(t: string): string {
  switch (t) {
    case "SEARCH": return "Paid Search";
    case "SHOPPING": return "Paid Search";
    case "PERFORMANCE_MAX": return "Paid Search";
    case "DISPLAY": return "Display";
    case "VIDEO": return "Video";
    case "DEMAND_GEN":
    case "DISCOVERY": return "Paid Social";
    default: return "Paid Search";
  }
}

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
