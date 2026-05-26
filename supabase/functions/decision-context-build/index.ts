// decision-context-build
//
// Idempotent worker that builds per-action DecisionContext rows using the
// pure v1 pipeline in _shared/decision-context/. Writes to
// public.decision_context.
//
// Inputs (POST body):
//   {
//     project_id: uuid (required),
//     scopes: Array<{ kind: 'action_item'|'ads_change_proposal', id: string }> (required, ≤ 200),
//     force?: boolean
//   }
//
// Behavior:
//   - Auth via is_project_member (anon client + RPC).
//   - Loads action_items / ads_change_proposals for the requested scopes.
//   - Loads project-scoped signals (gsc_snapshots, ga4_snapshots, ads_mutations,
//     outcome_learnings) and the matching opportunity_score (when scope = ads).
//   - Builds candidate lists and calls pure `buildDecisionContext`.
//   - Idempotency: skips when existing row's inputs_hash matches (unless force).
//   - LLM narrative: only when DECISION_CONTEXT_NARRATIVE_ENABLED=true AND
//     confidence ≥ NARRATIVE_CONFIDENCE_GATE; validated via `validateNarrative`.
//   - UPSERT via separate paths per partial unique index
//     (action_item_id / ads_change_proposal_id).
//   - No mutations outside public.decision_context.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  ANALOG_MIN_SIMILARITY,
  MODEL_VERSION,
  NARRATIVE_CONFIDENCE_GATE,
  SIGNALS_VERSION,
  buildDecisionContext,
  jaccardSimilarity,
  resolveScopeForActionItem,
  resolveScopeForAdsProposal,
  validateNarrative,
  type ActionItemLite,
  type AdsProposalLite,
  type AnalogCandidate,
  type CausalCandidate,
  type ChangeCandidate,
  type DcScope,
  type ScoreSummary,
  type SignalCandidate,
} from "../_shared/decision-context/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_SCOPES_PER_CALL = 200;

interface ReqScope {
  kind: "action_item" | "ads_change_proposal";
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
      if (!s || (s.kind !== "action_item" && s.kind !== "ads_change_proposal") || typeof s.id !== "string") {
        return json({ error: "each scope requires { kind: 'action_item'|'ads_change_proposal', id: string }" }, 400);
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
    const nowIso = new Date().toISOString();

    // ---- Load action_items / ads_change_proposals for requested scopes ----
    const actionItemIds = scopes.filter((s) => s.kind === "action_item").map((s) => s.id);
    const proposalIds = scopes.filter((s) => s.kind === "ads_change_proposal").map((s) => s.id);

    const [actionItemsRes, proposalsRes, learningsRes, oppScoresRes] = await Promise.all([
      actionItemIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from("action_items")
            .select("id, project_id, category, source_type, source_id, source_payload, title, implemented_at")
            .eq("project_id", project_id)
            .in("id", actionItemIds),
      proposalIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from("ads_change_proposals")
            .select("id, project_id, source, action_type, scope_label, rule_id, payload, evidence")
            .eq("project_id", project_id)
            .in("id", proposalIds),
      supabase.from("outcome_learnings").select("*").eq("project_id", project_id),
      supabase
        .from("opportunity_scores")
        .select("*")
        .eq("project_id", project_id)
        .eq("model_version", MODEL_VERSION),
    ]);

    const actionItems = (actionItemsRes.data ?? []) as ActionItemLite[];
    const proposals = (proposalsRes.data ?? []) as AdsProposalLite[];

    if (actionItems.length === 0 && proposals.length === 0) {
      return json({ ok: true, processed: 0, skipped: scopes.length });
    }

    // ---- Load shared signal snapshots (project-scoped) -----------------
    // Best-effort: tables may be empty for new projects.
    const [gscRes, ga4Res, mutationsRes, recentActionsRes] = await Promise.all([
      supabase
        .from("gsc_snapshots")
        .select("id, site_url, start_date, end_date, totals, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("ga4_snapshots")
        .select("id, property_id, start_date, end_date, totals, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("ads_mutations")
        .select("id, mutation_type, target_kind, target_id, payload, created_at, created_by")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("action_items")
        .select("id, category, title, implemented_at, source_payload")
        .eq("project_id", project_id)
        .not("implemented_at", "is", null)
        .order("implemented_at", { ascending: false })
        .limit(50),
    ]);

    const gscSnapshots = (gscRes.data ?? []) as any[];
    const ga4Snapshots = (ga4Res.data ?? []) as any[];
    const mutations = (mutationsRes.data ?? []) as any[];
    const recentActions = (recentActionsRes.data ?? []) as any[];
    const learnings = (learningsRes.data ?? []) as any[];
    const oppScores = (oppScoresRes.data ?? []) as any[];

    // ---- Existing rows for idempotency ---------------------------------
    const [existingActionRes, existingProposalRes] = await Promise.all([
      actionItemIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from("decision_context")
            .select("id, action_item_id, inputs_hash")
            .eq("project_id", project_id)
            .in("action_item_id", actionItemIds),
      proposalIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from("decision_context")
            .select("id, ads_change_proposal_id, inputs_hash")
            .eq("project_id", project_id)
            .in("ads_change_proposal_id", proposalIds),
    ]);
    const existingByAction = new Map<string, { id: string; inputs_hash: string }>();
    for (const r of (existingActionRes.data ?? []) as any[]) {
      if (r.action_item_id) existingByAction.set(r.action_item_id, { id: r.id, inputs_hash: r.inputs_hash });
    }
    const existingByProposal = new Map<string, { id: string; inputs_hash: string }>();
    for (const r of (existingProposalRes.data ?? []) as any[]) {
      if (r.ads_change_proposal_id) existingByProposal.set(r.ads_change_proposal_id, { id: r.id, inputs_hash: r.inputs_hash });
    }

    const narrativeEnabled = (Deno.env.get("DECISION_CONTEXT_NARRATIVE_ENABLED") ?? "false") === "true";

    let processed = 0;
    let skipped = 0;
    const errors: Array<{ scope: ReqScope; error: string }> = [];

    // ---- Per-scope build ------------------------------------------------
    for (const s of scopes) {
      try {
        let scope: DcScope;
        let actionItem: ActionItemLite | undefined;
        let proposal: AdsProposalLite | undefined;
        let scoreForScope: ScoreSummary | null = null;
        let actionDirection: "up" | "down" | "stable" | undefined;

        if (s.kind === "action_item") {
          actionItem = actionItems.find((a) => a.id === s.id);
          if (!actionItem) {
            errors.push({ scope: s, error: "action_item not found" });
            continue;
          }
          scope = resolveScopeForActionItem(actionItem);
          // Pick best-matching opportunity_score by scope ids (when scope = ads
          // we don't have a campaign-level opportunity_score, so leave null).
          scoreForScope = pickOpportunityScore(oppScores, scope) ?? null;
          // Action thesis direction: ads_alert + decreasing metric → "down".
          actionDirection = (actionItem.source_payload as any)?.direction as any;
        } else {
          proposal = proposals.find((p) => p.id === s.id);
          if (!proposal) {
            errors.push({ scope: s, error: "ads_change_proposal not found" });
            continue;
          }
          scope = resolveScopeForAdsProposal(proposal);
          scoreForScope = pickOpportunityScore(oppScores, scope) ?? null;
        }

        // ---- Candidate assembly (best-effort) ------------------------------
        const deltaCands = assembleSignalCandidates(scope, gscSnapshots, ga4Snapshots);
        const relatedCands = deltaCands; // same pool — selectors apply diversity/dedup
        const causalCands = assembleCausalCandidates(scope, mutations, recentActions, proposal, nowIso);
        const changeCands = assembleChangeCandidates(scope, mutations, recentActions);
        const analogCands = assembleAnalogCandidates(learnings, scope);

        // Oldest signal age (days) — for freshness gate.
        const oldestDays = computeOldestSignalDays(deltaCands, nowIso);

        const { context, inputs_hash } = await buildDecisionContext({
          project_id,
          scope,
          opportunity_score: scoreForScope,
          now_iso: nowIso,
          delta_candidates: deltaCands,
          causal_candidates: causalCands,
          related_candidates: relatedCands,
          change_candidates: changeCands,
          analog_candidates: analogCands,
          action_intent_direction: actionDirection,
          oldest_signal_days: oldestDays,
        });

        // ---- Idempotency check ---------------------------------------------
        const existing = s.kind === "action_item"
          ? existingByAction.get(s.id)
          : existingByProposal.get(s.id);
        if (existing && existing.inputs_hash === inputs_hash && !force) {
          skipped++;
          continue;
        }

        // ---- Optional LLM narrative ----------------------------------------
        let whyThisMatters: string | null = null;
        let narrativeStatus: "generated" | "skipped" | "failed" | "pending" = "skipped";
        const gateTriggers = [...context.confidence.gate_triggers];

        if (!narrativeEnabled) {
          gateTriggers.push("RC_DC_NARRATIVE_DISABLED");
        } else if (context.confidence.value < NARRATIVE_CONFIDENCE_GATE) {
          gateTriggers.push("RC_DC_NARRATIVE_DISABLED");
        } else {
          const text = await generateNarrative(context, project_id);
          if (text) {
            const ev = validateNarrative(text, context.evidence.map((e) => e.id));
            if (ev.ok) {
              whyThisMatters = text;
              narrativeStatus = "generated";
            } else {
              narrativeStatus = "failed";
              gateTriggers.push("RC_DC_NARRATIVE_VALIDATION_FAILED");
            }
          } else {
            narrativeStatus = "failed";
            gateTriggers.push("RC_DC_NARRATIVE_VALIDATION_FAILED");
          }
        }

        const row = {
          project_id,
          action_item_id: s.kind === "action_item" ? s.id : null,
          ads_change_proposal_id: s.kind === "ads_change_proposal" ? s.id : null,
          scope: context.scope,
          why_this_matters: whyThisMatters,
          what_changed: context.what_changed,
          causal_signals: context.causal_signals,
          related_signals: context.related_signals,
          recent_changes: context.recent_changes,
          historical_analogs: context.historical_analogs,
          expected_impact: scoreForScope?.expected_impact ?? null,
          risk: context.risk,
          confidence: { ...context.confidence, gate_triggers: gateTriggers, narrative_status: narrativeStatus },
          evidence: context.evidence,
          recommended_next_step: context.recommended_next_step,
          inputs_hash,
          model_version: MODEL_VERSION,
          signals_version: SIGNALS_VERSION,
          generated_at: nowIso,
          updated_at: nowIso,
        };

        // Partial unique indexes mean we cannot upsert with a single onConflict
        // clause. UPDATE existing by id, else INSERT.
        if (existing) {
          const { error: upErr } = await supabase
            .from("decision_context")
            .update(row)
            .eq("id", existing.id);
          if (upErr) {
            errors.push({ scope: s, error: `update failed: ${upErr.message}` });
            continue;
          }
        } else {
          const { error: insErr } = await supabase.from("decision_context").insert(row);
          if (insErr) {
            errors.push({ scope: s, error: `insert failed: ${insErr.message}` });
            continue;
          }
        }
        processed++;
      } catch (e) {
        errors.push({ scope: s, error: String((e as Error)?.message ?? e) });
      }
    }

    return json({
      ok: errors.length === 0,
      processed,
      skipped,
      errors,
      model_version: MODEL_VERSION,
      signals_version: SIGNALS_VERSION,
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

/** Convert opportunity_scores row to ScoreSummary shape. */
function toScoreSummary(row: any): ScoreSummary {
  return {
    score: Number(row.score ?? 0),
    score_band: row.score_band,
    confidence: Number(row.confidence ?? 0),
    confidence_band: row.confidence_band,
    components: row.components ?? {},
    vetoes_triggered: row.vetoes_triggered ?? [],
    contribution_trace: row.contribution_trace ?? [],
    expected_impact: row.expected_impact ?? undefined,
    model_version: row.model_version,
    signals_version: row.signals_version,
  };
}

/**
 * Pick the best-matching opportunity_score for a scope.
 * Preference:
 *   1. scope_kind="cluster" + scope_id matches "cluster:<id>"
 *   2. scope_kind="keyword" + scope_id matches "keyword:<id>"
 *   3. Otherwise null.
 */
function pickOpportunityScore(rows: any[], scope: DcScope): ScoreSummary | null {
  for (const id of scope.ids) {
    const [kind, value] = id.split(":");
    const row = rows.find((r) => r.scope_kind === kind && r.scope_id === value);
    if (row) return toScoreSummary(row);
  }
  return null;
}

/** Compute signal candidates from gsc/ga4 snapshot pairs (current vs prior). */
function assembleSignalCandidates(
  scope: DcScope,
  gsc: any[],
  ga4: any[],
): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  const scopeProximity = scope.kind === "site" ? 1.0 : scope.kind === "page" ? 1.0 : 0.6;

  // Site-wide totals from latest two GSC snapshots.
  if (gsc.length >= 2) {
    const cur = gsc[0];
    const prev = gsc[1];
    const curT = (cur?.totals ?? {}) as Record<string, number>;
    const prevT = (prev?.totals ?? {}) as Record<string, number>;
    for (const metric of ["clicks", "impressions", "ctr", "position"]) {
      if (typeof curT[metric] === "number" && typeof prevT[metric] === "number" && prevT[metric] !== 0) {
        const cv = curT[metric] as number;
        const pv = prevT[metric] as number;
        const delta_pct = (cv - pv) / Math.abs(pv);
        const direction: SignalCandidate["direction"] = delta_pct > 0.01 ? "up" : delta_pct < -0.01 ? "down" : "stable";
        out.push({
          id: `gsc:${metric}:${cur.id}`,
          source: "gsc",
          metric,
          value: cv,
          baseline: pv,
          delta_pct,
          absolute_change: Math.abs(cv - pv),
          window_days: 28,
          scope_proximity: scopeProximity,
          direction,
          signal_quality: 0.9,
          observed_at: cur.created_at,
          evidence: {
            id: `gsc:${cur.id}:${metric}`,
            source: "gsc",
            source_id: cur.id,
            observed_at: cur.created_at,
          },
          label: `GSC ${metric}`,
        });
      }
    }
  }

  if (ga4.length >= 2) {
    const cur = ga4[0];
    const prev = ga4[1];
    const curT = (cur?.totals ?? {}) as Record<string, number>;
    const prevT = (prev?.totals ?? {}) as Record<string, number>;
    for (const metric of ["sessions", "conversions", "users", "pageviews"]) {
      if (typeof curT[metric] === "number" && typeof prevT[metric] === "number" && prevT[metric] !== 0) {
        const cv = curT[metric] as number;
        const pv = prevT[metric] as number;
        const delta_pct = (cv - pv) / Math.abs(pv);
        const direction: SignalCandidate["direction"] = delta_pct > 0.01 ? "up" : delta_pct < -0.01 ? "down" : "stable";
        out.push({
          id: `ga4:${metric}:${cur.id}`,
          source: "ga4",
          metric,
          value: cv,
          baseline: pv,
          delta_pct,
          absolute_change: Math.abs(cv - pv),
          window_days: 28,
          scope_proximity: scopeProximity,
          direction,
          signal_quality: 0.9,
          observed_at: cur.created_at,
          evidence: {
            id: `ga4:${cur.id}:${metric}`,
            source: "ga4",
            source_id: cur.id,
            observed_at: cur.created_at,
          },
          label: `GA4 ${metric}`,
        });
      }
    }
  }

  return out;
}

function assembleCausalCandidates(
  scope: DcScope,
  mutations: any[],
  recentActions: any[],
  proposal: AdsProposalLite | undefined,
  nowIso: string,
): CausalCandidate[] {
  const out: CausalCandidate[] = [];
  const nowMs = Date.parse(nowIso);

  for (const m of mutations) {
    const days = Math.max(0, (nowMs - Date.parse(m.created_at)) / 86_400_000);
    if (days > 30) continue;
    const inScope = scope.kind === "ads"; // ads mutations only meaningful for ads scope
    out.push({
      id: `ads_mutation:${m.id}`,
      label: `Annonsändring: ${m.mutation_type}`,
      description: m.payload?.summary ?? undefined,
      days_ago: days,
      scope_proximity: inScope ? 0.9 : 0.3,
      magnitude: 0.5,
      prior_likelihood: 0.6,
      evidence: [{
        id: `ads_mutation:${m.id}`,
        source: "ads",
        source_id: m.id,
        observed_at: m.created_at,
      }],
    });
  }

  // NOTE: recent operator actions are surfaced via `recent_changes` (built
  // separately by assembleChangeCandidates). They are NOT causal candidates —
  // a previous action is a notation, not a mechanical change. Dropping them
  // here prevents the same item from being double-classified.
  void recentActions;

  // The rule that generated this proposal is itself a high-prior causal candidate.
  if (proposal?.rule_id) {
    out.push({
      id: `rule:${proposal.id}`,
      label: `Regel utlöste förslag: ${proposal.rule_id}`,
      days_ago: 0,
      scope_proximity: 1.0,
      magnitude: 0.7,
      prior_likelihood: 0.8,
      evidence: [{
        id: `rule:${proposal.id}`,
        source: "ads",
        source_id: proposal.id,
      }],
    });
  }

  return out;
}

function assembleChangeCandidates(
  scope: DcScope,
  mutations: any[],
  recentActions: any[],
): ChangeCandidate[] {
  const out: ChangeCandidate[] = [];
  for (const m of mutations) {
    out.push({
      id: `ads_mutation:${m.id}`,
      kind: "ads_mutation",
      label: `${m.mutation_type} (${m.target_kind})`,
      occurred_at: m.created_at,
      actor: m.created_by ?? undefined,
      entity_id: `${m.target_kind}:${m.target_id}`,
    });
  }
  for (const a of recentActions) {
    if (!a.implemented_at) continue;
    out.push({
      id: `action:${a.id}`,
      kind: "action_implemented",
      label: a.title ?? a.category ?? "Implemented action",
      occurred_at: a.implemented_at,
      entity_id: `action:${a.id}`,
    });
  }
  // Reference `scope` to suppress unused-parameter warnings in some bundlers.
  void scope;
  return out;
}

/**
 * Build analog candidates from outcome_learnings.
 * Similarity = token-Jaccard between the scope's hint cluster_family and the
 * learning's cluster_family. Caller-side filter keeps same-project guarantee
 * (query is `eq("project_id", project_id)`).
 */
function assembleAnalogCandidates(learnings: any[], scope: DcScope): AnalogCandidate[] {
  const scopeFamily = scope.hints?.cluster_id ?? scope.ids.find((i) => i.startsWith("cluster:"))?.slice(8) ?? "";
  if (!scopeFamily) {
    // Without a cluster family to compare against, no analogs qualify.
    return [];
  }
  const out: AnalogCandidate[] = [];
  for (const l of learnings) {
    const sim = jaccardSimilarity(scopeFamily, String(l.cluster_family ?? ""));
    if (sim < ANALOG_MIN_SIMILARITY) continue;
    out.push({
      id: String(l.id ?? `${l.cluster_family}:${l.suggested_acquisition_approach}`),
      cluster_family: l.cluster_family,
      suggested_acquisition_approach: l.suggested_acquisition_approach,
      action_category: l.action_category,
      n: Number(l.n ?? 0),
      mean_uplift_pct: l.mean_uplift_pct ?? undefined,
      variance: l.variance ?? undefined,
      last_updated: l.updated_at ?? l.created_at ?? new Date(0).toISOString(),
      similarity: sim,
      scope_kind_match: true,
      label: `${l.cluster_family} → ${l.suggested_acquisition_approach}`,
      scope: "project_only",
    });
  }
  return out;
}

function computeOldestSignalDays(candidates: SignalCandidate[], nowIso: string): number {
  const nowMs = Date.parse(nowIso);
  let oldest = 0;
  for (const c of candidates) {
    if (!c.observed_at) continue;
    const d = Math.max(0, (nowMs - Date.parse(c.observed_at)) / 86_400_000);
    if (d > oldest) oldest = d;
  }
  return oldest;
}

/**
 * LLM narrative generator. Off by default; gated by env flag.
 * Currently a placeholder that returns null — wiring to the gateway is a
 * follow-up. The validation gate ensures only evidence-cited narratives are
 * persisted, so callers can safely opt in incrementally.
 */
async function generateNarrative(
  _context: { confidence: unknown; evidence: { id: string }[] },
  _project_id: string,
): Promise<string | null> {
  return null;
}
