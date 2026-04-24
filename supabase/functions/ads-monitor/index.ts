import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * AI-driven optimisation engine for a workspace.
 * Reads available data (GSC, GA4, latest analysis, action_items) and generates alerts
 * with concrete, actionable suggestions. When Google Ads is connected (Phase 3 live),
 * it will additionally fetch Ads anomalies. For now it works with what's available.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const [{ data: project }, { data: gsc }, { data: ga4 }, { data: analyses }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", project_id).maybeSingle(),
      supabase.from("gsc_snapshots").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ga4_snapshots").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("analyses").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1),
    ]);

    if (!project) throw new Error("Project not found");

    const generated: any[] = [];

    // Rule-based alerts from GSC
    if (gsc?.rows?.length) {
      const queries = gsc.rows.filter((r: any) => r.query);
      const opps = queries.filter((q: any) => q.position > 4 && q.position < 12 && q.impressions > 100);
      if (opps.length > 0) {
        generated.push({
          type: "seo_opportunity", category: "seo", severity: "info",
          title: `${opps.length} sökord på position 5-11 — quick wins`,
          message: `Sajten visas för ${opps.length} sökord precis utanför topp-3 men får inte klick. Skriv om titel/meta för dessa sidor.`,
          suggested_action: "Optimera meta + titel för topp 5 möjligheter",
          expected_impact: `Förväntat +${Math.round(opps.reduce((s: number, q: any) => s + q.impressions * 0.08, 0))} klick/mån`,
          payload: { top_opportunities: opps.slice(0, 5).map((q: any) => ({ query: q.query, position: q.position, impressions: q.impressions })) },
        });
      }

      // Low CTR despite high position
      const lowCtr = queries.filter((q: any) => q.position < 5 && q.ctr < 0.03 && q.impressions > 100);
      if (lowCtr.length > 0) {
        generated.push({
          type: "low_ctr", category: "seo", severity: "warning",
          title: `${lowCtr.length} sökord i topp 5 men låg CTR`,
          message: "Höga rankings men dåliga klick — meta/title säljer inte.",
          suggested_action: "Skriv om meta description med tydligare värdeerbjudande och CTA",
          expected_impact: "Förväntat +20-40% CTR per sida",
          payload: { queries: lowCtr.slice(0, 5).map((q: any) => ({ query: q.query, ctr: q.ctr, position: q.position })) },
        });
      }
    } else {
      generated.push({
        type: "missing_data", category: "setup", severity: "info",
        title: "Search Console inte kopplad",
        message: "Koppla GSC för att få SEO-alerts och prestanda-mätning.",
        suggested_action: "Anslut Google Search Console under Inställningar",
      });
    }

    // GA4 alerts
    if (!ga4) {
      generated.push({
        type: "missing_data", category: "setup", severity: "info",
        title: "GA4 inte kopplad",
        message: "Utan GA4 kan vi inte mäta konvertering eller kanal-fördelning.",
        suggested_action: "Anslut Google Analytics under Inställningar",
      });
    }

    // Live Google Ads alerts when token + customer linked
    const hasAdsToken = !!Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const { data: gset } = await supabase
      .from("project_google_settings").select("ads_customer_id").eq("project_id", project_id).maybeSingle();

    if (!hasAdsToken) {
      generated.push({
        type: "ads_setup", category: "ads", severity: "info",
        title: "Google Ads developer token saknas",
        message: "Lägg till GOOGLE_ADS_DEVELOPER_TOKEN för att aktivera Auction Insights och Ads-optimering.",
        suggested_action: "Lägg till secret i Lovable Cloud-inställningar",
      });
    } else if (!gset?.ads_customer_id) {
      generated.push({
        type: "ads_setup", category: "ads", severity: "info",
        title: "Google Ads-konto inte valt",
        message: "Välj vilket Ads-konto den här kunden tillhör under Inställningar för att aktivera live-data.",
        suggested_action: "Välj Ads-konto under Inställningar",
      });
    } else {
      // Pull latest auction insights snapshot and look for anomalies
      const { data: aiSnap } = await supabase
        .from("auction_insights_snapshots").select("*").eq("project_id", project_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const campaigns = (aiSnap?.rows as any)?.campaigns || [];
      const lostBudget = campaigns.filter((c: any) => (c.lostBudget ?? 0) > 0.15);
      const lostRank = campaigns.filter((c: any) => (c.lostRank ?? 0) > 0.20);
      if (lostBudget.length) {
        generated.push({
          type: "ads_budget_lost", category: "ads", severity: "warning",
          title: `${lostBudget.length} kampanj(er) tappar visningar pga budget`,
          message: `Lost IS (budget) över 15% — du missar visningar du skulle vunnit.`,
          suggested_action: "Höj dagsbudget med 15-25% på kampanjer med stark ROAS",
          payload: { campaigns: lostBudget.slice(0, 5) },
        });
      }
      if (lostRank.length) {
        generated.push({
          type: "ads_rank_lost", category: "ads", severity: "warning",
          title: `${lostRank.length} kampanj(er) tappar visningar pga ranking`,
          message: "Lost IS (rank) över 20% — Quality Score eller bud för lågt.",
          suggested_action: "Förbättra annonsrelevans, landningssida, eller höj bud",
          payload: { campaigns: lostRank.slice(0, 5) },
        });
      }
    }

    // Insert all
    if (generated.length > 0) {
      await supabase.from("alerts").insert(generated.map(a => ({ ...a, project_id })));
    }

    return new Response(JSON.stringify({ generated: generated.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
