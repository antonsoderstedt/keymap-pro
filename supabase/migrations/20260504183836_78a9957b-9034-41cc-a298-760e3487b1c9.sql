CREATE TABLE public.ga4_conversion_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'allow', -- 'allow' or 'deny'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, event_name)
);

ALTER TABLE public.ga4_conversion_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own conv filters" ON public.ga4_conversion_filters
FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users insert own conv filters" ON public.ga4_conversion_filters
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users update own conv filters" ON public.ga4_conversion_filters
FOR UPDATE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users delete own conv filters" ON public.ga4_conversion_filters
FOR DELETE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER touch_ga4_conv_filters
BEFORE UPDATE ON public.ga4_conversion_filters
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();