/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseService);

    const [scoresRes, gscRes, ideaRes] = await Promise.all([
      sb.from("keyword_scores").select("keyword,kundfit,volume,cpc,kd,dimension,intent_class,source").eq("project_id", project_id).limit(5000),
      sb.from("gsc_snapshots").select("rows,created_at").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("keyword_planner_ideas").select("keyword,avg_monthly_searches,competition_index").eq("project_id", project_id).order("fetched_at", { ascending: false }).limit(5000),
    ]);

    if (scoresRes.error) throw scoresRes.error;

    const map = new Map<string, any>();

    for (const row of scoresRes.data || []) {
      const keyword = normalize((row as any).keyword);
      if (!keyword) continue;
      map.set(keyword, {
        project_id,
        keyword,
        status: (row as any).source === "manual_research" ? "suggested" : "suggested",
        kundfit: (row as any).kundfit,
        volume: (row as any).volume,
        cpc: (row as any).cpc,
        kd: (row as any).kd,
        dimension: (row as any).dimension,
        intent_class: (row as any).intent_class,
        conflict_flag: false,
      });
    }

    const gscRows = ((gscRes.data as any)?.rows as any[]) || [];
    for (const row of gscRows) {
      const keyword = normalize(row.query || row.keyword || row.keys?.[0]);
      if (!keyword) continue;
      const item = map.get(keyword) || { project_id, keyword, status: "organic_only", conflict_flag: false };
      item.status = item.status === "active_ads" ? "active_ads" : "organic_only";
      item.gsc_clicks_30d = Number(row.clicks || 0);
      item.gsc_impressions_30d = Number(row.impressions || 0);
      item.gsc_position = row.position == null ? null : Number(row.position || 0);
      map.set(keyword, item);
    }

    for (const row of ideaRes.data || []) {
      const keyword = normalize((row as any).keyword);
      if (!keyword) continue;
      const item = map.get(keyword) || { project_id, keyword, status: "suggested", conflict_flag: false };
      if (!item.volume) item.volume = Number((row as any).avg_monthly_searches || 0);
      map.set(keyword, item);
    }

    const payload = Array.from(map.values());
    if (payload.length) {
      const { error: upsertError } = await sb
        .from("keyword_master")
        .upsert(payload as any, { onConflict: "project_id,keyword" });
      if (upsertError) throw upsertError;
    }

    const gapCount = payload.filter((row) => row.status === "organic_only" && Number(row.kundfit || 0) > 50).length;
    return json({ ok: true, count: payload.length, gap_count: gapCount });
  } catch (e) {
    console.error("sync-keyword-master error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
