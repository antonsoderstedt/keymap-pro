-- Alerts
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  type text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  suggested_action text,
  expected_impact text,
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own alerts" ON public.alerts FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = alerts.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own alerts" ON public.alerts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = alerts.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own alerts" ON public.alerts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = alerts.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own alerts" ON public.alerts FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = alerts.project_id AND p.user_id = auth.uid()));
CREATE INDEX idx_alerts_project_status ON public.alerts(project_id, status);

-- Automation rules
CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  rule_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'suggest',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own rules" ON public.automation_rules FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = automation_rules.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own rules" ON public.automation_rules FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = automation_rules.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own rules" ON public.automation_rules FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = automation_rules.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own rules" ON public.automation_rules FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = automation_rules.project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_automation_rules_updated BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auction Insights snapshots
CREATE TABLE public.auction_insights_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  campaign text,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auction_insights_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own AI snapshots" ON public.auction_insights_snapshots FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = auction_insights_snapshots.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own AI snapshots" ON public.auction_insights_snapshots FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = auction_insights_snapshots.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own AI snapshots" ON public.auction_insights_snapshots FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = auction_insights_snapshots.project_id AND p.user_id = auth.uid()));

-- SEO Audit runs
CREATE TABLE public.audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  domain text NOT NULL,
  health_score integer,
  status text NOT NULL DEFAULT 'pending',
  totals jsonb DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own audit runs" ON public.audit_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_runs.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own audit runs" ON public.audit_runs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_runs.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own audit runs" ON public.audit_runs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_runs.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own audit runs" ON public.audit_runs FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_runs.project_id AND p.user_id = auth.uid()));

-- SEO Audit findings
CREATE TABLE public.audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.audit_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text,
  recommendation text,
  affected_url text,
  status text NOT NULL DEFAULT 'open',
  baseline_metrics jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own findings" ON public.audit_findings FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_findings.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own findings" ON public.audit_findings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_findings.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own findings" ON public.audit_findings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_findings.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own findings" ON public.audit_findings FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audit_findings.project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_audit_findings_updated BEFORE UPDATE ON public.audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_audit_findings_project ON public.audit_findings(project_id, status);
CREATE INDEX idx_audit_findings_run ON public.audit_findings(run_id);