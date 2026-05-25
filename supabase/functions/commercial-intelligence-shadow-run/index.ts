// commercial-intelligence-shadow-run
//
// STEP 6 — Shadow-mode calibration harness.
//
// Read-only over intelligence tables (commercial_intent_labels,
// opportunity_scores, decision_context). Computes distributions, frequencies,
// coverage histograms, and deterministic samples. Writes a single immutable
// audit row to public.shadow_run_results.
//
// NOTHING ELSE IS MUTATED.
//   - No keyword_verdicts/labels are written.
//   - No opportunity_scores are written.
//   - No decision_context rows are written.
//   - No scoring weights, no formula changes.
//
// Input (POST body):
//   {
//     project_id: uuid (required),
//     top_n_keywords?: number (default 1000, hard cap 5000),
//     top_n_actions?: number (default 500, hard cap 2000),
//     sample_n?: number (default 20, hard cap 100),
//     run_label?: string,
//     run_id?: uuid  // optional; reuse to group multi-project runs
//   }
//
// Output:
//   { ok: true, run_id, shadow_run_id, summary, samples, timings }
//
// Auth: is_project_member (anon client + RPC), identical to other workers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  buildSamples,
  buildSummary,
  type DcRow,
  type ScoreRow,
  type VerdictRow,
} from "../_shared/shadow-run/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TOP_N_KEYWORDS = 1000;
const DEFAULT_TOP_N_ACTIONS = 500;
const DEFAULT_SAMPLE_N = 20;
const MAX_TOP_N_KEYWORDS = 5000;
const MAX_TOP_N_ACTIONS = 2000;
const MAX_SAMPLE_N = 100;

interface RequestBody {
  project_id: string;
  top_n_keywords?: number;
  top_n_actions?: number;
  sample_n?: number;
  run_label?: string;
  run_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const errors: Array<{ stage: string; error: string }> = [];

  try {
    const body = (await req.json()) as RequestBody;
    const { project_id, run_label, run_id: callerRunId } = body;
    if (!project_id || typeof project_id !== "string") {
      return json({ error: "project_id required" }, 400);
    }

    const topNKeywords = Math.min(MAX_TOP_N_KEYWORDS, Math.max(1, body.top_n_keywords ?? DEFAULT_TOP_N_KEYWORDS));
    const topNActions = Math.min(MAX_TOP_N_ACTIONS, Math.max(1, body.top_n_actions ?? DEFAULT_TOP_N_ACTIONS));
    const sampleN = Math.min(MAX_SAMPLE_N, Math.max(1, body.sample_n ?? DEFAULT_SAMPLE_N));

    // ---- Auth -----------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) return json({ error: "invalid token" }, 401);

    const { data: memberOk, error: memberErr } = await userClient.rpc("is_project_member", {
      _project_id: project_id,
      _user_id: authData.user.id,
    });
    if (memberErr || memberOk !== true) {
      return json({ error: "not a project member" }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    timings.auth_ms = Date.now() - t0;

    // ---- Read intelligence rows (read-only) ----------------------------
    const t1 = Date.now();
    const [verdictsRes, scoresRes, dcsRes, actionItemsCountRes, actionItemsWithDcRes] = await Promise.all([
      supabase
        .from("commercial_intent_labels")
        .select(
          "id, keyword, search_intent, buyer_stage, commercial_intent_score, business_relevance_score, conversion_likelihood, serp_competitiveness, commoditization_score, lead_quality_proxy, suggested_acquisition_approach, estimated_commercial_value, confidence, evidence, model_version",
        )
        .eq("project_id", project_id)
        .order("commercial_intent_score", { ascending: false, nullsFirst: false })
        .limit(topNKeywords),
      supabase
        .from("opportunity_scores")
        .select(
          "id, scope_kind, scope_id, score, score_band, confidence, confidence_band, components, vetoes_triggered, contribution_trace, expected_impact, risk",
        )
        .eq("project_id", project_id)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(topNKeywords),
      supabase
        .from("decision_context")
        .select(
          "id, action_item_id, ads_change_proposal_id, scope, why_this_matters, what_changed, causal_signals, related_signals, recent_changes, historical_analogs, evidence, expected_impact, risk, confidence, recommended_next_step",
        )
        .eq("project_id", project_id)
        .order("generated_at", { ascending: false })
        .limit(topNActions),
      supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project_id),
      supabase
        .from("decision_context")
        .select("action_item_id", { count: "exact", head: true })
        .eq("project_id", project_id)
        .not("action_item_id", "is", null),
    ]);

    if (verdictsRes.error) errors.push({ stage: "fetch_verdicts", error: verdictsRes.error.message });
    if (scoresRes.error) errors.push({ stage: "fetch_scores", error: scoresRes.error.message });
    if (dcsRes.error) errors.push({ stage: "fetch_dcs", error: dcsRes.error.message });
    if (actionItemsCountRes.error) errors.push({ stage: "fetch_action_count", error: actionItemsCountRes.error.message });
    if (actionItemsWithDcRes.error) errors.push({ stage: "fetch_action_with_dc_count", error: actionItemsWithDcRes.error.message });

    const verdicts = (verdictsRes.data ?? []) as VerdictRow[];
    const scores = (scoresRes.data ?? []) as ScoreRow[];
    const dcs = (dcsRes.data ?? []) as DcRow[];
    const actionItemsTotal = actionItemsCountRes.count ?? 0;
    const actionItemsWithDc = actionItemsWithDcRes.count ?? 0;

    timings.fetch_ms = Date.now() - t1;

    // ---- Aggregate -----------------------------------------------------
    const t2 = Date.now();
    const scoresMissingConfidenceBand = scores.filter(
      (s) => !s.confidence_band || s.confidence_band.length === 0,
    ).length;
    const summary = buildSummary(verdicts, scores, dcs, {
      action_items_total: actionItemsTotal,
      action_items_with_dc: actionItemsWithDc,
      scores_missing_confidence_band: scoresMissingConfidenceBand,
    });
    const samples = buildSamples(verdicts, scores, dcs, sampleN);
    timings.aggregate_ms = Date.now() - t2;

    // ---- Resolve model_version / signals_version from observed data ----
    const modelVersion = pickFirstString([
      ...scores.map((s) => (s as any).model_version as string | undefined),
      ...dcs.map((d) => (d as any).model_version as string | undefined),
      ...verdicts.map((v) => v.model_version ?? undefined),
    ]) ?? "unknown";
    const signalsVersion = pickFirstString([
      ...scores.map((s) => (s as any).signals_version as string | undefined),
      ...dcs.map((d) => (d as any).signals_version as string | undefined),
    ]) ?? "unknown";

    // ---- Persist single shadow_run_results row --------------------------
    const t3 = Date.now();
    const parameters = {
      top_n_keywords: topNKeywords,
      top_n_actions: topNActions,
      sample_n: sampleN,
      verdicts_fetched: verdicts.length,
      scores_fetched: scores.length,
      dcs_fetched: dcs.length,
    };

    const insertRow = {
      project_id,
      run_id: callerRunId ?? undefined,
      run_label: run_label ?? null,
      model_version: modelVersion,
      signals_version: signalsVersion,
      parameters,
      summary,
      samples,
      timings: { ...timings, total_ms: Date.now() - t0 },
      errors,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("shadow_run_results")
      .insert(insertRow)
      .select("id, run_id, created_at")
      .single();

    if (insErr) {
      return json({ error: `failed to persist shadow_run_results: ${insErr.message}`, summary, samples }, 500);
    }
    timings.persist_ms = Date.now() - t3;

    return json({
      ok: errors.length === 0,
      shadow_run_id: inserted.id,
      run_id: inserted.run_id,
      created_at: inserted.created_at,
      model_version: modelVersion,
      signals_version: signalsVersion,
      parameters,
      summary,
      samples,
      timings: { ...timings, total_ms: Date.now() - t0 },
      errors,
    });
  } catch (e) {
    return json(
      {
        error: String((e as Error)?.message ?? e),
        timings: { ...timings, total_ms: Date.now() - t0 },
        errors,
      },
      500,
    );
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function pickFirstString(values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}
