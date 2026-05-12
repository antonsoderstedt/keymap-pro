
-- ads_account_tree_cache: cache live Google Ads account snapshots for 15 min
CREATE TABLE public.ads_account_tree_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  customer_id text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  tree jsonb NOT NULL,
  ttl_seconds integer NOT NULL DEFAULT 900,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ads_account_tree_cache_project ON public.ads_account_tree_cache(project_id, fetched_at DESC);
ALTER TABLE public.ads_account_tree_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view account tree cache" ON public.ads_account_tree_cache
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert account tree cache" ON public.ads_account_tree_cache
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete account tree cache" ON public.ads_account_tree_cache
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- ads_change_proposals: queue of suggested changes awaiting approval/push
CREATE TABLE public.ads_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  analysis_id uuid,
  source text NOT NULL CHECK (source IN ('diagnosis','ai_generation','manual','cluster_expansion','wasted_spend','negative_mining')),
  action_type text NOT NULL,
  scope_label text,
  payload jsonb NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_impact_sek numeric,
  baseline_metrics jsonb,
  rationale text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_id text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','pushed','rejected','failed')),
  push_as_paused boolean NOT NULL DEFAULT true,
  mutation_id uuid,
  outcome_id uuid,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  pushed_at timestamptz,
  rejected_at timestamptz
);
CREATE INDEX idx_ads_proposals_project_status ON public.ads_change_proposals(project_id, status, created_at DESC);
CREATE INDEX idx_ads_proposals_rule ON public.ads_change_proposals(rule_id);
ALTER TABLE public.ads_change_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view proposals" ON public.ads_change_proposals
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert proposals" ON public.ads_change_proposals
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update proposals" ON public.ads_change_proposals
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete proposals" ON public.ads_change_proposals
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_proposals_touch BEFORE UPDATE ON public.ads_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Link outcomes back to proposals
ALTER TABLE public.ads_recommendation_outcomes
  ADD COLUMN IF NOT EXISTS proposal_id uuid;
CREATE INDEX IF NOT EXISTS idx_ads_recoutcomes_proposal ON public.ads_recommendation_outcomes(proposal_id);

-- Allow inserts to ads_recommendation_outcomes from project owners (was missing)
CREATE POLICY "Owners insert outcomes" ON public.ads_recommendation_outcomes
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update outcomes" ON public.ads_recommendation_outcomes
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_change_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_recommendation_outcomes;
