
CREATE INDEX IF NOT EXISTS idx_customers_project ON public.customers(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_project_created ON public.analyses(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_tokens_user ON public.google_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ga4_filters_project ON public.ga4_filters(project_id);
CREATE INDEX IF NOT EXISTS idx_gsc_snapshots_project_created ON public.gsc_snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_snapshots_project_created ON public.ga4_snapshots(project_id, created_at DESC);
ANALYZE public.customers;
ANALYZE public.projects;
ANALYZE public.analyses;
ANALYZE public.google_tokens;
ANALYZE public.data_source_status;
