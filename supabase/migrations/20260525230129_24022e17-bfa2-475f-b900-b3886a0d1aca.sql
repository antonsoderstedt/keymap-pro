ALTER TABLE public.ads_change_proposals
  ADD COLUMN IF NOT EXISTS auto_revert_policy JSONB;

ALTER TABLE public.ads_recommendation_outcomes
  ADD COLUMN IF NOT EXISTS measured_7d JSONB,
  ADD COLUMN IF NOT EXISTS auto_reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_revert_reason TEXT;

ALTER TABLE public.ads_mutations
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.ads_change_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ads_mutations_proposal_id ON public.ads_mutations(proposal_id);