-- Schedule weekly SEO diagnostics for all projects with a keyword universe
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'seo-diagnose-weekly';

SELECT cron.schedule(
  'seo-diagnose-weekly',
  '30 5 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://mejxsgutoonckmwnxvdp.supabase.co/functions/v1/seo-diagnose',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object('run_all_projects', true)
  );
  $$
);