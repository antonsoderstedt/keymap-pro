-- Cache för account snapshots (TTL 1h logiskt, hard delete efter 24h)
CREATE TABLE public.ads_diagnostics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  hour_bucket text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, hour_bucket)
);
CREATE INDEX idx_diag_cache_lookup ON public.ads_diagnostics_cache(project_id, hour_bucket);
ALTER TABLE public.ads_diagnostics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view diag cache" ON public.ads_diagnostics_cache FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Auto-clean old cache" ON public.ads_diagnostics_cache FOR DELETE
  USING (created_at < now() - interval '24 hours');

-- Körningslogg
CREATE TABLE public.ads_diagnostics_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  scope jsonb,
  rules_evaluated int NOT NULL DEFAULT 0,
  rules_fired int NOT NULL DEFAULT 0,
  cache_hit boolean NOT NULL DEFAULT false,
  duration_ms int,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_diag_runs_project ON public.ads_diagnostics_runs(project_id, created_at DESC);
ALTER TABLE public.ads_diagnostics_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view diag runs" ON public.ads_diagnostics_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- Outcome tracking
CREATE TABLE public.ads_recommendation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  campaign_id text,
  diagnosis_id text,
  fired_at timestamptz NOT NULL,
  applied_at timestamptz,
  mutation_id uuid REFERENCES public.ads_mutations(id) ON DELETE SET NULL,
  predicted jsonb NOT NULL,
  measured_14d jsonb,
  measured_30d jsonb,
  reverted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outcomes_rule ON public.ads_recommendation_outcomes(rule_id, fired_at DESC);
CREATE INDEX idx_outcomes_project ON public.ads_recommendation_outcomes(project_id, fired_at DESC);
ALTER TABLE public.ads_recommendation_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view outcomes" ON public.ads_recommendation_outcomes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));