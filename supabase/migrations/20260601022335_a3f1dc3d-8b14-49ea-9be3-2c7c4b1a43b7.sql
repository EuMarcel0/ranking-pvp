DO $$
BEGIN
  PERFORM cron.unschedule('kill-activity-watchdog-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
