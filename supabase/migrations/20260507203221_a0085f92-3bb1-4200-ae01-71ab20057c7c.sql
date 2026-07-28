
CREATE OR REPLACE FUNCTION public.get_analytics_kill_logs(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_guild text DEFAULT NULL
)
RETURNS TABLE(killer_name text, victim_name text, match_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH fm AS (
    SELECT m.id AS mid
    FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  )
  SELECT kl.killer_name, kl.victim_name, kl.match_id
  FROM pvp_kill_logs kl
  INNER JOIN fm ON kl.match_id = fm.mid
  INNER JOIN characters ck ON ck.name = kl.killer_name AND ck.banned = false
  INNER JOIN characters cv ON cv.name = kl.victim_name AND cv.banned = false
  WHERE (p_guild IS NULL OR ck.guild = p_guild OR cv.guild = p_guild);
$$;
