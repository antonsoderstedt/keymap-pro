import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runSeoDiagnostics } from "../_shared/seo-diagnostics/runner.ts";
import type { SeoContentSnapshot, ClusterSummary, GscRow } from "../_shared/seo-diagnostics/types.ts";
import { monthlyKeywordValue } from "../_shared/seo-diagnostics/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getDominant(kws: any[], field: string): string {
  const counts: Record<string, number> = {};
  for (const k of kws) {
    const v = k[field] || "unknown";
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "unknown";
}

async function runAndSaveDiagnosis(project_id: string, supabase: any, opts: { force?: boolean } = {}) {
  const hourBucket = new Date().toISOString().slice(0, 13);
  const cacheKey = `${project_id}:${hourBucket}`;

  if (!opts.force) {
    const { data: cached } = await supabase
      .from("seo_diagnostics_cache")
      .select("snapshot")
      .eq("project_id", project_id)
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached) {
      const report = runSeoDiagnostics(cached.snapshot as SeoContentSnapshot);
      report.meta.cache_hit = true;
      return report;
    }
  }

  const [
    { data: project },
    { data: analysis },
    { data: goals },
    { data: gscSnap },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("domain, competitors, workspace_type")
      .eq("id", project_id)
      .maybeSingle(),
    supabase
      .from("analyses")
      .select("id, keyword_universe_json, result_json")
      .eq("project_id", project_id)
      .not("keyword_universe_json", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_goals")
      .select("*")
      .eq("project_id", project_id)
      .maybeSingle(),
    supabase
      .from("gsc_snapshots")
      .select("rows, totals, site_url, created_at")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  let audit: any = null;
  let backlinks: any = null;
  let briefs: any[] = [];
  if (analysis?.id) {
    const [auditRes, backlinksRes, briefsRes] = await Promise.all([
      supabase.from("site_audits").select("payload").eq("analysis_id", analysis.id).maybeSingle(),
      supabase.from("backlink_gaps").select("payload").eq("analysis_id", analysis.id).maybeSingle(),
      supabase.from("content_briefs").select("cluster").eq("analysis_id", analysis.id),
    ]);
    audit = auditRes.data?.payload ?? null;
    backlinks = backlinksRes.data?.payload ?? null;
    briefs = briefsRes.data ?? [];
  }

  const universe: any = analysis?.keyword_universe_json;
  const gscRows28: GscRow[] = (gscSnap?.[0]?.rows as any) || [];
  const gscRows90: GscRow[] = (gscSnap?.[1]?.rows as any) || gscRows28;
  const gscSiteUrl: string = (gscSnap?.[0] as any)?.site_url || "";

  const clusterMap = new Map<string, any[]>();
  for (const kw of universe?.keywords ?? []) {
    const cName = kw.cluster || "Övrigt";
    if (!clusterMap.has(cName)) clusterMap.set(cName, []);
    clusterMap.get(cName)!.push(kw);
  }
  const briefClusters = new Set((briefs ?? []).map((b: any) => b.cluster));
  const goalsTyped = goals
    ? {
        conversion_type: (goals as any).conversion_type,
        conversion_value: Number((goals as any).conversion_value || 0),
        conversion_rate_pct: Number((goals as any).conversion_rate_pct || 0),
        brand_terms: ((goals as any).brand_terms as string[]) ?? [],
        primary_goal: (goals as any).primary_goal,
      }
    : null;

  const clusters: ClusterSummary[] = Array.from(clusterMap.entries()).map(([name, kws]) => {
    const totalVolume = kws.reduce((s: number, k: any) => s + (k.searchVolume ?? 0), 0);
    const kdVals = kws.filter((k: any) => k.kd != null);
    const cpcVals = kws.filter((k: any) => k.cpc != null);
    const gscForCluster = gscRows28.filter((r) =>
      kws.some((k: any) => (k.keyword || "").toLowerCase() === (r.keyword || "").toLowerCase())
    );
    const bestPos = gscForCluster.length > 0 ? Math.min(...gscForCluster.map((r) => r.position)) : null;
    const estimatedValue = monthlyKeywordValue(totalVolume, bestPos ?? 20, goalsTyped);
    return {
      name,
      keywords: kws,
      total_volume: totalVolume,
      avg_kd: kdVals.length > 0 ? kdVals.reduce((s: number, k: any) => s + (k.kd ?? 0), 0) / kdVals.length : null,
      avg_cpc: cpcVals.length > 0 ? cpcVals.reduce((s: number, k: any) => s + (k.cpc ?? 0), 0) / cpcVals.length : null,
      competitor_gap_count: kws.filter((k: any) => k.competitorGap).length,
      has_brief: briefClusters.has(name),
      dominant_intent: getDominant(kws, "intent"),
      dominant_channel: getDominant(kws, "channel"),
      gsc_keywords: gscForCluster,
      best_position: bestPos,
      estimated_value_sek: estimatedValue,
    };
  });

  const snapshot: SeoContentSnapshot = {
    project_id,
    analysis_id: analysis?.id ?? null,
    domain: (project as any)?.domain ?? "",
    universe: universe
      ? {
          keywords: universe.keywords ?? [],
          clusters,
          total_keywords: universe.totalKeywords ?? (universe.keywords?.length ?? 0),
          total_enriched: universe.totalEnriched ?? 0,
        }
      : null,
    gsc:
      gscRows28.length > 0
        ? { rows_28d: gscRows28, rows_90d: gscRows90, site_url: gscSiteUrl }
        : null,
    audit: audit ?? null,
    backlinks: backlinks ?? null,
    content_briefs: (briefs ?? []).map((b: any) => ({ cluster: b.cluster, exists: true, payload: null })),
    strategy: null,
    goals: goalsTyped,
    competitors: String((project as any)?.competitors ?? "")
      .split(/[,\n]/)
      .map((s: string) => s.trim())
      .filter(Boolean),
  };

  await supabase
    .from("seo_diagnostics_cache")
    .upsert(
      { project_id, cache_key: cacheKey, snapshot, analysis_id: analysis?.id ?? null },
      { onConflict: "project_id,cache_key" }
    );

  const report = runSeoDiagnostics(snapshot);

  await supabase.from("seo_diagnostics_runs").insert({
    project_id,
    analysis_id: analysis?.id ?? null,
    rules_evaluated: report.meta.rules_evaluated,
    rules_fired: report.meta.rules_fired,
    cache_hit: false,
    duration_ms: report.meta.duration_ms,
    report,
  });

  return report;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (body?.run_all_projects) {
      const { data: projects } = await supabase
        .from("analyses")
        .select("project_id")
        .not("keyword_universe_json", "is", null)
        .order("created_at", { ascending: false });

      const uniqueProjects = [...new Set((projects ?? []).map((p: any) => p.project_id))];
      let ok = 0;
      let failed = 0;
      for (const pid of uniqueProjects) {
        try {
          await runAndSaveDiagnosis(pid as string, supabase, { force: true });
          ok++;
        } catch (e) {
          console.error(`[seo-diagnose-cron] failed for ${pid}:`, e);
          failed++;
        }
      }
      return new Response(
        JSON.stringify({ ok: true, projects: uniqueProjects.length, succeeded: ok, failed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const project_id: string | undefined = body?.project_id;
    const force: boolean = !!body?.force;
    if (!project_id || typeof project_id !== "string") {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const report = await runAndSaveDiagnosis(project_id, supabase, { force });
    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[seo-diagnose] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
