CREATE EXTENSION IF NOT EXISTS vector;

-- 1. keyword_embeddings
CREATE TABLE public.keyword_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, normalized_keyword, model_version)
);
CREATE INDEX idx_keyword_embeddings_project ON public.keyword_embeddings(project_id);
CREATE INDEX idx_keyword_embeddings_hash ON public.keyword_embeddings(content_hash);
CREATE INDEX idx_keyword_embeddings_hnsw ON public.keyword_embeddings USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.keyword_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view keyword embeddings" ON public.keyword_embeddings FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert keyword embeddings" ON public.keyword_embeddings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update keyword embeddings" ON public.keyword_embeddings FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete keyword embeddings" ON public.keyword_embeddings FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_keyword_embeddings_touch BEFORE UPDATE ON public.keyword_embeddings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. landing_page_embeddings
CREATE TABLE public.landing_page_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  url text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  title text,
  meta_description text,
  word_count integer,
  model_version text NOT NULL,
  last_crawled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, url, model_version)
);
CREATE INDEX idx_lp_embeddings_project ON public.landing_page_embeddings(project_id);
CREATE INDEX idx_lp_embeddings_hash ON public.landing_page_embeddings(content_hash);
CREATE INDEX idx_lp_embeddings_hnsw ON public.landing_page_embeddings USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.landing_page_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view lp embeddings" ON public.landing_page_embeddings FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert lp embeddings" ON public.landing_page_embeddings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update lp embeddings" ON public.landing_page_embeddings FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete lp embeddings" ON public.landing_page_embeddings FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_lp_embeddings_touch BEFORE UPDATE ON public.landing_page_embeddings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. opportunity_clusters
CREATE TABLE public.opportunity_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  label text NOT NULL,
  intent_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  buyer_stage_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_relevance numeric,
  commercial_value_band text CHECK (commercial_value_band IN ('low','medium','high','critical')),
  evidence_hash text,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, label, model_version)
);
CREATE INDEX idx_opportunity_clusters_project ON public.opportunity_clusters(project_id);
ALTER TABLE public.opportunity_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view opportunity clusters" ON public.opportunity_clusters FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert opportunity clusters" ON public.opportunity_clusters FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update opportunity clusters" ON public.opportunity_clusters FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete opportunity clusters" ON public.opportunity_clusters FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_opportunity_clusters_touch BEFORE UPDATE ON public.opportunity_clusters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. commercial_intent_labels
CREATE TABLE public.commercial_intent_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  cluster_id uuid REFERENCES public.opportunity_clusters(id) ON DELETE SET NULL,
  search_intent text NOT NULL CHECK (search_intent IN ('informational','commercial','transactional','navigational')),
  buyer_stage text NOT NULL CHECK (buyer_stage IN ('unaware','problem_aware','solution_aware','product_aware','ready_to_buy')),
  commercial_intent_score numeric NOT NULL,
  business_relevance_score numeric NOT NULL,
  conversion_likelihood numeric NOT NULL,
  serp_competitiveness numeric NOT NULL,
  commoditization_score numeric NOT NULL,
  lead_quality_proxy text NOT NULL CHECK (lead_quality_proxy IN ('low','medium','high')),
  suggested_acquisition_approach text NOT NULL,
  estimated_commercial_value jsonb NOT NULL,
  confidence numeric NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, normalized_keyword, model_version)
);
CREATE INDEX idx_intent_labels_project ON public.commercial_intent_labels(project_id);
CREATE INDEX idx_intent_labels_cluster ON public.commercial_intent_labels(cluster_id);
CREATE INDEX idx_intent_labels_intent ON public.commercial_intent_labels(project_id, search_intent, buyer_stage);
ALTER TABLE public.commercial_intent_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view intent labels" ON public.commercial_intent_labels FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert intent labels" ON public.commercial_intent_labels FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update intent labels" ON public.commercial_intent_labels FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete intent labels" ON public.commercial_intent_labels FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- 5. opportunity_scores
CREATE TABLE public.opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('keyword','cluster','opportunity')),
  scope_id text NOT NULL,
  score numeric NOT NULL,
  score_band text NOT NULL CHECK (score_band IN ('veto','low','medium','high','critical')),
  confidence numeric NOT NULL,
  confidence_band text NOT NULL CHECK (confidence_band IN ('low','medium','high')),
  components jsonb NOT NULL,
  weights_applied jsonb NOT NULL,
  multipliers_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  vetoes_triggered text[] NOT NULL DEFAULT ARRAY[]::text[],
  contribution_trace jsonb NOT NULL,
  freshness jsonb NOT NULL DEFAULT '{}'::jsonb,
  learning_adjustment jsonb,
  expected_impact jsonb,
  risk jsonb,
  workspace_profile text NOT NULL,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scope_kind, scope_id, model_version)
);
CREATE INDEX idx_opportunity_scores_project ON public.opportunity_scores(project_id);
CREATE INDEX idx_opportunity_scores_band ON public.opportunity_scores(project_id, score_band, score DESC);
CREATE INDEX idx_opportunity_scores_scope ON public.opportunity_scores(project_id, scope_kind, scope_id);
ALTER TABLE public.opportunity_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view opportunity scores" ON public.opportunity_scores FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert opportunity scores" ON public.opportunity_scores FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update opportunity scores" ON public.opportunity_scores FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete opportunity scores" ON public.opportunity_scores FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- 6. project_business_model
CREATE TABLE public.project_business_model (
  project_id uuid PRIMARY KEY,
  workspace_profile text NOT NULL DEFAULT 'b2b_service' CHECK (workspace_profile IN ('b2b_service','b2b_industrial','b2c_ecom','local_service','saas')),
  aggressiveness_profile text NOT NULL DEFAULT 'balanced' CHECK (aggressiveness_profile IN ('conservative','balanced','aggressive')),
  lead_quality_target text NOT NULL DEFAULT 'balanced' CHECK (lead_quality_target IN ('volume','balanced','quality')),
  service_priority jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_margin_pct jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_deal_size_band jsonb NOT NULL DEFAULT '{}'::jsonb,
  close_rate_est jsonb NOT NULL DEFAULT '{}'::jsonb,
  ltv_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  fulfillment_capacity jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategic_importance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_business_model ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view business model" ON public.project_business_model FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert business model" ON public.project_business_model FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update business model" ON public.project_business_model FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete business model" ON public.project_business_model FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_business_model_touch BEFORE UPDATE ON public.project_business_model FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. operator_controls
CREATE TABLE public.operator_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  control_kind text NOT NULL CHECK (control_kind IN ('theme_boost','theme_deprioritize','strategic_lock','veto','capacity','approach_override','mute')),
  scope jsonb NOT NULL,
  value jsonb NOT NULL,
  reason text,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_operator_controls_project ON public.operator_controls(project_id, active);
CREATE INDEX idx_operator_controls_kind ON public.operator_controls(project_id, control_kind, active);
ALTER TABLE public.operator_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view operator controls" ON public.operator_controls FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert operator controls" ON public.operator_controls FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update operator controls" ON public.operator_controls FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete operator controls" ON public.operator_controls FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_operator_controls_touch BEFORE UPDATE ON public.operator_controls FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. decision_context
CREATE TABLE public.decision_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  action_item_id uuid,
  ads_change_proposal_id uuid,
  scope jsonb NOT NULL,
  why_this_matters text,
  what_changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  causal_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  historical_analogs jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_impact jsonb,
  risk jsonb,
  confidence jsonb NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_next_step text,
  inputs_hash text NOT NULL,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((action_item_id IS NOT NULL AND ads_change_proposal_id IS NULL) OR (action_item_id IS NULL AND ads_change_proposal_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_decision_context_action_item ON public.decision_context(action_item_id) WHERE action_item_id IS NOT NULL;
CREATE UNIQUE INDEX uq_decision_context_proposal ON public.decision_context(ads_change_proposal_id) WHERE ads_change_proposal_id IS NOT NULL;
CREATE INDEX idx_decision_context_project ON public.decision_context(project_id, generated_at DESC);
ALTER TABLE public.decision_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view decision context" ON public.decision_context FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert decision context" ON public.decision_context FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update decision context" ON public.decision_context FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete decision context" ON public.decision_context FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_decision_context_touch BEFORE UPDATE ON public.decision_context FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9. outcome_learnings
CREATE TABLE public.outcome_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  cluster_family text NOT NULL,
  suggested_acquisition_approach text NOT NULL,
  action_category text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  mean_uplift_pct numeric,
  variance numeric,
  last_updated timestamptz NOT NULL DEFAULT now(),
  learning_scope text NOT NULL DEFAULT 'project_only' CHECK (learning_scope IN ('project_only','org_only','network')),
  share_anonymized boolean NOT NULL DEFAULT false,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, cluster_family, suggested_acquisition_approach, action_category, model_version)
);
CREATE INDEX idx_outcome_learnings_project ON public.outcome_learnings(project_id);
CREATE INDEX idx_outcome_learnings_lookup ON public.outcome_learnings(project_id, cluster_family, suggested_acquisition_approach);
ALTER TABLE public.outcome_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view outcome learnings" ON public.outcome_learnings FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert outcome learnings" ON public.outcome_learnings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update outcome learnings" ON public.outcome_learnings FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete outcome learnings" ON public.outcome_learnings FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_outcome_learnings_touch BEFORE UPDATE ON public.outcome_learnings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_context;
ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunity_scores;

-- shadow_run_results
CREATE TABLE public.shadow_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_label text,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  samples jsonb NOT NULL DEFAULT '{}'::jsonb,
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shadow_run_results_project ON public.shadow_run_results(project_id, created_at DESC);
CREATE INDEX idx_shadow_run_results_run ON public.shadow_run_results(run_id);
ALTER TABLE public.shadow_run_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view shadow runs" ON public.shadow_run_results FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert shadow runs" ON public.shadow_run_results FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete shadow runs" ON public.shadow_run_results FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));