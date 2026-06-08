
-- 1. google_tokens: restrict policies to authenticated role
DROP POLICY IF EXISTS "Users can delete own google tokens" ON public.google_tokens;
DROP POLICY IF EXISTS "Users can insert own google tokens" ON public.google_tokens;
DROP POLICY IF EXISTS "Users can update own google tokens" ON public.google_tokens;
DROP POLICY IF EXISTS "Users can view own google tokens" ON public.google_tokens;

CREATE POLICY "Users can view own google tokens" ON public.google_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own google tokens" ON public.google_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own google tokens" ON public.google_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own google tokens" ON public.google_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. projects: add SELECT for invited project members
CREATE POLICY "Members can view projects they belong to" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_project_member(id, auth.uid()));

-- 3. seo_diagnostics_cache: restrict service write policies to service_role
DROP POLICY IF EXISTS "Service inserts seo cache" ON public.seo_diagnostics_cache;
DROP POLICY IF EXISTS "Service updates seo cache" ON public.seo_diagnostics_cache;
CREATE POLICY "Service inserts seo cache" ON public.seo_diagnostics_cache
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service updates seo cache" ON public.seo_diagnostics_cache
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- 4. seo_diagnostics_runs
DROP POLICY IF EXISTS "Service inserts seo runs" ON public.seo_diagnostics_runs;
CREATE POLICY "Service inserts seo runs" ON public.seo_diagnostics_runs
  FOR INSERT TO service_role WITH CHECK (true);

-- 5. seo_recommendation_outcomes
DROP POLICY IF EXISTS "Service writes seo outcomes" ON public.seo_recommendation_outcomes;
DROP POLICY IF EXISTS "Service updates seo outcomes" ON public.seo_recommendation_outcomes;
CREATE POLICY "Service writes seo outcomes" ON public.seo_recommendation_outcomes
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service updates seo outcomes" ON public.seo_recommendation_outcomes
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
