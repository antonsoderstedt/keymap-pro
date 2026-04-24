-- Per-project Google settings (which GSC site + GA4 property to use)
CREATE TABLE public.project_google_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE,
  gsc_site_url TEXT,
  ga4_property_id TEXT,
  ga4_property_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_google_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view google settings"
ON public.project_google_settings FOR SELECT
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can insert google settings"
ON public.project_google_settings FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can update google settings"
ON public.project_google_settings FOR UPDATE
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can delete google settings"
ON public.project_google_settings FOR DELETE
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_project_google_settings_updated_at
BEFORE UPDATE ON public.project_google_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- GSC snapshots
CREATE TABLE public.gsc_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  site_url TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_gsc_snapshots_project ON public.gsc_snapshots(project_id, created_at DESC);

ALTER TABLE public.gsc_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view gsc snapshots"
ON public.gsc_snapshots FOR SELECT
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can insert gsc snapshots"
ON public.gsc_snapshots FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can delete gsc snapshots"
ON public.gsc_snapshots FOR DELETE
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- GA4 snapshots
CREATE TABLE public.ga4_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  property_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ga4_snapshots_project ON public.ga4_snapshots(project_id, created_at DESC);

ALTER TABLE public.ga4_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view ga4 snapshots"
ON public.ga4_snapshots FOR SELECT
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can insert ga4 snapshots"
ON public.ga4_snapshots FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can delete ga4 snapshots"
ON public.ga4_snapshots FOR DELETE
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));