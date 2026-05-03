CREATE TABLE public.cluster_resolution_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id uuid NOT NULL,
  project_id uuid,
  function_name text NOT NULL DEFAULT 'generate-brief',
  requested_cluster text NOT NULL,
  matched_cluster text,
  match_kind text NOT NULL,
  matched_keywords_count integer NOT NULL DEFAULT 0,
  available_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  similar_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_cluster_resolution_logs_analysis ON public.cluster_resolution_logs(analysis_id, created_at DESC);
CREATE INDEX idx_cluster_resolution_logs_project ON public.cluster_resolution_logs(project_id, created_at DESC);

ALTER TABLE public.cluster_resolution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cluster resolution logs"
ON public.cluster_resolution_logs
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = cluster_resolution_logs.project_id AND p.user_id = auth.uid()
));

CREATE POLICY "Users delete own cluster resolution logs"
ON public.cluster_resolution_logs
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = cluster_resolution_logs.project_id AND p.user_id = auth.uid()
));
