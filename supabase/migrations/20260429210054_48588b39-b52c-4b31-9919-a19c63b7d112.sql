-- 1. Revenue settings per project
CREATE TABLE public.project_revenue_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE,
  avg_order_value NUMERIC NOT NULL DEFAULT 1000,
  conversion_rate_pct NUMERIC NOT NULL DEFAULT 2.0,
  gross_margin_pct NUMERIC NOT NULL DEFAULT 100,
  currency TEXT NOT NULL DEFAULT 'SEK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_revenue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view revenue settings" ON public.project_revenue_settings
FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners insert revenue settings" ON public.project_revenue_settings
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners update revenue settings" ON public.project_revenue_settings
FOR UPDATE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners delete revenue settings" ON public.project_revenue_settings
FOR DELETE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER touch_project_revenue_settings
BEFORE UPDATE ON public.project_revenue_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill defaults for existing projects
INSERT INTO public.project_revenue_settings (project_id)
SELECT id FROM public.projects
ON CONFLICT (project_id) DO NOTHING;

-- 2. Weekly strategic briefings
CREATE TABLE public.weekly_briefings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  week_start DATE NOT NULL,
  summary_md TEXT,
  wins JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_value_at_stake_sek NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, week_start)
);

CREATE INDEX idx_weekly_briefings_project_week ON public.weekly_briefings (project_id, week_start DESC);

ALTER TABLE public.weekly_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view briefings" ON public.weekly_briefings
FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners insert briefings" ON public.weekly_briefings
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners update briefings" ON public.weekly_briefings
FOR UPDATE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners delete briefings" ON public.weekly_briefings
FOR DELETE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- 3. Optional column on action_items for crown-value tracking (only add if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='action_items' AND column_name='expected_impact_sek') THEN
    ALTER TABLE public.action_items ADD COLUMN expected_impact_sek NUMERIC;
  END IF;
END $$;