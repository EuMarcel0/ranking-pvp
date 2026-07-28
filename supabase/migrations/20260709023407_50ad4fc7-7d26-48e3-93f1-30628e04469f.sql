CREATE OR REPLACE FUNCTION public.get_cron_status(p_job_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_runs jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT jobid, jobname, schedule, active, command
    INTO v_job
  FROM cron.job
  WHERE jobname = p_job_name
  LIMIT 1;

  IF v_job.jobid IS NULL THEN
    RETURN jsonb_build_object('found', false, 'job_name', p_job_name);
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.start_time DESC), '[]'::jsonb) INTO v_runs
  FROM (
    SELECT start_time, end_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid = v_job.jobid
    ORDER BY start_time DESC
    LIMIT 10
  ) r;

  RETURN jsonb_build_object(
    'found', true,
    'jobid', v_job.jobid,
    'job_name', v_job.jobname,
    'schedule', v_job.schedule,
    'active', v_job.active,
    'runs', v_runs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_status(text) TO authenticated;