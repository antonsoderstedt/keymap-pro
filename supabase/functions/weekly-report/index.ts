// Weekly snapshot report — generates a summary of last 7 days vs previous 7 days
// across GSC, GA4, Ads, action items. Stores result as a workspace_artifact.
// Triggered by cron (weekly) or manually per project.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const projectFilter: string | null = body.project_id ?? null;

    // Get all active projects (or just the one)
    let q = supabase.from("projects").select("id, name, user_id").eq("is_archived", false);
    if (projectFilter) q = q.eq("id", projectFilter);
    const { data: projects, error: pErr } = await q;
    if (pErr) throw pErr;

    const generated: any[] = [];

    for (const project of projects ?? []) {
      const now = new Date();
      const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // GSC last week vs previous
      const { data: gscRows } = await supabase
        .from("gsc_snapshots")
        .select("totals, created_at")
        .eq("project_id", project.id)
        .gte("created_at", fourteenAgo.toISOString())
        .order("created_at", { ascending: false });

      const gscThis = (gscRows ?? []).find((r) => new Date(r.created_at) >= sevenAgo)?.totals as any;
      const gscPrev = (gscRows ?? []).find((r) => new Date(r.created_at) < sevenAgo)?.totals as any;

      // GA4
      const { data: gaRows } = await supabase
        .from("ga4_snapshots")
        .select("totals, created_at")
        .eq("project_id", project.id)
        .gte("created_at", fourteenAgo.toISOString())
        .order("created_at", { ascending: false });
      const gaThis = (gaRows ?? []).find((r) => new Date(r.created_at) >= sevenAgo)?.totals as any;
      const gaPrev = (gaRows ?? []).find((r) => new Date(r.created_at) < sevenAgo)?.totals as any;

      // Ads
      const { data: adsRows } = await supabase
        .from("auction_insights_snapshots")
        .select("rows, created_at")
        .eq("project_id", project.id)
        .gte("created_at", fourteenAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(2);

      // Action items
      const { data: actions } = await supabase
        .from("action_items")
        .select("status, implemented_at, created_at")
        .eq("project_id", project.id);
      const newActions = (actions ?? []).filter((a) => new Date(a.created_at) >= sevenAgo).length;
      const completed = (actions ?? []).filter((a) => a.implemented_at && new Date(a.implemented_at) >= sevenAgo).length;
      const open = (actions ?? []).filter((a) => a.status !== "done" && a.status !== "archived").length;

      // Alerts new this week
      const { data: alerts } = await supabase
        .from("alerts")
        .select("severity, status, created_at")
        .eq("project_id", project.id)
        .gte("created_at", sevenAgo.toISOString());

      const pct = (cur: number | undefined | null, prev: number | undefined | null): number | null => {
        if (cur == null || prev == null || prev === 0) return null;
        return ((cur - prev) / prev) * 100;
      };

      const summary = {
        period: { start: sevenAgo.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) },
        gsc: gscThis ? {
          clicks: gscThis.clicks ?? null,
          impressions: gscThis.impressions ?? null,
          ctr: gscThis.ctr ?? null,
          position: gscThis.position ?? null,
          delta: {
            clicks_pct: pct(gscThis.clicks, gscPrev?.clicks),
            impressions_pct: pct(gscThis.impressions, gscPrev?.impressions),
          },
        } : null,
        ga4: gaThis ? {
          sessions: gaThis.sessions ?? null,
          conversions: gaThis.conversions ?? null,
          delta: {
            sessions_pct: pct(gaThis.sessions, gaPrev?.sessions),
            conversions_pct: pct(gaThis.conversions, gaPrev?.conversions),
          },
        } : null,
        ads: adsRows && adsRows.length > 0 ? {
          campaigns: ((adsRows[0].rows as any)?.campaigns?.length) ?? 0,
        } : null,
        actions: { new: newActions, completed, open },
        alerts: {
          total: alerts?.length ?? 0,
          critical: (alerts ?? []).filter((a) => a.severity === "critical").length,
        },
      };

      // Save as workspace_artifact
      const { data: artifact, error: artErr } = await supabase
        .from("workspace_artifacts")
        .insert({
          project_id: project.id,
          artifact_type: "weekly_report",
          name: `Veckorapport ${summary.period.end}`,
          description: `Sammanfattning ${summary.period.start} → ${summary.period.end}`,
          payload: summary,
        })
        .select("id")
        .single();

      if (artErr) {
        console.error("Failed to save artifact for project", project.id, artErr);
        continue;
      }

      generated.push({ project_id: project.id, artifact_id: artifact?.id, summary });
    }

    return new Response(JSON.stringify({ ok: true, generated_count: generated.length, generated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("weekly-report error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
