-- -----------------------------------------------------------------------------
-- Step 6 — Shadow-mode calibration audit table.
--
-- The `commercial-intelligence-shadow-run` edge function is strictly
-- observational. It reads existing intelligence tables (commercial_intent_labels,
-- opportunity_scores, decision_context) and writes a single aggregated
-- calibration row here. Nothing else is mutated by the harness.
--
-- This table exists so calibration runs are:
--   - reproducible (snapshot of distributions at a point in time)
--   - auditable (operator can compare runs across days/projects)
--   - non-destructive (no recomputation, no scoring changes)
-- -----------------------------------------------------------------------------

CREATE TABLE public.shadow_run_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL,
  run_id          uuid NOT NULL DEFAULT gen_random_uuid(), -- groups related runs
  run_label       text,                                    -- optional operator tag
  model_version   text NOT NULL,
  signals_version text NOT NULL,
  parameters      jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { top_n, sample_n, ... }
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- distributions, frequencies, coverage
  samples         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { top_scores, bottom_scores, sample_contexts, ... }
  timings         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- ms per stage
  errors          jsonb NOT NULL DEFAULT '[]'::jsonb,      -- non-fatal collection errors
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shadow_run_results_project
  ON public.shadow_run_results(project_id, created_at DESC);

CREATE INDEX idx_shadow_run_results_run
  ON public.shadow_run_results(run_id);

ALTER TABLE public.shadow_run_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view shadow runs" ON public.shadow_run_results
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Owners insert shadow runs" ON public.shadow_run_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Owners delete shadow runs" ON public.shadow_run_results
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

-- Intentionally no UPDATE policy: shadow runs are immutable snapshots.
COMMENT ON TABLE public.shadow_run_results IS
  'Aggregated, immutable calibration snapshots emitted by commercial-intelligence-shadow-run. Read-only against intelligence tables; no scoring changes.';
