
-- Semrush cache
CREATE TABLE public.semrush_metrics (
  keyword text NOT NULL,
  location_code integer NOT NULL DEFAULT 2752,
  kd numeric,
  serp_features jsonb,
  top_domains jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword, location_code)
);
ALTER TABLE public.semrush_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read semrush metrics"
  ON public.semrush_metrics FOR SELECT TO authenticated USING (true);

-- Ad drafts
CREATE TABLE public.ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL,
  ad_group text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ad drafts of own projects"
  ON public.ad_drafts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                 WHERE a.id = ad_drafts.analysis_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can insert ad drafts for own projects"
  ON public.ad_drafts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                      WHERE a.id = ad_drafts.analysis_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can update ad drafts of own projects"
  ON public.ad_drafts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                 WHERE a.id = ad_drafts.analysis_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can delete ad drafts of own projects"
  ON public.ad_drafts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                 WHERE a.id = ad_drafts.analysis_id AND p.user_id = auth.uid()));
CREATE INDEX idx_ad_drafts_analysis ON public.ad_drafts(analysis_id);

-- Strategy drafts
CREATE TABLE public.strategy_drafts (
  analysis_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strategy_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view strategy of own projects"
  ON public.strategy_drafts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                 WHERE a.id = strategy_drafts.analysis_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can insert strategy for own projects"
  ON public.strategy_drafts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                      WHERE a.id = strategy_drafts.analysis_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can update strategy of own projects"
  ON public.strategy_drafts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.analyses a JOIN public.projects p ON p.id = a.project_id
                 WHERE a.id = strategy_drafts.analysis_id AND p.user_id = auth.uid()));
