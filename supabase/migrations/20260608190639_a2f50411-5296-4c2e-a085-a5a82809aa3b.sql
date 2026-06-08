
-- 1. Bulk-restrict every public-schema write policy still targeting {public} to {authenticated}
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT','UPDATE','DELETE')
      AND roles = '{public}'::name[]
      AND policyname <> 'Auto-clean old cache'  -- handled separately as service_role
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2. Restrict ads_diagnostics_cache auto-clean DELETE to service_role
ALTER POLICY "Auto-clean old cache" ON public.ads_diagnostics_cache TO service_role;

-- 3. Hide ads_script_secret from client roles (column-level revoke).
--    service_role retains full access for edge functions.
REVOKE SELECT (ads_script_secret) ON public.project_google_settings FROM authenticated;
REVOKE SELECT (ads_script_secret) ON public.project_google_settings FROM anon;
-- Re-grant SELECT on all OTHER columns to authenticated so existing reads keep working
GRANT SELECT (id, project_id, gsc_site_url, ga4_property_id, ga4_property_name,
              created_at, updated_at, ads_customer_id, ads_customer_name)
  ON public.project_google_settings TO authenticated;
