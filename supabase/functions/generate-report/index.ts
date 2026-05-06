// Unified report generator — hämtar live-data per report_type och sparar i workspace_artifacts.
// Stödjer: share_of_voice, auction_insights, yoy, roi (övriga använder existing snapshot-data).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildTemplate } from "./_templates.ts";

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

    type IssueReason = string | { message: string; fix?: string; fix_url?: string; severity?: "warning" | "error" };
    const sections: Record<string, { status: "ok" | "missing" | "partial" | "error"; reason?: string; fix?: string; fix_url?: string; data?: unknown }> = {};
    const issues: Array<{ section: string; status: "missing" | "partial" | "error"; message: string; fix?: string; fix_url?: string }> = [];
    const sources = new Set<string>();

    const FIX_URLS = {
      connections: "/settings/connections",
      revenue: "/settings/revenue",
      analyses: "/analyses/new",
      auctionInsights: "/insights/auction-insights",
      competitors: "/settings/competitors",
    };

    const mark = (key: string, status: "ok" | "missing" | "partial" | "error", reason?: IssueReason, data?: unknown) => {
      const r = typeof reason === "string" ? { message: reason } : (reason || {});
      sections[key] = {
        status,
        ...(r.message ? { reason: r.message } : {}),
        ...(r.fix ? { fix: r.fix } : {}),
        ...(r.fix_url ? { fix_url: r.fix_url } : {}),
        ...(data !== undefined ? { data } : {}),
      };
      if (status === "missing" || status === "error" || status === "partial") {
        issues.push({
          section: key,
          status,
          message: r.message || (status === "missing" ? "Data saknas" : status === "error" ? "Fel vid hämtning" : "Ofullständig data"),
          ...(r.fix ? { fix: r.fix } : {}),
          ...(r.fix_url ? { fix_url: r.fix_url } : {}),
        });
      }
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
          mark("share_of_voice", "missing", !has.gsc ? {
            message: "Search Console-koppling saknas",
            fix: "Anslut Google Search Console under Inställningar → Kopplingar och välj rätt sajt.",
            fix_url: FIX_URLS.connections,
          } : {
            message: "Ingen Share of Voice-snapshot kunde beräknas",
            fix: "Lägg till minst 3 konkurrenter under Inställningar → Konkurrenter, och se till att Semrush eller DataForSEO är aktiverat.",
            fix_url: FIX_URLS.competitors,
          });
        } else {
          (snap.sources as string[] || []).forEach((s) => sources.add(s));
          const partial = !(snap.sources || []).includes("semrush");
          mark("share_of_voice", partial ? "partial" : "ok",
            partial ? {
              message: "Saknar Semrush-data — marknadsstorlek är uppskattad från GSC + Auction Insights",
              fix: "Aktivera Semrush-koppling i Inställningar för exakt SoV.",
              fix_url: FIX_URLS.connections,
            } : undefined,
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
          mark("auction_insights", "missing", !has.ads ? {
            message: "Google Ads-koppling saknas",
            fix: "Gå till Inställningar → Kopplingar och välj ditt Google Ads-konto.",
            fix_url: FIX_URLS.connections,
          } : {
            message: "Ingen Auction Insights-data hämtad ännu",
            fix: "Öppna Auction Insights-vyn och tryck 'Uppdatera nu' för att hämta senaste data från Google Ads.",
            fix_url: FIX_URLS.auctionInsights,
          });
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
            const labels = { ga4: "Google Analytics 4", ads: "Google Ads", gsc: "Search Console" } as const;
            if (!connected) {
              mark(`yoy_${k}`, "missing", {
                message: `${labels[k]}-koppling saknas`,
                fix: `Anslut ${labels[k]} under Inställningar → Kopplingar för att se trend för denna kanal.`,
                fix_url: FIX_URLS.connections,
              });
              return;
            }
            if (!periodHas(k)) {
              mark(`yoy_${k}`, "error", {
                message: `Hämtning från ${labels[k]} misslyckades`,
                fix: "Kontrollera att Google-kontot har behörighet (scope) och att property-ID är korrekt. Återanslut vid behov.",
                fix_url: FIX_URLS.connections,
              });
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
          mark("yoy_compute", "error", {
            message: `Trend-beräkning misslyckades: ${e.message || String(e)}`,
            fix: "Kör en ny snapshot från Inställningar → Snapshots eller försök igen om en stund.",
          });
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
          mark("attribution", "missing", (!has.ga4 && !has.ads) ? {
            message: "Saknar både GA4 och Google Ads",
            fix: "Anslut minst en av Google Analytics 4 eller Google Ads under Inställningar → Kopplingar.",
            fix_url: FIX_URLS.connections,
          } : {
            message: "Kunde inte hämta kanal-attribution",
            fix: "Kontrollera Google-token-scope och återanslut kontot. Token kan ha gått ut.",
            fix_url: FIX_URLS.connections,
          });
        } else {
          (attrSnap.sources as string[] || []).forEach((s) => sources.add(s));
          const hasGa4 = (attrSnap.sources || []).includes("ga4");
          const hasAds = (attrSnap.sources || []).includes("google_ads");
          const partial = !hasGa4 || !hasAds;
          mark("attribution", partial ? "partial" : "ok",
            partial ? {
              message: `Endast ${hasGa4 ? "GA4" : "Google Ads"}-data — ${hasGa4 ? "Google Ads" : "GA4"} saknas så ROAS är ofullständig`,
              fix: `Anslut även ${hasGa4 ? "Google Ads" : "GA4"} under Inställningar → Kopplingar.`,
              fix_url: FIX_URLS.connections,
            } : undefined,
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

      case "executive": {
        const [gscCur, gscPrev, ga4Cur, actionsRes, targetsRes, diagRes] = await Promise.all([
          supabase.from("gsc_snapshots").select("rows,totals,start_date,end_date")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("gsc_snapshots").select("rows,totals,start_date,end_date")
            .eq("project_id", project_id).order("created_at", { ascending: false }).range(1, 1).maybeSingle(),
          supabase.from("ga4_snapshots").select("rows,totals,start_date,end_date")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("action_items").select("title,category,priority,expected_impact_sek,status")
            .eq("project_id", project_id).neq("status", "done")
            .order("expected_impact_sek", { ascending: false, nullsFirst: false }).limit(20),
          supabase.from("kpi_targets").select("metric,label,target_value,direction,channel")
            .eq("project_id", project_id).eq("is_active", true),
          supabase.from("action_items").select("title,category,priority,expected_impact_sek")
            .eq("project_id", project_id)
            .in("source_type", ["seo_diagnose", "ads_diagnose"])
            .order("expected_impact_sek", { ascending: false, nullsFirst: false }).limit(8),
        ]);
        if (gscCur.data) sources.add("gsc");
        if (ga4Cur.data) sources.add("ga4");
        const data: any = {
          gsc: { current: gscCur.data?.totals, previous: gscPrev.data?.totals, top_pages: (gscCur.data?.rows as any[] || []).slice(0, 10) },
          ga4: { current: ga4Cur.data?.totals },
          actions: { open: actionsRes.data || [] },
          targets: (targetsRes.data || []).map((t: any) => ({ ...t, actual_value: 0 })),
          top_diagnoses: (diagRes.data || []).map((a: any) => ({
            title: a.title, category: a.category,
            estimated_value_sek: a.expected_impact_sek, severity: a.priority,
          })),
          period_label: gscCur.data ? `${gscCur.data.start_date} → ${gscCur.data.end_date}` : "",
        };
        const status = (gscCur.data || ga4Cur.data) ? (gscCur.data && ga4Cur.data ? "ok" : "partial") : "missing";
        mark("executive", status, status === "missing" ? "Behöver minst GSC eller GA4-snapshot" : undefined, data);
        break;
      }

      case "seo_performance": {
        const [snap, prev, analysis] = await Promise.all([
          supabase.from("gsc_snapshots").select("*")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("gsc_snapshots").select("totals")
            .eq("project_id", project_id).order("created_at", { ascending: false }).range(1, 1).maybeSingle(),
          supabase.from("analyses").select("keyword_universe_json")
            .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (!snap.data) {
          mark("seo_performance", "missing", !has.gsc ? "GSC-koppling saknas" : "Ingen GSC-snapshot ännu");
        } else {
          sources.add("gsc");
          const rows = (snap.data.rows as any[]) || [];
          const universe = (analysis.data?.keyword_universe_json as any) || {};
          const allKws = (universe.keywords || universe.all_keywords || []) as any[];
          const intentDist: Record<string, number> = {};
          for (const k of allKws) { const i = k.intent || "unknown"; intentDist[i] = (intentDist[i] || 0) + 1; }
          mark("seo_performance", "ok", undefined, {
            totals: snap.data.totals,
            prev_totals: prev.data?.totals,
            top_pages: rows.filter((r: any) => r.page || r.keys?.[0]?.startsWith?.("http")).slice(0, 10),
            top_keywords: rows.filter((r: any) => r.keyword || (r.keys?.[0] && !r.keys[0].startsWith?.("http"))).slice(0, 30),
            intent_distribution: Object.keys(intentDist).length ? intentDist : null,
            universe_summary: {
              total: allKws.length,
              enriched: allKws.filter((k: any) => k.searchVolume || k.volume).length,
            },
          });
        }
        break;
      }

      case "ga4_traffic": {
        const { data: snap } = await supabase.from("ga4_snapshots").select("*")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!snap) {
          mark("ga4_traffic", "missing", !has.ga4 ? "GA4-koppling saknas" : "Ingen GA4-snapshot ännu");
        } else {
          sources.add("ga4");
          const rows = (snap.rows as any[]) || [];
          mark("ga4_traffic", "ok", undefined, {
            totals: snap.totals,
            top_pages: rows.filter((r: any) => r.page || r.pagePath).slice(0, 15),
            channels: rows.filter((r: any) => r.channel || r.sessionDefaultChannelGroup).slice(0, 10)
              .map((r: any) => ({ channel: r.channel || r.sessionDefaultChannelGroup, sessions: r.sessions || 0 })),
          });
        }
        break;
      }

      case "keyword_universe": {
        const { data: analysis } = await supabase.from("analyses").select("keyword_universe_json")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const u = (analysis?.keyword_universe_json as any) || null;
        if (!u) {
          mark("keyword_universe", "missing", "Ingen sökordsanalys hittad — kör analys-wizarden");
        } else {
          sources.add("analyses");
          const clusters = (u.clusters || []) as any[];
          const allKws = (u.keywords || u.all_keywords || []) as any[];
          mark("keyword_universe", "ok", undefined, {
            clusters: clusters.map((c: any) => ({
              name: c.name || c.cluster, keyword_count: (c.keywords || []).length,
              total_volume: (c.keywords || []).reduce((s: number, k: any) => s + (k.searchVolume || k.volume || 0), 0),
              avg_cpc: (c.keywords || []).reduce((s: number, k: any) => s + (k.cpc || 0), 0) / Math.max(1, (c.keywords || []).length),
              keywords: c.keywords,
            })),
            top_keywords: [...allKws].sort((a, b) => (b.searchVolume || b.volume || 0) - (a.searchVolume || a.volume || 0)).slice(0, 50),
            total_keywords: allKws.length,
            enriched_keywords: allKws.filter((k: any) => k.searchVolume || k.volume).length,
          });
        }
        break;
      }

      case "segments": {
        const { data: analysis } = await supabase.from("analyses").select("result_json")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const segs = ((analysis?.result_json as any)?.segments || []) as any[];
        if (!segs.length) {
          mark("segments", "missing", "Ingen segmentanalys hittad");
        } else {
          sources.add("analyses");
          mark("segments", "ok", undefined, { segments: segs.sort((a, b) => (b.opportunityScore || b.score || 0) - (a.opportunityScore || a.score || 0)) });
        }
        break;
      }

      case "competitor": {
        const { data: analysis } = await supabase.from("analyses").select("id,keyword_universe_json,result_json")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!analysis) {
          mark("competitor", "missing", "Ingen analys hittad");
          break;
        }
        const { data: gaps } = await supabase.from("backlink_gaps").select("payload").eq("analysis_id", analysis.id).maybeSingle();
        const gapPayload = (gaps?.payload as any) || {};
        const universe = (analysis.keyword_universe_json as any) || {};
        const gapKws = (universe.gap_keywords || universe.competitor_gaps || []) as any[];
        if (!gapPayload.gap_domains?.length && !gapKws.length) {
          mark("competitor", "missing", "Ingen konkurrentdata — kör Teknisk SEO-analys med konkurrenter");
        } else {
          sources.add("semrush");
          mark("competitor", "ok", undefined, {
            gap_domains: gapPayload.gap_domains || [],
            gap_keywords: gapKws,
            own_authority: gapPayload.own_authority,
          });
        }
        break;
      }

      case "content_gap": {
        const { data: analysis } = await supabase.from("analyses").select("keyword_universe_json")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const u = (analysis?.keyword_universe_json as any) || {};
        const gaps = (u.content_gaps || u.gap_keywords || []) as any[];
        if (!gaps.length) {
          mark("content_gap", "missing", "Inga content gaps identifierade");
        } else {
          sources.add("analyses");
          mark("content_gap", "ok", undefined, { gaps });
        }
        break;
      }

      case "cannibalization": {
        const { data: snap } = await supabase.from("gsc_snapshots").select("rows")
          .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!snap) {
          mark("cannibalization", "missing", !has.gsc ? "GSC-koppling saknas" : "Ingen GSC-snapshot ännu");
          break;
        }
        sources.add("gsc");
        const rows = (snap.rows as any[]) || [];
        const byKw: Record<string, { urls: Set<string>; clicks: number; impressions: number }> = {};
        for (const r of rows) {
          const kw = r.keyword || r.keys?.[0]; const url = r.page || r.keys?.[1];
          if (!kw || !url || (typeof kw === "string" && kw.startsWith("http"))) continue;
          if (!byKw[kw]) byKw[kw] = { urls: new Set(), clicks: 0, impressions: 0 };
          byKw[kw].urls.add(url); byKw[kw].clicks += r.clicks || 0; byKw[kw].impressions += r.impressions || 0;
        }
        const cases = Object.entries(byKw)
          .filter(([, v]) => v.urls.size > 1)
          .map(([keyword, v]) => ({ keyword, urls: Array.from(v.urls), total_clicks: v.clicks, total_impressions: v.impressions, lost_clicks: Math.round(v.impressions * 0.05) }))
          .sort((a, b) => b.total_impressions - a.total_impressions).slice(0, 30);
        mark("cannibalization", "ok", undefined, { cannibalized_keywords: cases });
        break;
      }

      case "paid_vs_organic": {
        const [gsc, ads] = await Promise.all([
          supabase.from("gsc_snapshots").select("totals").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("ads_audits").select("summary").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (!gsc.data && !ads.data) {
          mark("paid_vs_organic", "missing", "Behöver både GSC och Google Ads-data");
        } else {
          if (gsc.data) sources.add("gsc");
          if (ads.data) sources.add("google_ads");
          const adsSummary = (ads.data?.summary as any) || {};
          mark("paid_vs_organic", (gsc.data && ads.data) ? "ok" : "partial", undefined, {
            organic: { clicks: (gsc.data?.totals as any)?.clicks || 0, impressions: (gsc.data?.totals as any)?.impressions || 0 },
            paid: { clicks: adsSummary.clicks || 0, cost: adsSummary.cost || 0, conversions: adsSummary.conversions || 0 },
          });
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

    // Berika payload för cover-slides och AI-prompt
    try {
      const { data: project } = await supabase
        .from("projects").select("name, domain, workspace_type")
        .eq("id", project_id).maybeSingle();
      payload.project_id = project_id;
      payload.project_domain = (project as any)?.domain || "";
      payload.report_name = name || `${humanReportTypeLocal(report_type)} · ${(project as any)?.name || ""}`.trim();
      payload.period_label = new Date().toLocaleDateString("sv-SE", { year: "numeric", month: "long" });
    } catch (e) {
      console.warn("project enrich failed", e);
    }

    // AI-insikter via Lovable AI Gateway (best-effort, blockerar aldrig)
    if (Deno.env.get("LOVABLE_API_KEY")) {
      try {
        payload.ai_insights = await generateAiInsights(report_type, sections);
      } catch (e) {
        console.warn("AI insights failed:", e);
        payload.ai_insights = {};
      }
    }

    // Standardiserad presentationsmall (slides + bakåtkompatibel summary/charts/tables)
    try {
      payload.template = buildTemplate(payload as any);
    } catch (e) {
      console.warn("template build failed", e);
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

function humanReportTypeLocal(t: string): string {
  const labels: Record<string, string> = {
    executive: "Executive Månadsrapport", seo_performance: "SEO Performance",
    ga4_traffic: "GA4 Trafikrapport", keyword_universe: "Sökordsanalys",
    segments: "Segmentrapport", share_of_voice: "Share of Voice",
    auction_insights: "Auction Insights", competitor: "Konkurrentrapport",
    content_gap: "Content Gap", cannibalization: "Kannibaliseringsanalys",
    paid_vs_organic: "Paid vs Organic", yoy: "YoY / MoM Trend", roi: "ROI & Attribution",
  };
  return labels[t] || t;
}

async function generateAiInsights(
  reportType: string,
  sections: Record<string, { status: string; reason?: string; data?: unknown }>,
): Promise<Record<string, any>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return {};

  // Komprimera sektionsdata
  const compact: Record<string, any> = {};
  for (const [k, v] of Object.entries(sections)) {
    if (v.status === "ok" || v.status === "partial") {
      const json = JSON.stringify(v.data);
      compact[k] = json.length > 2000 ? json.slice(0, 2000) + "...[truncated]" : v.data;
    }
  }
  if (!Object.keys(compact).length) return {};

  const systemPrompt = `Du är en erfaren digital marknadsanalytiker som skriver insikter på svenska för en månads-/kvartalsrapport. Var konkret, datadriven och affärsfokuserad. Belopp i SEK. Svara ENDAST med valid JSON.`;
  const schema = {
    [reportType]: {
      report_headline: "string (kort, max 80 tecken)",
      key_insight: "string (en meningar, max 140 tecken)",
      opportunity_text: "string (möjlighetsbeskrivning)",
      opportunity_value: "number (estimerat månadsvärde i SEK)",
      opportunity_short: "string (max 50 tecken)",
      risk_text: "string", risk_level: "låg|medel|hög", risk_short: "string (max 50 tecken)",
      insight_text: "string (2-3 meningar djupare analys)",
      total_value: "number (totalt potentiellt månadsvärde SEK)",
      next_steps: [{ action: "string", estimated_value_sek: "number", effort: "låg|medel|hög", timeline: "string" }],
    },
  };
  const userPrompt = `Rapporttyp: ${reportType}\n\nDatasektioner:\n${JSON.stringify(compact, null, 2)}\n\nGenerera insikter enligt detta JSON-schema:\n${JSON.stringify(schema, null, 2)}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.warn("AI gateway", resp.status, await resp.text().catch(() => ""));
      return {};
    }
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return {};
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return parsed || {};
  } catch (e) {
    console.warn("generateAiInsights failed", e);
    return {};
  }
}
