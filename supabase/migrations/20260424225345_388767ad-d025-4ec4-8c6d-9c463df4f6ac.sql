ALTER TABLE public.project_google_settings
  ADD COLUMN IF NOT EXISTS ads_customer_id text,
  ADD COLUMN IF NOT EXISTS ads_customer_name text;