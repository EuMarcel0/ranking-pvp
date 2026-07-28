-- Reativa o watchdog que detecta fim do PvP (7 min sem kills) e dispara o ranking automaticamente.
-- Foi desativado em 20260601022335; sem ele o sistema depende só dos crons fixos (~30-60 min de atraso).

SELECT cron.schedule(
  'kill-activity-watchdog-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/kill-activity-watchdog',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ) AS request_id;
  $$
);
