CREATE TABLE public.ads_mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id TEXT,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB,
  revert_payload JSONB,
  source_action_item_id UUID,
  error_message TEXT,
  reverted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ads_mutations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view ads mutations" ON public.ads_mutations FOR SELECT
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = ads_mutations.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can insert ads mutations" ON public.ads_mutations FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = ads_mutations.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Owners can update ads mutations" ON public.ads_mutations FOR UPDATE
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = ads_mutations.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER ads_mutations_touch BEFORE UPDATE ON public.ads_mutations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_ads_mutations_project ON public.ads_mutations(project_id, created_at DESC);