import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Measures impact of implemented action items at 7/30/60/90 day windows.
 * Pulls latest GSC/GA4 snapshot and compares to baseline_metrics on the action.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const projectFilter = body.project_id ?? null;

    let q = supabase.from("action_items").select("*").not("implemented_at", "is", null);
    if (projectFilter) q = q.eq("project_id", projectFilter);

    const { data: actions, error } = await q;
    if (error) throw error;

    let measured = 0;
    for (const action of actions || []) {
      const days = Math.floor((Date.now() - new Date(action.implemented_at).getTime()) / (1000 * 60 * 60 * 24));
      const windows = [7, 30, 60, 90].filter(w => days >= w);
      if (windows.length === 0) continue;

      const baseline = (action.baseline_metrics as any) || {};

      // Get latest GSC totals as proxy
      const { data: gsc } = await supabase
        .from("gsc_snapshots")
        .select("totals")
        .eq("project_id", action.project_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const current = (gsc?.totals as any) || {};

      for (const w of windows) {
        // Skip if already recorded for this window
        const { data: existing } = await supabase
          .from("action_outcomes")
          .select("id")
          .eq("action_id", action.id)
          .eq("days_after_implementation", w)
          .maybeSingle();
        if (existing) continue;

        for (const metric of ["clicks", "impressions", "ctr", "position"]) {
          if (typeof baseline[metric] === "number" && typeof current[metric] === "number") {
            const delta = current[metric] - baseline[metric];
            const deltaPct = baseline[metric] !== 0 ? (delta / baseline[metric]) * 100 : null;
            await supabase.from("action_outcomes").insert({
              action_id: action.id,
              metric_name: metric,
              days_after_implementation: w,
              baseline_value: baseline[metric],
              current_value: current[metric],
              delta,
              delta_pct: deltaPct,
              confidence: w >= 30 ? "medium" : "low",
            });
            measured++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ measured }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
