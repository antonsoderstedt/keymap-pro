
-- Sprint 3: add notes to action_items
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sprint 5: GA4 filters per project
CREATE TABLE IF NOT EXISTS public.ga4_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  label TEXT NOT NULL,
  dimension TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'CONTAINS',
  value TEXT NOT NULL,
  exclude BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ga4_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ga4 filters" ON public.ga4_filters FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = ga4_filters.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own ga4 filters" ON public.ga4_filters FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = ga4_filters.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own ga4 filters" ON public.ga4_filters FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = ga4_filters.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own ga4 filters" ON public.ga4_filters FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = ga4_filters.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER ga4_filters_touch
  BEFORE UPDATE ON public.ga4_filters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
