-- Fecha temporada do mês anterior e posta imagem no Discord todo dia 1 às 00:05 BRT (03:05 UTC)

DO $$
BEGIN
  PERFORM cron.unschedule('monthly-close-season-day-1');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'monthly-close-season-day-1',
  '5 3 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://egupwrwzcuqazlshhfoq.supabase.co/functions/v1/monthly-close-season',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_fVUYQHFh7AZVM4TtGTZ_iQ_doLJzMqQ"}'::jsonb,
    body := '{"trigger":"cron","target":"prod"}'::jsonb
  ) AS request_id;
  $$
);
