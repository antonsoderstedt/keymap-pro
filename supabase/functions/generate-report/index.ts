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

    let payload: Record<string, unknown> = {
      report_type,
      generated_at: new Date().toISOString(),
      sources: [] as string[],
      data: {} as Record<string, unknown>,
    };

    switch (report_type) {
      case "share_of_voice": {
        let { data: snap } = await supabase
          .from("share_of_voice_snapshots").select("*")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        // Auto-trigga om saknas eller äldre än 7 dagar
        const stale = !snap || (Date.now() - new Date(snap.created_at).getTime() > 7 * 24 * 3600 * 1000);
        if (stale) {
          await supabase.functions.invoke("sov-fetch", {
            body: { project_id }, headers: auth ? { Authorization: auth } : {},
          });
          const { data: fresh } = await supabase
            .from("share_of_voice_snapshots").select("*")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          snap = fresh;
        }
        if (!snap) throw new Error("Kunde inte beräkna Share of Voice — saknar GSC-snapshot eller konkurrentlista.");
        payload.sources = (snap.sources as string[]) || [];
        payload.data = {
          your_domain: snap.your_domain,
          your_impressions: snap.your_impressions,
          your_clicks: snap.your_clicks,
          total_market_impressions: snap.total_market_impressions,
          sov_pct: snap.sov_pct,
          period: { start: snap.start_date, end: snap.end_date },
          competitors: snap.competitors,
        };
        break;
      }

      case "auction_insights": {
        const { data: snap } = await supabase
          .from("auction_insights_snapshots").select("*")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!snap) throw new Error("Ingen Auction Insights-data hittad. Hämta först via Auction Insights-sidan.");
        const rows = (snap.rows as any) || {};
        payload.sources = ["google_ads"];
        payload.data = {
          period: { start: snap.start_date, end: snap.end_date },
          campaigns: rows.campaigns || [],
          competitors: rows.competitors || [],
          totals: summarizeCampaigns(rows.campaigns || []),
        };
        break;
      }

      case "yoy": {
        // Jämför nuvarande GSC + GA4 mot snapshot ~365 dagar tillbaka
        const { data: gscAll } = await supabase
          .from("gsc_snapshots").select("totals, start_date, end_date, created_at")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(40);
        const { data: ga4All } = await supabase
          .from("ga4_snapshots").select("totals, start_date, end_date, created_at")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(40);

        const yoy = (snaps: any[] | null, key: string, daysBack: number) => {
          if (!snaps?.length) return null;
          const latest = snaps[0];
          const target = new Date(); target.setDate(target.getDate() - daysBack);
          const past = snaps.find(s => Math.abs(new Date(s.created_at).getTime() - target.getTime()) < 14 * 86400_000);
          if (!past) return null;
          const lv = Number((latest.totals as any)?.[key] || 0);
          const pv = Number((past.totals as any)?.[key] || 0);
          return { current: lv, previous: pv, delta_pct: pv ? ((lv - pv) / pv) * 100 : null };
        };

        payload.sources = ["gsc", "ga4"];
        payload.data = {
          gsc: {
            yoy_clicks: yoy(gscAll, "clicks", 365),
            yoy_impressions: yoy(gscAll, "impressions", 365),
            mom_clicks: yoy(gscAll, "clicks", 30),
            mom_impressions: yoy(gscAll, "impressions", 30),
          },
          ga4: {
            yoy_sessions: yoy(ga4All, "sessions", 365),
            mom_sessions: yoy(ga4All, "sessions", 30),
          },
        };
        if (!gscAll?.length && !ga4All?.length) {
          throw new Error("Inga GSC/GA4-snapshots hittade. Aktivera Google-kopplingar och hämta data först.");
        }
        break;
      }

      case "roi": {
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
        const ga4Snapshots = ga4Res.data || [];
        const revenueSnap = ga4Snapshots.find((s: any) => s.totals?.kind === "revenue_by_page");
        const ga4Rows = (revenueSnap?.rows as any[]) || [];
        const gscRows = (gscRes.data?.rows as any[]) || [];
        const overview = computeRoi(clusters, ga4Rows, gscRows, settingsRes.data || undefined);

        payload.sources = ["analyses", "ga4", "gsc"];
        payload.data = {
          ...overview,
          has_ga4_revenue: !!revenueSnap,
          settings: settingsRes.data,
        };
        if (!clusters.length) throw new Error("Ingen sökordsanalys hittad för ROI-beräkning.");
        break;
      }

      default: {
        // Generic snapshot — bara metadata för rapporttyper utan skräddarsydd pipeline
        payload.data = { note: "stub", report_type };
      }
    }

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
