
CREATE OR REPLACE FUNCTION public.get_ranking_reis_pvp(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_event_type text DEFAULT NULL)
 RETURNS TABLE(player_name text, is_rei boolean, vezes bigint, melhor_score numeric, pior_score numeric, media_score numeric, extreme_match_date date, extreme_match_hour integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid, m.match_date AS m_date, m.match_hour AS m_hour
    FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
  ),
  scored AS (
    SELECT
      mp.match_id AS s_mid,
      mp.player_name AS s_pname,
      ROUND((mp.kills * 3)::numeric + (mp.kda * 2)::numeric - (mp.deaths * 1.5)::numeric, 2) AS s_score,
      fm.m_date AS s_date,
      fm.m_hour AS s_hour
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (PARTITION BY s.s_mid ORDER BY s.s_score DESC, s.s_pname ASC) AS rn_top,
      ROW_NUMBER() OVER (PARTITION BY s.s_mid ORDER BY s.s_score ASC, s.s_pname ASC) AS rn_bot
    FROM scored s
  ),
  reis AS (
    SELECT s_pname AS pname, s_score AS escore, s_date AS m_date, s_hour AS m_hour FROM ranked WHERE rn_top = 1
  ),
  cones AS (
    SELECT s_pname AS pname, s_score AS escore, s_date AS m_date, s_hour AS m_hour FROM ranked WHERE rn_bot = 1
  ),
  rei_extremes AS (
    SELECT DISTINCT ON (r.pname) r.pname, r.m_date, r.m_hour
    FROM reis r ORDER BY r.pname, r.escore DESC
  ),
  cone_extremes AS (
    SELECT DISTINCT ON (c.pname) c.pname, c.m_date, c.m_hour
    FROM cones c ORDER BY c.pname, c.escore ASC
  ),
  rei_agg AS (
    SELECT
      r.pname AS rp,
      true AS is_r,
      COUNT(*) AS vz,
      MAX(r.escore) AS mlhr,
      MIN(r.escore) AS pr,
      ROUND(AVG(r.escore), 2) AS md,
      re.m_date AS edt,
      re.m_hour AS ehr
    FROM reis r
    LEFT JOIN rei_extremes re ON re.pname = r.pname
    GROUP BY r.pname, re.m_date, re.m_hour
  ),
  cone_agg AS (
    SELECT
      c.pname AS rp,
      false AS is_r,
      COUNT(*) AS vz,
      MAX(c.escore) AS mlhr,
      MIN(c.escore) AS pr,
      ROUND(AVG(c.escore), 2) AS md,
      ce.m_date AS edt,
      ce.m_hour AS ehr
    FROM cones c
    LEFT JOIN cone_extremes ce ON ce.pname = c.pname
    GROUP BY c.pname, ce.m_date, ce.m_hour
  )
  SELECT rp, is_r, vz, mlhr, pr, md, edt, ehr FROM rei_agg
  UNION ALL
  SELECT rp, is_r, vz, mlhr, pr, md, edt, ehr FROM cone_agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking_kill_streak(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_hour_from integer DEFAULT NULL, p_hour_to integer DEFAULT NULL, p_event_type text DEFAULT NULL)
 RETURNS TABLE(player_name text, max_streak integer, player_class text, player_class_short text, player_guild text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid
    FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  ),
  events AS (
    SELECT kl.match_id AS e_mid, kl.killer_name AS e_player, kl.created_at AS e_ts, 1 AS is_kill, 0 AS is_death
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    UNION ALL
    SELECT kl.match_id, kl.victim_name, kl.created_at, 0, 1
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
  ),
  with_grp AS (
    SELECT
      e_mid, e_player, is_kill,
      SUM(is_death) OVER (PARTITION BY e_mid, e_player ORDER BY e_ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS death_grp
    FROM events
  ),
  streaks AS (
    SELECT e_player AS pname, e_mid, death_grp, SUM(is_kill)::int AS streak
    FROM with_grp
    GROUP BY e_player, e_mid, death_grp
  ),
  max_streaks AS (
    SELECT pname, MAX(streak) AS max_s
    FROM streaks
    GROUP BY pname
    HAVING MAX(streak) >= 2
  )
  SELECT
    ms.pname::text,
    ms.max_s,
    COALESCE(ch.class, '')::text,
    COALESCE(ch.class_short, '')::text,
    COALESCE(ch.guild, '')::text
  FROM max_streaks ms
  LEFT JOIN characters ch ON ch.name = ms.pname AND ch.banned = false
  ORDER BY ms.max_s DESC;
END;
$function$;
