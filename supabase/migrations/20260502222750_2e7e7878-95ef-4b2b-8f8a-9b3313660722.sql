CREATE TABLE public.prelaunch_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  business_idea text,
  target_audience text,
  usp text,
  competitors text[] NOT NULL DEFAULT '{}',
  locations text[] NOT NULL DEFAULT '{}',
  existing_sitemap jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.prelaunch_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.prelaunch_briefs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  market_analysis jsonb,
  strategy jsonb,
  keyword_universe jsonb,
  sitemap jsonb,
  personas jsonb,
  forecast jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prelaunch_briefs_project ON public.prelaunch_briefs(project_id);
CREATE INDEX idx_prelaunch_blueprints_brief ON public.prelaunch_blueprints(brief_id);
CREATE INDEX idx_prelaunch_blueprints_project ON public.prelaunch_blueprints(project_id);

ALTER TABLE public.prelaunch_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prelaunch_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own prelaunch briefs" ON public.prelaunch_briefs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_briefs.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own prelaunch briefs" ON public.prelaunch_briefs FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_briefs.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own prelaunch briefs" ON public.prelaunch_briefs FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_briefs.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own prelaunch briefs" ON public.prelaunch_briefs FOR DELETE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_briefs.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users view own prelaunch blueprints" ON public.prelaunch_blueprints FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_blueprints.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own prelaunch blueprints" ON public.prelaunch_blueprints FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_blueprints.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own prelaunch blueprints" ON public.prelaunch_blueprints FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_blueprints.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own prelaunch blueprints" ON public.prelaunch_blueprints FOR DELETE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = prelaunch_blueprints.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER prelaunch_briefs_touch BEFORE UPDATE ON public.prelaunch_briefs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER prelaunch_blueprints_touch BEFORE UPDATE ON public.prelaunch_blueprints
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();