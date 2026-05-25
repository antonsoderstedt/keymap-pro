-- =============================================================================
-- Commercial Intelligence v1 — Phase 0 foundations
-- Locked architecture from /memories/session/plan.md (2026-05-25)
--
-- Adds:
--   - pgvector extension
--   - keyword_embeddings, landing_page_embeddings  (semantic layer)
--   - opportunity_clusters                          (durable cluster identity)
--   - commercial_intent_labels                      (per-keyword verdict, versioned)
--   - opportunity_scores                            (locked scoring v1 output)
--   - project_business_model                        (business-model weighting inputs)
--   - operator_controls                             (theme boosts, locks, vetoes,
--                                                    aggressiveness profile, mute)
--   - decision_context                              (per-action enrichment for
--                                                    Today / Actions / ASK)
--   - outcome_learnings                             (per-project feedback rollups;
--                                                    aggregation flag designed-in
--                                                    but disabled in MVP)
--
-- All tables are project-scoped with RLS. Owners insert/update/delete;
-- members read. Pattern matches existing migrations.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- 1. keyword_embeddings
-- -----------------------------------------------------------------------------
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
-- HNSW for cosine similarity; suitable for up to mid-six-figure rows per project.
CREATE INDEX idx_keyword_embeddings_hnsw
  ON public.keyword_embeddings USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.keyword_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view keyword embeddings" ON public.keyword_embeddings
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert keyword embeddings" ON public.keyword_embeddings
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update keyword embeddings" ON public.keyword_embeddings
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete keyword embeddings" ON public.keyword_embeddings
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_keyword_embeddings_touch BEFORE UPDATE ON public.keyword_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2. landing_page_embeddings
-- -----------------------------------------------------------------------------
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
CREATE INDEX idx_lp_embeddings_hnsw
  ON public.landing_page_embeddings USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.landing_page_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view lp embeddings" ON public.landing_page_embeddings
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert lp embeddings" ON public.landing_page_embeddings
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update lp embeddings" ON public.landing_page_embeddings
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete lp embeddings" ON public.landing_page_embeddings
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_lp_embeddings_touch BEFORE UPDATE ON public.landing_page_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. opportunity_clusters — durable cluster identity (replaces ephemeral
--    UniverseKeyword.cluster strings as the canonical reference).
-- -----------------------------------------------------------------------------
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

CREATE POLICY "Members view opportunity clusters" ON public.opportunity_clusters
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert opportunity clusters" ON public.opportunity_clusters
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update opportunity clusters" ON public.opportunity_clusters
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete opportunity clusters" ON public.opportunity_clusters
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_opportunity_clusters_touch BEFORE UPDATE ON public.opportunity_clusters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. commercial_intent_labels — per-keyword IntelligenceVerdict.
--    Verdict shape lives in shared TS types; stored as jsonb for flexibility
--    across model_version bumps.
-- -----------------------------------------------------------------------------
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
  estimated_commercial_value jsonb NOT NULL,   -- { p10, p50, p90, currency }
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

CREATE POLICY "Members view intent labels" ON public.commercial_intent_labels
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert intent labels" ON public.commercial_intent_labels
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update intent labels" ON public.commercial_intent_labels
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete intent labels" ON public.commercial_intent_labels
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. opportunity_scores — locked OpportunityScore v1 output. Scope is one of
--    keyword | cluster | opportunity (future). Persisted so UI can render
--    contribution_trace without recomputation.
-- -----------------------------------------------------------------------------
CREATE TABLE public.opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('keyword','cluster','opportunity')),
  scope_id text NOT NULL,                     -- keyword text, cluster uuid, or opportunity id
  score numeric NOT NULL,                     -- 0..100
  score_band text NOT NULL CHECK (score_band IN ('veto','low','medium','high','critical')),
  confidence numeric NOT NULL,                -- 0..1
  confidence_band text NOT NULL CHECK (confidence_band IN ('low','medium','high')),
  components jsonb NOT NULL,                  -- { component_name: 0..1 }
  weights_applied jsonb NOT NULL,
  multipliers_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  vetoes_triggered text[] NOT NULL DEFAULT ARRAY[]::text[],
  contribution_trace jsonb NOT NULL,          -- ordered ComponentContribution[]
  freshness jsonb NOT NULL DEFAULT '{}'::jsonb,
  learning_adjustment jsonb,
  expected_impact jsonb,                      -- { p10, p50, p90, horizon_days }
  risk jsonb,                                 -- { band, drivers[] }
  workspace_profile text NOT NULL,            -- profile used at compute time
  model_version text NOT NULL,
  signals_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scope_kind, scope_id, model_version)
);
CREATE INDEX idx_opportunity_scores_project ON public.opportunity_scores(project_id);
CREATE INDEX idx_opportunity_scores_band ON public.opportunity_scores(project_id, score_band, score DESC);
CREATE INDEX idx_opportunity_scores_scope ON public.opportunity_scores(project_id, scope_kind, scope_id);
ALTER TABLE public.opportunity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view opportunity scores" ON public.opportunity_scores
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert opportunity scores" ON public.opportunity_scores
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update opportunity scores" ON public.opportunity_scores
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete opportunity scores" ON public.opportunity_scores
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. project_business_model — inputs to business-model weighting (scoring §4).
--    One row per project; nullable fields fall back to deterministic defaults
--    in the scoring engine.
-- -----------------------------------------------------------------------------
CREATE TABLE public.project_business_model (
  project_id uuid PRIMARY KEY,
  workspace_profile text NOT NULL DEFAULT 'b2b_service'
    CHECK (workspace_profile IN ('b2b_service','b2b_industrial','b2c_ecom','local_service','saas')),
  aggressiveness_profile text NOT NULL DEFAULT 'balanced'
    CHECK (aggressiveness_profile IN ('conservative','balanced','aggressive')),
  lead_quality_target text NOT NULL DEFAULT 'balanced'
    CHECK (lead_quality_target IN ('volume','balanced','quality')),
  service_priority jsonb NOT NULL DEFAULT '{}'::jsonb,           -- { service_id: 0..1 }
  service_margin_pct jsonb NOT NULL DEFAULT '{}'::jsonb,         -- { service_id: number }
  service_deal_size_band jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { service_id: 'small'|'mid'|'large'|'enterprise' }
  close_rate_est jsonb NOT NULL DEFAULT '{}'::jsonb,             -- { service_id: 0..1 }
  ltv_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb,             -- { service_id: 1..3 }
  fulfillment_capacity jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { service_id: 'unconstrained'|'constrained'|'at_capacity'|'suspended' }
  strategic_importance jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { theme_id: 'core'|'growth'|'defensive'|'exploratory' }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_business_model ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view business model" ON public.project_business_model
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert business model" ON public.project_business_model
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update business model" ON public.project_business_model
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete business model" ON public.project_business_model
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_business_model_touch BEFORE UPDATE ON public.project_business_model
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 7. operator_controls — deterministic, recorded operator inputs into scoring
--    (theme boosts, locks, vetoes, capacity overrides, aggressiveness profile
--    [also stored on project_business_model for default], approach overrides,
--    mute). Every entry carries reason and operator id (created_by).
-- -----------------------------------------------------------------------------
CREATE TABLE public.operator_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  control_kind text NOT NULL CHECK (control_kind IN (
    'theme_boost','theme_deprioritize','strategic_lock',
    'veto','capacity','approach_override','mute'
  )),
  scope jsonb NOT NULL,                       -- { theme_id?, cluster_id?, opportunity_id?, service_id? }
  value jsonb NOT NULL,                       -- control-specific payload
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

CREATE POLICY "Members view operator controls" ON public.operator_controls
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert operator controls" ON public.operator_controls
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update operator controls" ON public.operator_controls
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete operator controls" ON public.operator_controls
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_operator_controls_touch BEFORE UPDATE ON public.operator_controls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 8. decision_context — per-action enrichment. Exactly one of
--    (action_item_id, ads_change_proposal_id) is non-null. Unique per scope
--    ensures one cached context per item; rebuilt on inputs_hash change.
-- -----------------------------------------------------------------------------
CREATE TABLE public.decision_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  action_item_id uuid,
  ads_change_proposal_id uuid,
  scope jsonb NOT NULL,                         -- { kind, ids[] }
  why_this_matters text,                        -- nullable; LLM narrative or null
  what_changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  causal_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  historical_analogs jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_impact jsonb,
  risk jsonb,
  confidence jsonb NOT NULL,                    -- { value, band, gate_triggers[] }
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_next_step text,
  inputs_hash text NOT NULL,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (action_item_id IS NOT NULL AND ads_change_proposal_id IS NULL)
    OR (action_item_id IS NULL AND ads_change_proposal_id IS NOT NULL)
  )
);
-- One context per source row (partial unique indexes avoid NULL collisions).
CREATE UNIQUE INDEX uq_decision_context_action_item
  ON public.decision_context(action_item_id)
  WHERE action_item_id IS NOT NULL;
CREATE UNIQUE INDEX uq_decision_context_proposal
  ON public.decision_context(ads_change_proposal_id)
  WHERE ads_change_proposal_id IS NOT NULL;
CREATE INDEX idx_decision_context_project ON public.decision_context(project_id, generated_at DESC);
ALTER TABLE public.decision_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view decision context" ON public.decision_context
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert decision context" ON public.decision_context
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update decision context" ON public.decision_context
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete decision context" ON public.decision_context
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_decision_context_touch BEFORE UPDATE ON public.decision_context
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 9. outcome_learnings — per-project feedback rollups. learning_scope and
--    share_anonymized are schema-future-proofing for opt-in aggregation;
--    only 'project_only' is read by the scoring engine in MVP.
-- -----------------------------------------------------------------------------
CREATE TABLE public.outcome_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  cluster_family text NOT NULL,                   -- normalized cluster signature
  suggested_acquisition_approach text NOT NULL,
  action_category text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  mean_uplift_pct numeric,
  variance numeric,
  last_updated timestamptz NOT NULL DEFAULT now(),
  learning_scope text NOT NULL DEFAULT 'project_only'
    CHECK (learning_scope IN ('project_only','org_only','network')),
  share_anonymized boolean NOT NULL DEFAULT false,
  model_version text NOT NULL,
  signals_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, cluster_family, suggested_acquisition_approach, action_category, model_version)
);
CREATE INDEX idx_outcome_learnings_project ON public.outcome_learnings(project_id);
CREATE INDEX idx_outcome_learnings_lookup
  ON public.outcome_learnings(project_id, cluster_family, suggested_acquisition_approach);
ALTER TABLE public.outcome_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view outcome learnings" ON public.outcome_learnings
  FOR SELECT USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners insert outcome learnings" ON public.outcome_learnings
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners update outcome learnings" ON public.outcome_learnings
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "Owners delete outcome learnings" ON public.outcome_learnings
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_outcome_learnings_touch BEFORE UPDATE ON public.outcome_learnings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Realtime: decision_context drives a live UI surface; opportunity_scores
-- drives Today next-action ranking.
-- -----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_context;
ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunity_scores;
