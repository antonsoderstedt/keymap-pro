-- Brand Kits (one per workspace)
CREATE TABLE public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  logo_url text,
  logo_dark_url text,
  icon_url text,
  palette jsonb NOT NULL DEFAULT '{
    "primary": "#1E2761",
    "secondary": "#CADCFC",
    "accent": "#F96167",
    "success": "#10B981",
    "warning": "#F59E0B",
    "neutral_bg": "#FFFFFF",
    "neutral_fg": "#0F172A"
  }'::jsonb,
  fonts jsonb NOT NULL DEFAULT '{
    "heading": "Inter",
    "body": "Inter",
    "heading_url": null,
    "body_url": null
  }'::jsonb,
  tone text NOT NULL DEFAULT 'professional',
  voice_guidelines text,
  image_style text,
  layout_template text NOT NULL DEFAULT 'modern',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view brand kits of own projects"
  ON public.brand_kits FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = brand_kits.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert brand kits for own projects"
  ON public.brand_kits FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = brand_kits.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update brand kits of own projects"
  ON public.brand_kits FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = brand_kits.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete brand kits of own projects"
  ON public.brand_kits FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = brand_kits.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_brand_kits_updated
  BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- KPI Targets
CREATE TABLE public.kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  metric text NOT NULL,
  label text NOT NULL,
  target_value numeric NOT NULL,
  direction text NOT NULL DEFAULT 'increase',
  timeframe text NOT NULL DEFAULT 'month',
  channel text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view KPI targets of own projects"
  ON public.kpi_targets FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = kpi_targets.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert KPI targets for own projects"
  ON public.kpi_targets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = kpi_targets.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update KPI targets of own projects"
  ON public.kpi_targets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = kpi_targets.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete KPI targets of own projects"
  ON public.kpi_targets FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = kpi_targets.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_kpi_targets_updated
  BEFORE UPDATE ON public.kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_kpi_targets_project ON public.kpi_targets(project_id);

-- Storage bucket for brand assets (logos, fonts)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Brand assets are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');

CREATE POLICY "Authenticated users can upload brand assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own brand assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own brand assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);