CREATE TABLE public.channel_attribution_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency TEXT NOT NULL DEFAULT 'SEK',
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_attribution_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own attribution snapshots" ON public.channel_attribution_snapshots
  FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = channel_attribution_snapshots.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users insert own attribution snapshots" ON public.channel_attribution_snapshots
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = channel_attribution_snapshots.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users delete own attribution snapshots" ON public.channel_attribution_snapshots
  FOR DELETE USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = channel_attribution_snapshots.project_id AND p.user_id = auth.uid()));

CREATE INDEX idx_attribution_project_period ON public.channel_attribution_snapshots(project_id, end_date DESC);