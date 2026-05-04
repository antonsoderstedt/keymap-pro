ALTER TABLE public.project_google_settings
  ADD COLUMN IF NOT EXISTS ads_script_secret text;

ALTER TABLE public.auction_insights_snapshots
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

CREATE INDEX IF NOT EXISTS idx_auction_insights_project_source_created
  ON public.auction_insights_snapshots (project_id, source, created_at DESC);