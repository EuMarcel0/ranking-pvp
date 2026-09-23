-- Reativa watchdog do Throne (idle em logs_pvp). Boss fica no detect-boss-kill.

DO $$
BEGIN
  PERFORM cron.unschedule('kill-activity-watchdog-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'kill-activity-watchdog-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://egupwrwzcuqazlshhfoq.supabase.co/functions/v1/kill-activity-watchdog',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_fVUYQHFh7AZVM4TtGTZ_iQ_doLJzMqQ"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ) AS request_id;
  $$
);
