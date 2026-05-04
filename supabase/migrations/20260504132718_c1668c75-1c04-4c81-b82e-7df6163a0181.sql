-- Schemalägg veckosnapshot av baseline-KPI varje måndag 06:00
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'baseline-snapshot-weekly';

SELECT cron.schedule(
  'baseline-snapshot-weekly',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://mejxsgutoonckmwnxvdp.supabase.co/functions/v1/baseline-snapshot',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lanhzZ3V0b29uY2ttd254dmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Nzc1MTYsImV4cCI6MjA5MDQ1MzUxNn0.8jXeFHfDaNrHj6ZjfFQInkmlTsrxq3vaaTJaa-CydiQ"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);