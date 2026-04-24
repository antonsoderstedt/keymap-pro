-- Content briefs (one per cluster)
CREATE TABLE IF NOT EXISTS public.content_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL,
  cluster text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, cluster)
);

ALTER TABLE public.content_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view briefs of own projects" ON public.content_briefs FOR SELECT
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = content_briefs.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert briefs for own projects" ON public.content_briefs FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = content_briefs.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update briefs of own projects" ON public.content_briefs FOR UPDATE
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = content_briefs.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete briefs of own projects" ON public.content_briefs FOR DELETE
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = content_briefs.analysis_id AND p.user_id = auth.uid()));

-- Site audit (one per analysis)
CREATE TABLE IF NOT EXISTS public.site_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL UNIQUE,
  domain text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audits of own projects" ON public.site_audits FOR SELECT
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = site_audits.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert audits for own projects" ON public.site_audits FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = site_audits.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update audits of own projects" ON public.site_audits FOR UPDATE
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = site_audits.analysis_id AND p.user_id = auth.uid()));

-- Backlink gap (one per analysis)
CREATE TABLE IF NOT EXISTS public.backlink_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL UNIQUE,
  domain text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backlink_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view backlinks of own projects" ON public.backlink_gaps FOR SELECT
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = backlink_gaps.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert backlinks for own projects" ON public.backlink_gaps FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = backlink_gaps.analysis_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update backlinks of own projects" ON public.backlink_gaps FOR UPDATE
USING (EXISTS (SELECT 1 FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = backlink_gaps.analysis_id AND p.user_id = auth.uid()));

-- Trigger to bump updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_content_briefs_updated ON public.content_briefs;
CREATE TRIGGER trg_content_briefs_updated BEFORE UPDATE ON public.content_briefs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_site_audits_updated ON public.site_audits;
CREATE TRIGGER trg_site_audits_updated BEFORE UPDATE ON public.site_audits
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_backlink_gaps_updated ON public.backlink_gaps;
CREATE TRIGGER trg_backlink_gaps_updated BEFORE UPDATE ON public.backlink_gaps
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();