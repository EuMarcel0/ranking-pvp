-- Reativa o watchdog que detecta fim do PvP (7 min sem kills) e dispara o ranking automaticamente.
-- Foi desativado em 20260601022335; sem ele o sistema depende só dos crons fixos (~30-60 min de atraso).

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
