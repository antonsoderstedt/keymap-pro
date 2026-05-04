// Unified report generator — hämtar live-data per report_type och sparar i workspace_artifacts.
// Stödjer: share_of_voice, auction_insights, yoy, roi (övriga använder existing snapshot-data).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { project_id, report_type, name } = await req.json();
    if (!project_id || !report_type) return j({ error: "project_id and report_type required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");

    // Förkolla vilka kopplingar som finns — guidar fallback-meddelanden
    const { data: gset } = await supabase
      .from("project_google_settings")
      .select("ga4_property_id, ads_customer_id, gsc_site_url")
      .eq("project_id", project_id).maybeSingle();
    const has = {
      ga4: !!gset?.ga4_property_id,
      ads: !!gset?.ads_customer_id,
      gsc: !!gset?.gsc_site_url,
    };

    const sections: Record<string, { status: "ok" | "missing" | "partial" | "error"; reason?: string; data?: unknown }> = {};
    const missingFields: string[] = [];
    const sources = new Set<string>();

    const mark = (key: string, status: "ok" | "missing" | "partial" | "error", reason?: string, data?: unknown) => {
      sections[key] = { status, ...(reason ? { reason } : {}), ...(data !== undefined ? { data } : {}) };
      if (status === "missing" || status === "error") missingFields.push(`${key}: ${reason || status}`);
    };

    let payload: Record<string, unknown> = {
      report_type,
      generated_at: new Date().toISOString(),
      connections: has,
    };

    switch (report_type) {
      case "share_of_voice": {
        let snap: any = null;
        try {
          const { data: existing } = await supabase
            .from("share_of_voice_snapshots").select("*")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          snap = existing;
          const stale = !snap || (Date.now() - new Date(snap.created_at).getTime() > 7 * 24 * 3600 * 1000);
          if (stale) {
            const { data: fetched, error: fetchErr } = await supabase.functions.invoke("sov-fetch", {
              body: { project_id }, headers: auth ? { Authorization: auth } : {},
            });
            if (fetchErr) console.warn("sov-fetch", fetchErr);
            if ((fetched as any)?.snapshot) snap = (fetched as any).snapshot;
            else if (!snap) {
              const { data: fresh } = await supabase
                .from("share_of_voice_snapshots").select("*")
                .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
              snap = fresh;
            }
          }
        } catch (e: any) {
          console.warn("sov section", e);
        }

        if (!snap) {
          mark("share_of_voice", "missing",
            !has.gsc ? "GSC-koppling saknas — anslut Search Console i Inställningar" : "Ingen SoV-snapshot kunde beräknas (saknar konkurrentlista eller Semrush-data)");
        } else {
          (snap.sources as string[] || []).forEach((s) => sources.add(s));
          const partial = !(snap.sources || []).includes("semrush");
          mark("share_of_voice", partial ? "partial" : "ok",
            partial ? "Saknar Semrush — marknadsstorlek är uppskattad från GSC + Auction Insights" : undefined,
            {
              your_domain: snap.your_domain,
              your_impressions: snap.your_impressions,
              your_clicks: snap.your_clicks,
              total_market_impressions: snap.total_market_impressions,
              sov_pct: snap.sov_pct,
              period: { start: snap.start_date, end: snap.end_date },
              competitors: snap.competitors,
            });
        }
        break;
      }

      case "auction_insights": {
        const { data: snap } = await supabase
          .from("auction_insights_snapshots").select("*")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!snap) {
          mark("auction_insights", "missing",
            !has.ads ? "Google Ads-koppling saknas — välj kund i Inställningar → Kopplingar"
                     : "Ingen Auction Insights-data hämtad ännu — gå till Auction Insights och tryck 'Uppdatera nu'");
        } else {
          sources.add("google_ads");
          const rows = (snap.rows as any) || {};
          const campaigns = rows.campaigns || [];
          const competitors = rows.competitors || [];
          const partial = competitors.length === 0;
          mark("auction_insights", partial ? "partial" : "ok",
            partial ? "Inga konkurrent-rader returnerade — kontot kan sakna tillräcklig auktionsdata" : undefined,
            {
              period: { start: snap.start_date, end: snap.end_date },
              campaigns,
              competitors,
              totals: summarizeCampaigns(campaigns),
            });
        }
        break;
      }

      case "yoy": {
        try {
          const { data: trendRes, error: trendErr } = await supabase.functions.invoke("trend-compute", {
            body: { project_id, window_days: 30 },
            headers: auth ? { Authorization: auth } : {},
          });
          if (trendErr) throw new Error(trendErr.message);
          if ((trendRes as any)?.error) throw new Error((trendRes as any).error);
          const trend = (trendRes as any)?.trend;
          if (!trend) throw new Error("Trend-data tom");

          const periodHas = (k: "ga4" | "ads" | "gsc") => !!trend.periods?.current?.[k];
          [periodHas("ga4") && "ga4", periodHas("ads") && "google_ads", periodHas("gsc") && "gsc"]
            .filter(Boolean).forEach((s) => sources.add(s as string));

          const sub = (k: "ga4" | "ads" | "gsc", connected: boolean) => {
            if (!connected) {
              mark(`yoy_${k}`, "missing", `${k.toUpperCase()}-koppling saknas`);
              return;
            }
            if (!periodHas(k)) {
              mark(`yoy_${k}`, "error", `Hämtning från ${k.toUpperCase()} misslyckades — kolla scopes/behörighet`);
              return;
            }
            mark(`yoy_${k}`, "ok", undefined, {
              current: trend.periods.current[k],
              mom: trend.periods.mom[k],
              yoy: trend.periods.yoy[k],
              delta: trend[`${k === "ads" ? "ads" : k}_delta`],
            });
          };
          sub("ga4", has.ga4);
          sub("ads", has.ads);
          sub("gsc", has.gsc);
          (payload as any).trend = trend;
        } catch (e: any) {
          mark("yoy_compute", "error", e.message || String(e));
        }
        break;
      }

      case "roi": {
        // 1. Kanal-attribution
        let attrSnap: any = null;
        try {
          const { data: existing } = await supabase
            .from("channel_attribution_snapshots").select("*")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          attrSnap = existing;
          const stale = !attrSnap || (Date.now() - new Date(attrSnap.created_at).getTime() > 24 * 3600 * 1000);
          if (stale && (has.ga4 || has.ads)) {
            const { data: fetched } = await supabase.functions.invoke("channel-attribution-fetch", {
              body: { project_id }, headers: auth ? { Authorization: auth } : {},
            });
            if ((fetched as any)?.snapshot) attrSnap = (fetched as any).snapshot;
          }
        } catch (e) { console.warn("attribution", e); }

        if (!attrSnap) {
          mark("attribution", "missing",
            (!has.ga4 && !has.ads) ? "Behöver minst en av GA4 eller Google Ads-koppling"
              : "Kunde inte hämta kanal-attribution — kolla Google-token-scope");
        } else {
          (attrSnap.sources as string[] || []).forEach((s) => sources.add(s));
          const hasGa4 = (attrSnap.sources || []).includes("ga4");
          const hasAds = (attrSnap.sources || []).includes("google_ads");
          const partial = !hasGa4 || !hasAds;
          mark("attribution", partial ? "partial" : "ok",
            partial ? `Endast ${hasGa4 ? "GA4" : "Google Ads"}-data — ${hasGa4 ? "Ads" : "GA4"} saknas så ROAS är ofullständig` : undefined,
            {
              period: { start: attrSnap.start_date, end: attrSnap.end_date },
              currency: attrSnap.currency,
              channels: attrSnap.channels,
              totals: attrSnap.totals,
            });
        }

        // 2. Cluster-ROI (sökord)
        try {
          const [analysisRes, ga4Res, gscRes, settingsRes] = await Promise.all([
            supabase.from("analyses").select("keyword_universe_json")
              .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("ga4_snapshots").select("rows,totals")
              .eq("project_id", project_id).order("created_at", { ascending: false }).limit(5),
            supabase.from("gsc_snapshots").select("rows")
              .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("project_revenue_settings")
              .select("avg_order_value,conversion_rate_pct,gross_margin_pct,currency")
              .eq("project_id", project_id).maybeSingle(),
          ]);
          const clusters = (analysisRes.data?.keyword_universe_json as any)?.clusters || [];
          if (!clusters.length) {
            mark("cluster_roi", "missing", "Ingen sökordsanalys hittad — kör analys-wizarden för att låsa upp kluster-värdering");
          } else {
            const ga4Snapshots = ga4Res.data || [];
            const revenueSnap = ga4Snapshots.find((s: any) => s.totals?.kind === "revenue_by_page");
            const ga4Rows = (revenueSnap?.rows as any[]) || [];
            const gscRows = (gscRes.data?.rows as any[]) || [];
            const overview = computeRoi(clusters, ga4Rows, gscRows, settingsRes.data || undefined);
            sources.add("analyses");
            const partial = !revenueSnap;
            mark("cluster_roi", partial ? "partial" : "ok",
              partial ? "Saknar GA4-intäkt per sida — värden är estimat baserade på revenue settings" : undefined,
              { ...overview, has_ga4_revenue: !!revenueSnap, settings: settingsRes.data });
          }
        } catch (e: any) {
          mark("cluster_roi", "error", e.message || String(e));
        }
        break;
      }

      default: {
        mark("generic", "ok", undefined, { report_type });
      }
    }

    payload.sources = Array.from(sources);
    payload.sections = sections;
    payload.missing_fields = missingFields;
    const statuses = Object.values(sections).map((s) => s.status);
    payload.overall_status = statuses.includes("ok") || statuses.includes("partial")
      ? (statuses.every((s) => s === "ok") ? "complete" : "partial")
      : "empty";

    const { data: artifact, error } = await supabase.from("workspace_artifacts").insert({
      project_id,
      artifact_type: "report",
      name: name || `${report_type} — ${new Date().toLocaleDateString("sv-SE")}`,
      description: `Auto-genererad ${report_type}-rapport`,
      payload,
    }).select("*").single();
    if (error) throw error;

    return j({ ok: true, artifact });
  } catch (e: any) {
    console.error("generate-report", e);
    return j({ error: e.message || String(e) }, 500);
  }
});

function summarizeCampaigns(campaigns: any[]) {
  const totals = { cost: 0, conversions: 0, clicks: 0, impressions: 0, avg_is: 0, avg_lost_budget: 0, avg_lost_rank: 0 };
  if (!campaigns.length) return totals;
  for (const c of campaigns) {
    totals.cost += c.cost || 0;
    totals.conversions += c.conversions || 0;
    totals.clicks += c.clicks || 0;
    totals.impressions += c.impressions || 0;
    totals.avg_is += c.impressionShare || 0;
    totals.avg_lost_budget += c.lostBudget || 0;
    totals.avg_lost_rank += c.lostRank || 0;
  }
  totals.avg_is /= campaigns.length;
  totals.avg_lost_budget /= campaigns.length;
  totals.avg_lost_rank /= campaigns.length;
  return totals;
}

// Inline ROI-beräkning (mirror av src/lib/roi.ts — håll i sync)
function normalizeUrl(u?: string): string {
  if (!u) return "";
  try {
    const url = u.startsWith("http") ? new URL(u) : new URL("https://x" + (u.startsWith("/") ? u : "/" + u));
    return url.pathname.replace(/\/$/, "").toLowerCase() || "/";
  } catch { return u.split("?")[0].replace(/\/$/, "").toLowerCase(); }
}
const DEFAULT_REV = { avg_order_value: 1000, conversion_rate_pct: 2, gross_margin_pct: 100 };
function ctrAt(pos: number): number {
  if (pos <= 1) return 0.32; if (pos <= 2) return 0.18; if (pos <= 3) return 0.11;
  if (pos <= 5) return 0.06; if (pos <= 10) return 0.025; return 0.005;
}
function kwValue(vol: number, pos: number, s: any) {
  const clicks = vol * ctrAt(pos);
  const conv = clicks * (s.conversion_rate_pct / 100);
  return conv * s.avg_order_value * (s.gross_margin_pct / 100) * 12;
}
function computeRoi(clusters: any[], ga4Rows: any[], gscRows: any[], settings: any) {
  const s = { ...DEFAULT_REV, ...(settings || {}) };
  const pageRev: Record<string, number> = {};
  for (const r of ga4Rows) {
    const k = normalizeUrl(r.page);
    pageRev[k] = (pageRev[k] || 0) + (r.total_revenue || r.purchase_revenue || 0);
  }
  const enriched = clusters.map((c: any) => {
    let totalVol = 0, posSum = 0, posCount = 0, est = 0, uplift = 0, actual = 0;
    const seen = new Set<string>();
    for (const kw of (c.keywords || [])) {
      const pos = kw.position ?? 20;
      const vol = kw.volume || 0;
      totalVol += vol;
      if (pos > 0) { posSum += pos; posCount += 1; }
      est += kwValue(vol, pos, s);
      uplift += kwValue(vol, 3, s) - kwValue(vol, pos, s);
      const page = normalizeUrl(kw.url);
      if (page && !seen.has(page) && pageRev[page]) { actual += pageRev[page]; seen.add(page); }
    }
    return {
      name: c.name || c.cluster || "Namnlöst kluster",
      keyword_count: (c.keywords || []).length,
      total_volume: totalVol,
      avg_position: posCount ? Math.round(posSum / posCount * 10) / 10 : null,
      actual_revenue_sek: Math.round(actual),
      estimated_value_sek: Math.round(est),
      uplift_potential_sek: Math.round(Math.max(0, uplift)),
    };
  }).sort((a, b) => b.uplift_potential_sek - a.uplift_potential_sek);
  return {
    clusters: enriched,
    total_actual_revenue_sek: enriched.reduce((s, c) => s + c.actual_revenue_sek, 0),
    total_estimated_value_sek: enriched.reduce((s, c) => s + c.estimated_value_sek, 0),
    total_uplift_potential_sek: enriched.reduce((s, c) => s + c.uplift_potential_sek, 0),
  };
}

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
