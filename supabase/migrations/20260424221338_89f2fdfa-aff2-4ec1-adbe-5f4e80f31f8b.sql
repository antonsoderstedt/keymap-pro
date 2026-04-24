
-- Utöka projects med workspace-fält
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();

-- workspace_artifacts: sparade rapporter/snapshots/exports
CREATE TABLE IF NOT EXISTS public.workspace_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type text NOT NULL, -- 'analysis' | 'report' | 'audit' | 'export' | 'snapshot'
  name text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id uuid, -- referens till analyses.id, audit_runs.id etc
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_artifacts_project ON public.workspace_artifacts(project_id, created_at DESC);

ALTER TABLE public.workspace_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view artifacts of own projects"
ON public.workspace_artifacts FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = workspace_artifacts.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert artifacts for own projects"
ON public.workspace_artifacts FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = workspace_artifacts.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update artifacts of own projects"
ON public.workspace_artifacts FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = workspace_artifacts.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete artifacts of own projects"
ON public.workspace_artifacts FOR DELETE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = workspace_artifacts.project_id AND p.user_id = auth.uid()));

-- action_items: central åtgärdslista
CREATE TABLE IF NOT EXISTS public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general', -- 'seo' | 'ads' | 'content' | 'technical' | 'general'
  priority text NOT NULL DEFAULT 'medium', -- 'critical' | 'high' | 'medium' | 'low'
  status text NOT NULL DEFAULT 'todo', -- 'todo' | 'in_progress' | 'done' | 'archived'
  source_type text, -- 'audit' | 'analysis' | 'ads_alert' | 'manual'
  source_id uuid,
  source_payload jsonb,
  expected_impact text,
  baseline_metrics jsonb, -- snapshot vid implementering
  implemented_at timestamptz,
  implemented_by uuid,
  implementation_notes text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_project_status ON public.action_items(project_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_action_items_implemented ON public.action_items(project_id, implemented_at) WHERE implemented_at IS NOT NULL;

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view action items of own projects"
ON public.action_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = action_items.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert action items for own projects"
ON public.action_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = action_items.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update action items of own projects"
ON public.action_items FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = action_items.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete action items of own projects"
ON public.action_items FOR DELETE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = action_items.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_action_items_updated_at
BEFORE UPDATE ON public.action_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- action_outcomes: effektmätning 7/30/60/90 dagar
CREATE TABLE IF NOT EXISTS public.action_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  days_after_implementation integer NOT NULL,
  metric_name text NOT NULL,
  baseline_value numeric,
  current_value numeric,
  delta numeric,
  delta_pct numeric,
  confidence text, -- 'low' | 'medium' | 'high'
  notes text
);

CREATE INDEX IF NOT EXISTS idx_action_outcomes_action ON public.action_outcomes(action_id, measured_at DESC);

ALTER TABLE public.action_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view outcomes of own actions"
ON public.action_outcomes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.action_items a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = action_outcomes.action_id AND p.user_id = auth.uid()
));

CREATE POLICY "System inserts outcomes for own actions"
ON public.action_outcomes FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.action_items a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = action_outcomes.action_id AND p.user_id = auth.uid()
));

-- analysis_jobs: bakgrundsjobb med milstolpar
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE CASCADE,
  job_type text NOT NULL, -- 'full_analysis' | 'audit' | 'ads_monitor' | 'report'
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  steps jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{key, label, status, started_at, completed_at, message}]
  current_step text,
  progress_pct integer NOT NULL DEFAULT 0,
  error_message text,
  payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_project ON public.analysis_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON public.analysis_jobs(status) WHERE status IN ('pending','running');

ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view jobs of own projects"
ON public.analysis_jobs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = analysis_jobs.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert jobs for own projects"
ON public.analysis_jobs FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = analysis_jobs.project_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can update jobs of own projects"
ON public.analysis_jobs FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = analysis_jobs.project_id AND p.user_id = auth.uid()));

CREATE TRIGGER trg_analysis_jobs_updated_at
BEFORE UPDATE ON public.analysis_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
