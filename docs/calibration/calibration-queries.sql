-- =============================================================================
-- Commercial Growth Intelligence — Calibration SQL toolkit
-- =============================================================================
--
-- Step 6 — Shadow-mode calibration. Diagnostic queries an operator runs
-- against a project_id to inspect the deterministic pipeline output.
--
-- Usage:
--   1. Identify a project_id to calibrate against.
--   2. (Optional) Trigger a fresh shadow-run via
--        supabase.functions.invoke('commercial-intelligence-shadow-run',
--          { body: { project_id: '<uuid>', sample_n: 20 } })
--   3. Run the queries below in the Supabase SQL editor and copy results
--      into docs/calibration/REVIEW_TEMPLATE.md.
--
-- All queries are READ-ONLY. None mutate intelligence tables.
-- Replace :project_id with your actual UUID.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- A. Headline counts. Are the tables populated at all?
-- ----------------------------------------------------------------------------
SELECT 'verdicts' AS table_name, COUNT(*) AS row_count
FROM public.commercial_intent_labels WHERE project_id = :project_id
UNION ALL
SELECT 'opportunity_scores', COUNT(*) FROM public.opportunity_scores WHERE project_id = :project_id
UNION ALL
SELECT 'decision_context', COUNT(*) FROM public.decision_context WHERE project_id = :project_id
UNION ALL
SELECT 'action_items', COUNT(*) FROM public.action_items WHERE project_id = :project_id
UNION ALL
SELECT 'ads_change_proposals', COUNT(*) FROM public.ads_change_proposals WHERE project_id = :project_id
UNION ALL
SELECT 'shadow_run_results', COUNT(*) FROM public.shadow_run_results WHERE project_id = :project_id
ORDER BY table_name;

-- ----------------------------------------------------------------------------
-- B. Latest shadow_run_results row — full summary payload.
-- ----------------------------------------------------------------------------
SELECT id, created_at, run_label, model_version, signals_version,
       parameters, summary, timings, errors
FROM public.shadow_run_results
WHERE project_id = :project_id
ORDER BY created_at DESC
LIMIT 1;

-- ----------------------------------------------------------------------------
-- C. Score band distribution.
-- "high"+"critical" should be rare. "veto" + "low" should dominate noisy data.
-- ----------------------------------------------------------------------------
SELECT score_band, COUNT(*) AS n,
       ROUND(AVG(score)::numeric, 1) AS mean_score,
       ROUND(AVG(confidence)::numeric, 2) AS mean_confidence
FROM public.opportunity_scores
WHERE project_id = :project_id
GROUP BY score_band
ORDER BY n DESC;

-- ----------------------------------------------------------------------------
-- D. Top 20 opportunities — qualitative review target.
-- Ask: "Does each top entry actually look commercially worth doing?"
-- ----------------------------------------------------------------------------
SELECT scope_kind, scope_id, score, score_band, confidence, confidence_band,
       vetoes_triggered,
       (SELECT array_agg(component ORDER BY rank)
        FROM jsonb_to_recordset(contribution_trace)
          AS x(component text, rank int) WHERE rank <= 3) AS top3_components,
       expected_impact->>'p50' AS expected_p50_sek,
       risk->>'band' AS risk_band
FROM public.opportunity_scores
WHERE project_id = :project_id
  AND NOT (vetoes_triggered IS NOT NULL AND array_length(vetoes_triggered, 1) > 0)
ORDER BY score DESC NULLS LAST
LIMIT 20;

-- ----------------------------------------------------------------------------
-- E. Bottom 20 non-vetoed opportunities.
-- Ask: "Is the bottom legitimately weak, or is the formula penalising
-- something it shouldn't?"
-- ----------------------------------------------------------------------------
SELECT scope_kind, scope_id, score, confidence, components, contribution_trace
FROM public.opportunity_scores
WHERE project_id = :project_id
  AND NOT (vetoes_triggered IS NOT NULL AND array_length(vetoes_triggered, 1) > 0)
ORDER BY score ASC NULLS LAST
LIMIT 20;

-- ----------------------------------------------------------------------------
-- F. Vetoed opportunities + reasons.
-- Ask: "Are the vetoes correct? Is anything legitimately good being killed?"
-- ----------------------------------------------------------------------------
SELECT scope_kind, scope_id, score, vetoes_triggered, risk->>'band' AS risk_band,
       components
FROM public.opportunity_scores
WHERE project_id = :project_id
  AND vetoes_triggered IS NOT NULL
  AND array_length(vetoes_triggered, 1) > 0
ORDER BY score DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- G. Veto frequency (across all scored opportunities).
-- ----------------------------------------------------------------------------
SELECT unnest(vetoes_triggered) AS veto_code, COUNT(*) AS n
FROM public.opportunity_scores
WHERE project_id = :project_id
  AND vetoes_triggered IS NOT NULL
  AND array_length(vetoes_triggered, 1) > 0
GROUP BY 1
ORDER BY n DESC;

-- ----------------------------------------------------------------------------
-- H. Mean contribution per component across the top quartile.
-- Ask: "Is one component dominating? Is any signal carrying no weight?"
-- ----------------------------------------------------------------------------
WITH top_quartile AS (
  SELECT id, contribution_trace
  FROM public.opportunity_scores
  WHERE project_id = :project_id
    AND score IS NOT NULL
  ORDER BY score DESC
  LIMIT (SELECT GREATEST(20, COUNT(*) / 4) FROM public.opportunity_scores WHERE project_id = :project_id)
),
exploded AS (
  SELECT tq.id, (t->>'component') AS component,
         (t->>'points_contributed')::numeric AS points,
         (t->>'rank')::int AS rank
  FROM top_quartile tq, jsonb_array_elements(tq.contribution_trace) t
)
SELECT component,
       COUNT(*) AS appearances,
       ROUND(AVG(points)::numeric, 2) AS mean_points,
       ROUND(AVG(rank)::numeric, 2) AS mean_rank
FROM exploded
GROUP BY component
ORDER BY mean_points DESC;

-- ----------------------------------------------------------------------------
-- I. Low-confidence opportunities (< 0.4) — calibration target.
-- Ask: "Why is confidence low? Is the gating sensible or noisy?"
-- ----------------------------------------------------------------------------
SELECT scope_kind, scope_id, score, confidence, confidence_band,
       components
FROM public.opportunity_scores
WHERE project_id = :project_id AND confidence < 0.4
ORDER BY confidence ASC
LIMIT 20;

-- ----------------------------------------------------------------------------
-- J. DecisionContext — coverage & freshness.
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE jsonb_array_length(evidence) = 0) AS zero_evidence,
  ROUND(AVG(jsonb_array_length(evidence))::numeric, 2) AS mean_evidence,
  COUNT(*) FILTER (WHERE confidence->>'band' = 'high') AS high_conf,
  COUNT(*) FILTER (WHERE confidence->>'band' = 'medium') AS medium_conf,
  COUNT(*) FILTER (WHERE confidence->>'band' = 'low') AS low_conf,
  COUNT(*) FILTER (WHERE confidence->>'narrative_status' = 'generated') AS narrative_generated,
  COUNT(*) FILTER (WHERE confidence->>'narrative_status' = 'failed') AS narrative_failed,
  COUNT(*) FILTER (WHERE confidence->>'narrative_status' = 'skipped') AS narrative_skipped
FROM public.decision_context
WHERE project_id = :project_id;

-- ----------------------------------------------------------------------------
-- K. Gate-trigger frequency in DecisionContext.
-- ----------------------------------------------------------------------------
SELECT trigger_code, COUNT(*) AS n
FROM public.decision_context dc,
     jsonb_array_elements_text(dc.confidence->'gate_triggers') AS trigger_code
WHERE dc.project_id = :project_id
GROUP BY trigger_code
ORDER BY n DESC;

-- ----------------------------------------------------------------------------
-- L. Action items missing a DecisionContext row.
-- Ask: "Are these legitimately context-less or did the worker fail?"
-- ----------------------------------------------------------------------------
SELECT ai.id, ai.title, ai.category, ai.created_at
FROM public.action_items ai
LEFT JOIN public.decision_context dc ON dc.action_item_id = ai.id
WHERE ai.project_id = :project_id AND dc.id IS NULL
ORDER BY ai.created_at DESC
LIMIT 20;

-- ----------------------------------------------------------------------------
-- M. DecisionContexts with zero evidence — should be near-zero.
-- ----------------------------------------------------------------------------
SELECT id, action_item_id, ads_change_proposal_id, scope->>'kind' AS scope_kind,
       confidence->>'band' AS confidence_band, confidence->'gate_triggers' AS gates
FROM public.decision_context
WHERE project_id = :project_id AND jsonb_array_length(evidence) = 0
LIMIT 20;

-- ----------------------------------------------------------------------------
-- N. Per-source DC evidence coverage (% of DCs that have ≥1 evidence per source).
-- ----------------------------------------------------------------------------
WITH evidence_by_dc AS (
  SELECT dc.id,
         array_agg(DISTINCT (e->>'source')) AS sources
  FROM public.decision_context dc
       LEFT JOIN LATERAL jsonb_array_elements(dc.evidence) e ON true
  WHERE dc.project_id = :project_id
  GROUP BY dc.id
)
SELECT
  COUNT(*) FILTER (WHERE 'gsc'        = ANY(sources))::float / NULLIF(COUNT(*),0) AS gsc_coverage,
  COUNT(*) FILTER (WHERE 'ga4'        = ANY(sources))::float / NULLIF(COUNT(*),0) AS ga4_coverage,
  COUNT(*) FILTER (WHERE 'google_ads' = ANY(sources))::float / NULLIF(COUNT(*),0) AS ads_coverage,
  COUNT(*) FILTER (WHERE 'operator'   = ANY(sources))::float / NULLIF(COUNT(*),0) AS operator_coverage,
  COUNT(*) FILTER (WHERE 'model'      = ANY(sources))::float / NULLIF(COUNT(*),0) AS model_coverage,
  COUNT(*) FILTER (WHERE 'ads_mutation' = ANY(sources))::float / NULLIF(COUNT(*),0) AS ads_mutation_coverage,
  COUNT(*) FILTER (WHERE 'outcome_learning' = ANY(sources))::float / NULLIF(COUNT(*),0) AS outcome_coverage
FROM evidence_by_dc;

-- ----------------------------------------------------------------------------
-- O. Verdict — intent/buyer-stage distribution.
-- Ask: "Does the mix match what an SEO/PPC operator would expect?"
-- ----------------------------------------------------------------------------
SELECT search_intent, buyer_stage, lead_quality_proxy, COUNT(*) AS n,
       ROUND(AVG(commercial_intent_score)::numeric, 2) AS mean_intent,
       ROUND(AVG(confidence)::numeric, 2) AS mean_confidence
FROM public.commercial_intent_labels
WHERE project_id = :project_id
GROUP BY 1, 2, 3
ORDER BY n DESC;

-- ----------------------------------------------------------------------------
-- P. Top 20 verdicts by commercial_intent_score.
-- ----------------------------------------------------------------------------
SELECT keyword, search_intent, buyer_stage, commercial_intent_score,
       conversion_likelihood, serp_competitiveness, lead_quality_proxy,
       suggested_acquisition_approach, confidence,
       estimated_commercial_value->>'p50' AS p50_value_sek
FROM public.commercial_intent_labels
WHERE project_id = :project_id
ORDER BY commercial_intent_score DESC NULLS LAST
LIMIT 20;

-- ----------------------------------------------------------------------------
-- Q. Verdicts with empty evidence.
-- Ask: "Why has the system labelled these without supporting signal?"
-- ----------------------------------------------------------------------------
SELECT keyword, search_intent, buyer_stage, commercial_intent_score, confidence
FROM public.commercial_intent_labels
WHERE project_id = :project_id
  AND (evidence IS NULL OR jsonb_array_length(evidence) = 0)
LIMIT 20;

-- ----------------------------------------------------------------------------
-- R. Shadow-run timing trend (last 10 runs).
-- ----------------------------------------------------------------------------
SELECT created_at, run_label,
       (timings->>'fetch_ms')::int AS fetch_ms,
       (timings->>'aggregate_ms')::int AS aggregate_ms,
       (timings->>'total_ms')::int AS total_ms,
       jsonb_array_length(errors) AS error_count
FROM public.shadow_run_results
WHERE project_id = :project_id
ORDER BY created_at DESC
LIMIT 10;
