ALTER TABLE public.ads_change_proposals
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

UPDATE public.ads_change_proposals
SET dedupe_key = project_id::text || '::' || COALESCE(rule_id, 'manual') || '::' || COALESCE(scope_label, '') || '::' || action_type
WHERE dedupe_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ads_change_proposals_active_dedupe
  ON public.ads_change_proposals (project_id, dedupe_key)
  WHERE status IN ('draft','approved','queued');