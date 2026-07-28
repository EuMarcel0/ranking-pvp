-- Re-create all auto-ranking cron jobs with "trigger":"cron" in body
-- We use cron.unschedule + cron.schedule instead of UPDATE, since UPDATE on cron.job may fail

-- Remove old jobs
SELECT cron.unschedule('auto-ranking-mon-21-t1');
SELECT cron.unschedule('auto-ranking-mon-21-t2');
SELECT cron.unschedule('auto-ranking-mon-21-t3');
SELECT cron.unschedule('auto-ranking-mon-22-t1');
SELECT cron.unschedule('auto-ranking-mon-22-t2');
SELECT cron.unschedule('auto-ranking-mon-22-t3');
SELECT cron.unschedule('auto-ranking-tue-20-t1');
SELECT cron.unschedule('auto-ranking-tue-20-t2');
SELECT cron.unschedule('auto-ranking-tue-20-t3');
SELECT cron.unschedule('auto-ranking-tue-22-t1');
SELECT cron.unschedule('auto-ranking-tue-22-t2');
SELECT cron.unschedule('auto-ranking-tue-22-t3');
SELECT cron.unschedule('auto-ranking-wed-20-t1');
SELECT cron.unschedule('auto-ranking-wed-20-t2');
SELECT cron.unschedule('auto-ranking-wed-20-t3');
SELECT cron.unschedule('auto-ranking-wed-22-t1');
SELECT cron.unschedule('auto-ranking-wed-22-t2');
SELECT cron.unschedule('auto-ranking-wed-22-t3');
SELECT cron.unschedule('auto-ranking-thu-20-t1');
SELECT cron.unschedule('auto-ranking-thu-20-t2');
SELECT cron.unschedule('auto-ranking-thu-20-t3');
SELECT cron.unschedule('auto-ranking-thu-22-t1');
SELECT cron.unschedule('auto-ranking-thu-22-t2');
SELECT cron.unschedule('auto-ranking-thu-22-t3');
SELECT cron.unschedule('auto-ranking-fri-20-t1');
SELECT cron.unschedule('auto-ranking-fri-20-t2');
SELECT cron.unschedule('auto-ranking-fri-20-t3');
SELECT cron.unschedule('auto-ranking-fri-22-t1');
SELECT cron.unschedule('auto-ranking-fri-22-t2');
SELECT cron.unschedule('auto-ranking-fri-22-t3');
SELECT cron.unschedule('auto-ranking-sat-20-t1');
SELECT cron.unschedule('auto-ranking-sat-20-t2');
SELECT cron.unschedule('auto-ranking-sat-20-t3');
SELECT cron.unschedule('auto-ranking-sat-22-t1');
SELECT cron.unschedule('auto-ranking-sat-22-t2');
SELECT cron.unschedule('auto-ranking-sat-22-t3');
SELECT cron.unschedule('auto-ranking-sun-20-t1');
SELECT cron.unschedule('auto-ranking-sun-20-t2');
SELECT cron.unschedule('auto-ranking-sun-20-t3');
SELECT cron.unschedule('auto-ranking-sun-22-t1');
SELECT cron.unschedule('auto-ranking-sun-22-t2');
SELECT cron.unschedule('auto-ranking-sun-22-t3');

------------------------------------------------------------
-- Monday 21:00 BRT (UTC 00:00 tuesday) Tentativas 30/50/59
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-mon-21-t1',
  '30 0 * * 2',
  $$
  SELECT net.http_post(
    url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body:='{"trigger":"cron","attempt":1,"eventHour":21}'::jsonb
  ) AS request_id;
  $$
);
SELECT cron.schedule(
  'auto-ranking-mon-21-t2',
  '50 0 * * 2',
  $$
  SELECT net.http_post(
    url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body:='{"trigger":"cron","attempt":2,"eventHour":21}'::jsonb
  ) AS request_id;
  $$
);
SELECT cron.schedule(
  'auto-ranking-mon-21-t3',
  '59 0 * * 2',
  $$
  SELECT net.http_post(
    url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":21}'::jsonb
  ) AS request_id;
  $$
);

------------------------------------------------------------
-- Monday 22:00 BRT -> UTC 01:00 Tuesday (02:00/02:20/02:30)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-mon-22-t1',
  '30 1 * * 2',
  $$
  SELECT net.http_post(
    url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body:='{"trigger":"cron","attempt":1,"eventHour":22}'::jsonb
  ) AS request_id;
  $$
);
SELECT cron.schedule(
  'auto-ranking-mon-22-t2',
  '50 1 * * 2',
  $$
  SELECT net.http_post(
    url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body:='{"trigger":"cron","attempt":2,"eventHour":22}'::jsonb
  ) AS request_id;
  $$
);
SELECT cron.schedule(
  'auto-ranking-mon-22-t3',
  '59 1 * * 2',
  $$
  SELECT net.http_post(
    url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,
    body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22}'::jsonb
  ) AS request_id;
  $$
);

------------------------------------------------------------
-- Tuesday 20:00 BRT (23:00 UTC same day)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-tue-20-t1',
  '30 23 * * 2',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-tue-20-t2',
  '50 23 * * 2',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-tue-20-t3',
  '59 23 * * 2',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":20}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Tuesday 22:30 BRT -> UTC 01:00+ Wednesday (01:00, 01:20, 02:00)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-tue-22-t1',
  '00 1 * * 3',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":22,"eventMinute":30}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-tue-22-t2',
  '20 1 * * 3',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":22,"eventMinute":30}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-tue-22-t3',
  '30 1 * * 3',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22,"eventMinute":30}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Wednesday 20:00 BRT (23:00 UTC same day)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-wed-20-t1',
  '30 23 * * 3',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-wed-20-t2',
  '50 23 * * 3',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-wed-20-t3',
  '59 23 * * 3',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":20}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Wednesday 22:00 BRT (01:00 UTC Thursday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-wed-22-t1',
  '30 1 * * 4',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-wed-22-t2',
  '50 1 * * 4',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-wed-22-t3',
  '59 1 * * 4',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Thursday 20:00 BRT (23:00 UTC same day)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-thu-20-t1',
  '30 23 * * 4',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-thu-20-t2',
  '50 23 * * 4',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-thu-20-t3',
  '59 23 * * 4',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":20}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Thursday 22:30 BRT -> UTC 01:00+ Friday
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-thu-22-t1',
  '00 1 * * 5',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":22,"eventMinute":30}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-thu-22-t2',
  '20 1 * * 5',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":22,"eventMinute":30}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-thu-22-t3',
  '30 1 * * 5',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22,"eventMinute":30}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Friday 20:00 BRT (23:00 UTC Friday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-fri-20-t1',
  '30 23 * * 5',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-fri-20-t2',
  '50 23 * * 5',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-fri-20-t3',
  '59 23 * * 5',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":20}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Friday 22:00 BRT (01:00 UTC Saturday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-fri-22-t1',
  '30 1 * * 6',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-fri-22-t2',
  '50 1 * * 6',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-fri-22-t3',
  '59 1 * * 6',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Saturday 20:00 BRT (23:00 UTC Saturday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-sat-20-t1',
  '30 23 * * 6',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sat-20-t2',
  '50 23 * * 6',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sat-20-t3',
  '59 23 * * 6',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":20}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Saturday 22:00 BRT (01:00 UTC Sunday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-sat-22-t1',
  '30 1 * * 0',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sat-22-t2',
  '50 1 * * 0',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sat-22-t3',
  '59 1 * * 0',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Sunday 20:00 BRT (23:00 UTC Sunday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-sun-20-t1',
  '30 23 * * 0',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sun-20-t2',
  '50 23 * * 0',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":20}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sun-20-t3',
  '59 23 * * 0',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":20}'::jsonb) AS request_id;$$
);

------------------------------------------------------------
-- Sunday 22:00 BRT (01:00 UTC Monday)
------------------------------------------------------------
SELECT cron.schedule(
  'auto-ranking-sun-22-t1',
  '30 1 * * 1',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":1,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sun-22-t2',
  '50 1 * * 1',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":2,"eventHour":22}'::jsonb) AS request_id;$$
);
SELECT cron.schedule(
  'auto-ranking-sun-22-t3',
  '59 1 * * 1',
  $$SELECT net.http_post(url:='https://piwvrencvdgngruhuxqw.supabase.co/functions/v1/auto-process-ranking',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpd3ZyZW5jdmRnbmdydWh1eHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNTEzMzIsImV4cCI6MjA3NTYyNzMzMn0.iRZFTpNsEFPwGUNRnHCYOlU78kDybCsvgkM8xLCHYlM"}'::jsonb,body:='{"trigger":"cron","attempt":3,"forceProcess":true,"eventHour":22}'::jsonb) AS request_id;$$
);