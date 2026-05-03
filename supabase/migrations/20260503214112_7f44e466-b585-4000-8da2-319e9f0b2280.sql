CREATE TABLE public.ads_audits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  health_score integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ads_audits_project ON public.ads_audits(project_id, created_at DESC);

ALTER TABLE public.ads_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view ads audits"
  ON public.ads_audits FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ads_audits.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can insert ads audits"
  ON public.ads_audits FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ads_audits.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can delete ads audits"
  ON public.ads_audits FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ads_audits.project_id AND p.user_id = auth.uid()));