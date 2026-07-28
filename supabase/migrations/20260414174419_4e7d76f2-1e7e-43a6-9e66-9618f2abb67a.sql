DROP FUNCTION IF EXISTS public.get_ranking_geral(date, date, integer, integer);

CREATE OR REPLACE FUNCTION public.get_ranking_geral(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_hour_from integer DEFAULT NULL::integer, p_hour_to integer DEFAULT NULL::integer)
 RETURNS TABLE(player_name text, player_class text, player_guild text, total_kills bigint, total_deaths bigint, kda numeric, weighted_kda numeric, matches_played bigint, event_score numeric, single_match_max_kills bigint, player_class_short text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_matches bigint;
BEGIN
  SELECT COUNT(DISTINCT m.id) INTO v_total_matches
  FROM pvp_matches m
  WHERE m.event_type = 'boss_event'
    AND (p_date_from IS NULL OR m.match_date >= p_date_from)
    AND (p_date_to IS NULL OR m.match_date <= p_date_to)
    AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
    AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to);

  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid
    FROM pvp_matches m
    WHERE m.event_type = 'boss_event'
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  ),
  kills_agg AS (
    SELECT kl.killer_name AS name, COUNT(*) AS kills
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    WHERE NOT EXISTS (SELECT 1 FROM characters c WHERE c.name = kl.killer_name AND c.banned = true)
    GROUP BY kl.killer_name
  ),
  deaths_agg AS (
    SELECT kl.victim_name AS name, COUNT(*) AS deaths
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    WHERE NOT EXISTS (SELECT 1 FROM characters c WHERE c.name = kl.victim_name AND c.banned = true)
    GROUP BY kl.victim_name
  ),
  per_match_kills AS (
    SELECT sub.killer_name AS name, MAX(sub.kill_count) AS max_kills_single_match
    FROM (
      SELECT kl2.killer_name, kl2.match_id, COUNT(*) AS kill_count
      FROM pvp_kill_logs kl2
      INNER JOIN filtered_matches fm2 ON kl2.match_id = fm2.mid
      GROUP BY kl2.killer_name, kl2.match_id
    ) sub
    GROUP BY sub.killer_name
  ),
  combined AS (
    SELECT
      COALESCE(k.name, d.name) AS pname,
      COALESCE(k.kills, 0) AS total_k,
      COALESCE(d.deaths, 0) AS total_d,
      (
        SELECT COUNT(DISTINCT kl3.match_id)
        FROM pvp_kill_logs kl3
        INNER JOIN filtered_matches fm3 ON kl3.match_id = fm3.mid
        WHERE kl3.killer_name = COALESCE(k.name, d.name) OR kl3.victim_name = COALESCE(k.name, d.name)
      ) AS total_matches,
      COALESCE(pmk.max_kills_single_match, 0) AS max_single
    FROM kills_agg k
    FULL OUTER JOIN deaths_agg d ON k.name = d.name
    LEFT JOIN per_match_kills pmk ON COALESCE(k.name, d.name) = pmk.name
  )
  SELECT
    c2.pname AS player_name,
    COALESCE(ch.class, '')::text AS player_class,
    COALESCE(ch.guild, '')::text AS player_guild,
    c2.total_k AS total_kills,
    c2.total_d AS total_deaths,
    CASE WHEN c2.total_d = 0 THEN c2.total_k::numeric ELSE ROUND(c2.total_k::numeric / c2.total_d::numeric, 2) END AS kda,
    CASE WHEN v_total_matches = 0 THEN 0::numeric
      ELSE ROUND(
        (CASE WHEN c2.total_d = 0 THEN c2.total_k::numeric ELSE c2.total_k::numeric / c2.total_d::numeric END)
        * (c2.total_matches::numeric / v_total_matches::numeric), 2
      )
    END AS weighted_kda,
    c2.total_matches AS matches_played,
    ROUND((c2.total_k * 3)::numeric +
      (CASE WHEN c2.total_d = 0 THEN c2.total_k::numeric ELSE c2.total_k::numeric / c2.total_d::numeric END) * 2
      - (c2.total_d * 1.5)::numeric, 2) AS event_score,
    c2.max_single AS single_match_max_kills,
    COALESCE(ch.class_short, '')::text AS player_class_short
  FROM combined c2
  LEFT JOIN characters ch ON ch.name = c2.pname AND ch.banned = false
  WHERE c2.total_k > 0 OR c2.total_d > 0;
END;
$function$;