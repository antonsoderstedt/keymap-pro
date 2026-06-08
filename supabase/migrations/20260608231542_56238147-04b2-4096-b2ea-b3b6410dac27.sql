CREATE TABLE IF NOT EXISTS public.keyword_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  status text NOT NULL DEFAULT 'suggested',
  ads_campaign text,
  ads_adgroup text,
  ads_match_type text,
  ads_status text,
  ads_spend_30d numeric,
  ads_conversions_30d numeric,
  ads_is_negative boolean NOT NULL DEFAULT false,
  ads_negative_level text,
  gsc_position numeric,
  gsc_clicks_30d integer,
  gsc_impressions_30d integer,
  kundfit numeric,
  volume integer,
  cpc numeric,
  kd integer,
  dimension text,
  intent_class text,
  conflict_flag boolean NOT NULL DEFAULT false,
  notes text,
  added_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_keyword_master_project_status ON public.keyword_master(project_id, status);
CREATE INDEX IF NOT EXISTS idx_keyword_master_project_conflict ON public.keyword_master(project_id, conflict_flag);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyword_master TO authenticated;
GRANT ALL ON public.keyword_master TO service_role;

ALTER TABLE public.keyword_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view keyword master"
  ON public.keyword_master FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Owners insert keyword master"
  ON public.keyword_master FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners update keyword master"
  ON public.keyword_master FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners delete keyword master"
  ON public.keyword_master FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_keyword_master_touch_updated_at
  BEFORE UPDATE ON public.keyword_master
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();