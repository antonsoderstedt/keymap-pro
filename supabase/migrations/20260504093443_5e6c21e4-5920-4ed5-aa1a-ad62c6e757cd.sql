CREATE TABLE public.share_of_voice_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  your_domain TEXT,
  your_impressions BIGINT NOT NULL DEFAULT 0,
  your_clicks BIGINT NOT NULL DEFAULT 0,
  total_market_impressions BIGINT NOT NULL DEFAULT 0,
  sov_pct NUMERIC NOT NULL DEFAULT 0,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.share_of_voice_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own SoV snapshots" ON public.share_of_voice_snapshots
  FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = share_of_voice_snapshots.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users insert own SoV snapshots" ON public.share_of_voice_snapshots
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = share_of_voice_snapshots.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users delete own SoV snapshots" ON public.share_of_voice_snapshots
  FOR DELETE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = share_of_voice_snapshots.project_id AND p.user_id = auth.uid()));

CREATE INDEX idx_sov_project_created ON public.share_of_voice_snapshots(project_id, created_at DESC);