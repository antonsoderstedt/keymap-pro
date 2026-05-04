-- 1. workspace_type på projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS workspace_type text NOT NULL DEFAULT 'b2b_manufacturer';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_workspace_type_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_workspace_type_check
  CHECK (workspace_type IN ('b2b_manufacturer','d2c_brand','local_service','b2b_service','ecommerce'));

-- 2. project_goals
CREATE TABLE IF NOT EXISTS public.project_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  conversion_type text NOT NULL DEFAULT 'purchase'
    CHECK (conversion_type IN ('purchase','lead','booking','trial','store_visit')),
  conversion_label text,
  conversion_value numeric NOT NULL DEFAULT 1000,
  conversion_rate_pct numeric NOT NULL DEFAULT 2,
  primary_goal text NOT NULL DEFAULT 'acquisition'
    CHECK (primary_goal IN ('acquisition','retention','awareness')),
  strategy_split jsonb NOT NULL DEFAULT '{"acquisition":70,"retention":20,"awareness":10}'::jsonb,
  brand_terms text[] NOT NULL DEFAULT '{}'::text[],
  currency text NOT NULL DEFAULT 'SEK',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view project goals" ON public.project_goals;
CREATE POLICY "Owners view project goals" ON public.project_goals FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_goals.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners insert project goals" ON public.project_goals;
CREATE POLICY "Owners insert project goals" ON public.project_goals FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_goals.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners update project goals" ON public.project_goals;
CREATE POLICY "Owners update project goals" ON public.project_goals FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_goals.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners delete project goals" ON public.project_goals;
CREATE POLICY "Owners delete project goals" ON public.project_goals FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_goals.project_id AND p.user_id = auth.uid()));

DROP TRIGGER IF EXISTS touch_project_goals ON public.project_goals;
CREATE TRIGGER touch_project_goals BEFORE UPDATE ON public.project_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. project_baselines
CREATE TABLE IF NOT EXISTS public.project_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  is_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_baselines_project_idx ON public.project_baselines(project_id, snapshot_date DESC);
ALTER TABLE public.project_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view baselines" ON public.project_baselines;
CREATE POLICY "Owners view baselines" ON public.project_baselines FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_baselines.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners insert baselines" ON public.project_baselines;
CREATE POLICY "Owners insert baselines" ON public.project_baselines FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_baselines.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners delete baselines" ON public.project_baselines;
CREATE POLICY "Owners delete baselines" ON public.project_baselines FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_baselines.project_id AND p.user_id = auth.uid()));

-- 4. strategy_quadrant på keyword_metrics
ALTER TABLE public.keyword_metrics ADD COLUMN IF NOT EXISTS strategy_quadrant text DEFAULT 'acquire_nonbrand';
ALTER TABLE public.keyword_metrics DROP CONSTRAINT IF EXISTS keyword_metrics_strategy_quadrant_check;
ALTER TABLE public.keyword_metrics ADD CONSTRAINT keyword_metrics_strategy_quadrant_check
  CHECK (strategy_quadrant IN ('acquire_nonbrand','acquire_brand','retain_nonbrand','retain_brand'));

-- 5. fact_check på prelaunch_briefs
ALTER TABLE public.prelaunch_briefs ADD COLUMN IF NOT EXISTS fact_check jsonb;

-- 6. selected_keywords + ads_plan på prelaunch_blueprints
ALTER TABLE public.prelaunch_blueprints ADD COLUMN IF NOT EXISTS selected_keywords jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.prelaunch_blueprints ADD COLUMN IF NOT EXISTS ads_plan jsonb;