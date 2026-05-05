-- Cache för SEO-snapshots (TTL 6h via cache_key)
CREATE TABLE public.seo_diagnostics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, cache_key)
);
CREATE INDEX idx_seo_diag_cache ON public.seo_diagnostics_cache(project_id, cache_key);
ALTER TABLE public.seo_diagnostics_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view seo cache" ON public.seo_diagnostics_cache FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Service inserts seo cache" ON public.seo_diagnostics_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service updates seo cache" ON public.seo_diagnostics_cache FOR UPDATE USING (true);

-- Körningslogg
CREATE TABLE public.seo_diagnostics_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE CASCADE,
  rules_evaluated int NOT NULL DEFAULT 0,
  rules_fired int NOT NULL DEFAULT 0,
  cache_hit boolean NOT NULL DEFAULT false,
  duration_ms int,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_diag_runs ON public.seo_diagnostics_runs(project_id, created_at DESC);
ALTER TABLE public.seo_diagnostics_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view seo runs" ON public.seo_diagnostics_runs FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Service inserts seo runs" ON public.seo_diagnostics_runs FOR INSERT WITH CHECK (true);

-- Outcome tracking (+14d, +30d, +90d)
CREATE TABLE public.seo_recommendation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  diagnosis_id text NOT NULL,
  fired_at timestamptz NOT NULL,
  applied_at timestamptz,
  action_item_id uuid REFERENCES public.action_items(id) ON DELETE SET NULL,
  predicted jsonb NOT NULL,
  measured_14d jsonb,
  measured_30d jsonb,
  measured_90d jsonb,
  reverted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_outcomes_rule ON public.seo_recommendation_outcomes(rule_id, fired_at DESC);
CREATE INDEX idx_seo_outcomes_project ON public.seo_recommendation_outcomes(project_id, fired_at DESC);
ALTER TABLE public.seo_recommendation_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view seo outcomes" ON public.seo_recommendation_outcomes FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Service writes seo outcomes" ON public.seo_recommendation_outcomes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service updates seo outcomes" ON public.seo_recommendation_outcomes FOR UPDATE USING (true);