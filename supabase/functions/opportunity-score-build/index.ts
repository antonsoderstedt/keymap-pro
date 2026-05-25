// opportunity-score-build
//
// Idempotent worker that scores opportunities (keyword | cluster) using the
// pure v1 scoring pipeline in _shared/scoring/. Writes results to
// public.opportunity_scores.
//
// Inputs (POST body):
//   {
//     project_id: uuid (required),
//     scopes: Array<{ kind: 'keyword'|'cluster', id: string }> (required, ≤ 5000),
//     force?: boolean
//   }
//
// Behavior:
//   - Auth via is_project_member (anon client + RPC).
//   - Loads project_business_model, operator_controls(active=true),
//     outcome_learnings, and the matching commercial_intent_labels rows.
//   - Skips scopes already scored at MODEL_VERSION unless force=true.
//   - UPSERT onConflict (project_id, scope_kind, scope_id, model_version).
//   - No LLM. No embedding I/O. Deterministic given stored inputs.
//   - now() supplied by the worker (single value per call) so all rows in a
//     batch share computed_at.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  MODEL_VERSION,
  PROFILE_WEIGHTS,
  SCORE_COMPONENTS,
  SIGNALS_VERSION,
  scoreOpportunity,
  type OperatorControlLite,
  type OutcomeLearningLite,
  type ProjectBusinessModelLite,
  type ScoreInput,
} from "../_shared/scoring/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_SCOPES_PER_CALL = 5000;
const UPSERT_CHUNK = 500;

interface ReqScope {
  kind: "keyword" | "cluster";
  id: string;
}

interface RequestBody {
  project_id: string;
  scopes: ReqScope[];
  force?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json() as RequestBody;
    const { project_id, scopes, force = false } = body;
    if (!project_id || typeof project_id !== "string") {
      return json({ error: "project_id required" }, 400);
    }
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return json({ error: "scopes array required" }, 400);
    }
    if (scopes.length > MAX_SCOPES_PER_CALL) {
      return json({ error: `max ${MAX_SCOPES_PER_CALL} scopes per call` }, 400);
    }
    for (const s of scopes) {
      if (!s || (s.kind !== "keyword" && s.kind !== "cluster") || typeof s.id !== "string") {
        return json({ error: "each scope requires { kind: 'keyword'|'cluster', id: string }" }, 400);
      }
    }

    // ---- Auth ----
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

    const { data: memberRow, error: memberErr } = await userClient.rpc("is_project_member", {
      _project_id: project_id,
      _user_id: authData.user.id,
    });
    if (memberErr || memberRow !== true) {
      return json({ error: "not a project member" }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ---- Load business model + operator controls + learnings ----
    const [{ data: bmRow }, { data: opControls }, { data: learnings }] = await Promise.all([
      supabase.from("project_business_model").select("*").eq("project_id", project_id).maybeSingle(),
      supabase.from("operator_controls").select("*").eq("project_id", project_id).eq("active", true),
      supabase.from("outcome_learnings").select("*").eq("project_id", project_id),
    ]);

    const businessModel: ProjectBusinessModelLite = bmRow
      ? {
          workspace_profile: bmRow.workspace_profile,
          aggressiveness_profile: bmRow.aggressiveness_profile,
          lead_quality_target: bmRow.lead_quality_target,
          service_priority: bmRow.service_priority ?? {},
          service_margin_pct: bmRow.service_margin_pct ?? {},
          close_rate_est: bmRow.close_rate_est ?? {},
          fulfillment_capacity: bmRow.fulfillment_capacity ?? {},
          strategic_importance: bmRow.strategic_importance ?? {},
        }
      : {
          // Defaults consistent with project_business_model defaults.
          workspace_profile: "b2b_service",
          aggressiveness_profile: "balanced",
          lead_quality_target: "balanced",
        };

    if (!(businessModel.workspace_profile in PROFILE_WEIGHTS)) {
      return json({
        error: `unknown workspace_profile: ${businessModel.workspace_profile}`,
      }, 400);
    }

    const operatorControls: OperatorControlLite[] = (opControls ?? []).map((r: any) => ({
      id: r.id,
      control_kind: r.control_kind,
      scope: r.scope ?? {},
      value: r.value ?? {},
      reason: r.reason ?? undefined,
      active: r.active,
    }));

    const learningsByKey = new Map<string, OutcomeLearningLite[]>();
    for (const l of (learnings ?? []) as any[]) {
      const key = `${l.cluster_family}::${l.suggested_acquisition_approach}`;
      const item: OutcomeLearningLite = {
        cluster_family: l.cluster_family,
        suggested_acquisition_approach: l.suggested_acquisition_approach,
        action_category: l.action_category,
        n: l.n,
        mean_uplift_pct: l.mean_uplift_pct ?? undefined,
        variance: l.variance ?? undefined,
      };
      const arr = learningsByKey.get(key) ?? [];
      arr.push(item);
      learningsByKey.set(key, arr);
    }

    // ---- Idempotency: which scopes are already scored at MODEL_VERSION? ----
    const keywordIds = scopes.filter((s) => s.kind === "keyword").map((s) => s.id);
    const clusterIds = scopes.filter((s) => s.kind === "cluster").map((s) => s.id);

    const existingScored = new Set<string>(); // key: kind:id
    if (!force) {
      const { data: existing } = await supabase
        .from("opportunity_scores")
        .select("scope_kind, scope_id")
        .eq("project_id", project_id)
        .eq("model_version", MODEL_VERSION)
        .in("scope_id", scopes.map((s) => s.id));
      for (const r of (existing ?? []) as any[]) {
        existingScored.add(`${r.scope_kind}:${r.scope_id}`);
      }
    }

    const toProcess = scopes.filter((s) => !existingScored.has(`${s.kind}:${s.id}`));
    if (toProcess.length === 0) {
      return json({
        ok: true,
        processed: 0,
        skipped: scopes.length,
        model_version: MODEL_VERSION,
        signals_version: SIGNALS_VERSION,
      });
    }

    // ---- Load verdicts for keyword scopes from commercial_intent_labels ----
    // For cluster scopes, we synthesize a verdict by averaging the cluster's
    // member-keyword verdicts (a single deterministic aggregation).
    const verdictRows = keywordIds.length === 0
      ? []
      : (await supabase
          .from("commercial_intent_labels")
          .select("*")
          .eq("project_id", project_id)
          .in("normalized_keyword", keywordIds)).data ?? [];

    const verdictsByKw = new Map<string, any>();
    for (const v of verdictRows as any[]) {
      // Prefer same model_version when multiple rows exist; otherwise the newest.
      const cur = verdictsByKw.get(v.normalized_keyword);
      if (!cur || new Date(v.computed_at) > new Date(cur.computed_at)) {
        verdictsByKw.set(v.normalized_keyword, v);
      }
    }

    // For cluster scopes: fetch member keywords' verdicts.
    const clusterVerdicts = new Map<string, any>();
    if (clusterIds.length > 0) {
      const { data: clusterLabels } = await supabase
        .from("commercial_intent_labels")
        .select("*")
        .eq("project_id", project_id)
        .in("cluster_id", clusterIds);
      const byCluster = new Map<string, any[]>();
      for (const r of (clusterLabels ?? []) as any[]) {
        const arr = byCluster.get(r.cluster_id) ?? [];
        arr.push(r);
        byCluster.set(r.cluster_id, arr);
      }
      for (const [cid, rows] of byCluster.entries()) {
        clusterVerdicts.set(cid, aggregateClusterVerdict(rows));
      }
    }

    // ---- Score every scope deterministically ----
    const nowIso = new Date().toISOString();
    const upserts: any[] = [];
    let skippedNoVerdict = 0;

    for (const s of toProcess) {
      const verdict = s.kind === "keyword"
        ? verdictsByKw.get(s.id)
        : clusterVerdicts.get(s.id);

      if (!verdict) {
        // No verdict means we have nothing to score. Skip; do NOT write a stub.
        skippedNoVerdict++;
        continue;
      }

      const clusterFamily = s.kind === "cluster"
        ? s.id
        : `kw:${verdict.normalized_keyword}`;
      const approach = String(verdict.suggested_acquisition_approach ?? "unknown");
      const matchingLearnings = learningsByKey.get(`${clusterFamily}::${approach}`) ?? [];

      const input: ScoreInput = {
        scope_kind: s.kind,
        scope_id: s.id,
        verdict: {
          keyword: verdict.keyword,
          normalized_keyword: verdict.normalized_keyword,
          search_intent: verdict.search_intent,
          buyer_stage: verdict.buyer_stage,
          commercial_intent_score: Number(verdict.commercial_intent_score),
          business_relevance_score: Number(verdict.business_relevance_score),
          conversion_likelihood: Number(verdict.conversion_likelihood),
          serp_competitiveness: Number(verdict.serp_competitiveness),
          commoditization_score: Number(verdict.commoditization_score),
          estimated_commercial_value: verdict.estimated_commercial_value,
          evidence: Array.isArray(verdict.evidence) ? verdict.evidence : [],
        },
        business_model: businessModel,
        matching_learnings: matchingLearnings,
        // mapped_service_id / mapped_theme_id / landing_page_fit / competition_quality
        // remain unset in this MVP; future workers will resolve them.
      };

      const result = scoreOpportunity({
        input,
        operator_controls: operatorControls,
        now_iso: nowIso,
      });

      upserts.push({
        project_id,
        scope_kind: result.scope_kind,
        scope_id: result.scope_id,
        score: result.score,
        score_band: result.score_band,
        confidence: result.confidence,
        confidence_band: result.confidence_band,
        components: result.components,
        weights_applied: result.weights_applied,
        multipliers_applied: result.multipliers_applied,
        vetoes_triggered: result.vetoes_triggered,
        contribution_trace: result.contribution_trace,
        freshness: result.freshness,
        learning_adjustment: result.learning_adjustment ?? null,
        expected_impact: result.expected_impact ?? null,
        risk: result.risk ?? null,
        workspace_profile: result.workspace_profile,
        model_version: result.model_version,
        signals_version: result.signals_version,
        computed_at: result.computed_at,
      });
    }

    // ---- UPSERT in chunks ----
    let written = 0;
    for (let i = 0; i < upserts.length; i += UPSERT_CHUNK) {
      const chunk = upserts.slice(i, i + UPSERT_CHUNK);
      const { error: upErr } = await supabase
        .from("opportunity_scores")
        .upsert(chunk, { onConflict: "project_id,scope_kind,scope_id,model_version" });
      if (upErr) {
        return json({ error: `upsert failed: ${upErr.message}` }, 500);
      }
      written += chunk.length;
    }

    return json({
      ok: true,
      processed: written,
      skipped: scopes.length - toProcess.length + skippedNoVerdict,
      skipped_no_verdict: skippedNoVerdict,
      model_version: MODEL_VERSION,
      signals_version: SIGNALS_VERSION,
      profile: businessModel.workspace_profile,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Deterministic cluster verdict aggregation (average of numeric fields,
// majority vote for categorical, union of evidence). Used only when scoring a
// cluster scope.
function aggregateClusterVerdict(rows: any[]): any | null {
  if (rows.length === 0) return null;
  // Sort by normalized_keyword for stable ordering.
  rows.sort((a, b) => String(a.normalized_keyword).localeCompare(String(b.normalized_keyword)));
  const n = rows.length;
  const avg = (key: string) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) / n;
  const mode = (key: string) => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1);
    let best = rows[0][key];
    let bestC = -1;
    for (const [k, c] of counts.entries()) {
      if (c > bestC || (c === bestC && String(k) < String(best))) {
        best = k;
        bestC = c;
      }
    }
    return best;
  };
  const valueAvg = {
    p10: rows.reduce((s, r) => s + Number(r.estimated_commercial_value?.p10 ?? 0), 0) / n,
    p50: rows.reduce((s, r) => s + Number(r.estimated_commercial_value?.p50 ?? 0), 0) / n,
    p90: rows.reduce((s, r) => s + Number(r.estimated_commercial_value?.p90 ?? 0), 0) / n,
    currency: rows[0].estimated_commercial_value?.currency ?? "SEK",
  };
  return {
    keyword: rows[0].keyword,
    normalized_keyword: rows[0].normalized_keyword,
    search_intent: mode("search_intent"),
    buyer_stage: mode("buyer_stage"),
    commercial_intent_score: avg("commercial_intent_score"),
    business_relevance_score: avg("business_relevance_score"),
    conversion_likelihood: avg("conversion_likelihood"),
    serp_competitiveness: avg("serp_competitiveness"),
    commoditization_score: avg("commoditization_score"),
    estimated_commercial_value: valueAvg,
    suggested_acquisition_approach: mode("suggested_acquisition_approach"),
    evidence: rows.flatMap((r) => Array.isArray(r.evidence) ? r.evidence : []),
    computed_at: rows[0].computed_at,
  };
}

// Required by the type imports.
void SCORE_COMPONENTS;
