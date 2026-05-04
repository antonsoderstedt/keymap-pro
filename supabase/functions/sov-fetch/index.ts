// Share of Voice — beräknar din andel av synlighet (impressions) i nischen.
// Källor:
//   1) GSC-snapshot (din domäns impressions per query)
//   2) Semrush organic competitors (estimerad konkurrent-trafik)
//   3) Auction Insights (paid-share från Ads)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SEMRUSH_KEY = Deno.env.get("SEMRUSH_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { project_id } = await req.json();
    if (!project_id) return j({ error: "project_id required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Latest GSC snapshot
    const { data: gscSnap } = await supabase
      .from("gsc_snapshots").select("rows, totals, start_date, end_date, site_url")
      .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const yourImpr = (gscSnap?.totals as any)?.impressions
      ?? ((gscSnap?.rows as any[]) || []).reduce((s, r) => s + (r.impressions || 0), 0);
    const yourClicks = (gscSnap?.totals as any)?.clicks
      ?? ((gscSnap?.rows as any[]) || []).reduce((s, r) => s + (r.clicks || 0), 0);
    const yourDomain = gscSnap?.site_url ? new URL(gscSnap.site_url.replace(/^sc-domain:/, "https://")).hostname : null;

    // 2. Project + competitors (from project record or analyses)
    const { data: project } = await supabase.from("projects")
      .select("domain, competitors").eq("id", project_id).maybeSingle();
    const competitorDomains = (project?.competitors || "")
      .split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 10);

    // 3. Semrush traffic per competitor (organic)
    const competitorRows: any[] = [];
    let marketImpr = yourImpr;
    if (SEMRUSH_KEY && competitorDomains.length) {
      for (const dom of competitorDomains) {
        try {
          const url = `https://api.semrush.com/?type=domain_overview&key=${SEMRUSH_KEY}&domain=${encodeURIComponent(dom)}&database=se&export_columns=Or,Ot`;
          const res = await fetch(url);
          const txt = await res.text();
          const lines = txt.trim().split("\n");
          if (lines.length >= 2) {
            const [organic, traffic] = lines[1].split(";").map(Number);
            const impr = (traffic || 0) * 5; // rough impressions estimate (CTR ~20%)
            competitorRows.push({ domain: dom, organic_keywords: organic || 0, est_traffic: traffic || 0, est_impressions: impr, source: "semrush" });
            marketImpr += impr;
          }
        } catch (e) { console.warn("semrush", dom, e); }
      }
    }

    // 4. Auction Insights — add paid IS context
    const { data: ai } = await supabase
      .from("auction_insights_snapshots").select("rows")
      .eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const aiCompetitors = ((ai?.rows as any)?.competitors as any[]) || [];
    for (const c of aiCompetitors) {
      if (competitorDomains.includes(c.domain)) continue;
      competitorRows.push({ domain: c.domain, paid_impression_share: c.impressionShare, source: "auction_insights" });
    }

    const sovPct = marketImpr > 0 ? (yourImpr / marketImpr) * 100 : 0;
    const sources: string[] = [];
    if (gscSnap) sources.push("gsc");
    if (SEMRUSH_KEY && competitorDomains.length) sources.push("semrush");
    if (aiCompetitors.length) sources.push("auction_insights");

    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - 28);

    const { data: inserted, error } = await supabase
      .from("share_of_voice_snapshots").insert({
        project_id,
        start_date: gscSnap?.start_date || start.toISOString().slice(0, 10),
        end_date: gscSnap?.end_date || today.toISOString().slice(0, 10),
        your_domain: yourDomain || project?.domain,
        your_impressions: yourImpr,
        your_clicks: yourClicks,
        total_market_impressions: marketImpr,
        sov_pct: Math.round(sovPct * 100) / 100,
        competitors: competitorRows,
        sources,
      }).select("*").single();
    if (error) throw error;

    return j({ ok: true, snapshot: inserted });
  } catch (e: any) {
    console.error("sov-fetch", e);
    return j({ error: e.message || String(e) }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
