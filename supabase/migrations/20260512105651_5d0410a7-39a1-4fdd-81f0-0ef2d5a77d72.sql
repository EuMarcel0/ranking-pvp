CREATE OR REPLACE FUNCTION public.get_ranking_mural_vergonha(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_hour_from integer DEFAULT NULL::integer, p_hour_to integer DEFAULT NULL::integer, p_event_type text DEFAULT NULL::text)
 RETURNS TABLE(player_name text, total_deaths bigint, total_kills bigint, matches_played bigint, avg_deaths_per_match numeric, player_guild text, player_class text)
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
  ff_totals AS (
    SELECT ff.player_name, SUM(ff.ff_kills) AS ffk, SUM(ff.ff_deaths) AS ffd
    FROM v_friendly_fire_per_match ff
    INNER JOIN filtered_matches fm ON fm.mid = ff.match_id
    GROUP BY ff.player_name
  ),
  agg AS (
    SELECT
      mp.player_name AS pname,
      SUM(mp.deaths) AS td,
      SUM(mp.kills) AS tk,
      COUNT(*) AS matches
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    GROUP BY mp.player_name
  )
  SELECT
    a.pname,
    GREATEST(a.td - COALESCE(ff.ffd, 0), 0)::bigint AS total_deaths,
    GREATEST(a.tk - COALESCE(ff.ffk, 0), 0)::bigint AS total_kills,
    a.matches::bigint,
    CASE WHEN a.matches = 0 THEN 0::numeric
         ELSE ROUND(GREATEST(a.td - COALESCE(ff.ffd, 0), 0)::numeric / a.matches::numeric, 2) END,
    COALESCE(ch.guild, '')::text,
    COALESCE(ch.class, '')::text
  FROM agg a
  LEFT JOIN ff_totals ff ON LOWER(ff.player_name) = LOWER(a.pname)
  LEFT JOIN characters ch ON LOWER(ch.name) = LOWER(a.pname) AND ch.banned = false
  WHERE GREATEST(a.td - COALESCE(ff.ffd, 0), 0) > 0
  ORDER BY GREATEST(a.td - COALESCE(ff.ffd, 0), 0) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking_best_per_class(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_event_type text DEFAULT 'boss_event'::text)
 RETURNS TABLE(class_name text, player_name text, total_kills bigint, total_deaths bigint, total_kda numeric, match_count bigint, event_score numeric, is_best boolean)
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
  ),
  ff_totals AS (
    SELECT ff.player_name, SUM(ff.ff_kills) AS ffk, SUM(ff.ff_deaths) AS ffd
    FROM v_friendly_fire_per_match ff
    INNER JOIN filtered_matches fm ON fm.mid = ff.match_id
    GROUP BY ff.player_name
  ),
  player_agg AS (
    SELECT
      mp.player_name AS display_name,
      LOWER(TRIM(mp.player_name)) AS norm_name,
      SUM(mp.kills) AS k_raw,
      SUM(mp.deaths) AS d_raw,
      COUNT(*) AS matches
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    GROUP BY mp.player_name
  ),
  player_adj AS (
    SELECT
      pa.display_name,
      pa.norm_name,
      GREATEST(pa.k_raw - COALESCE(ff.ffk, 0), 0)::bigint AS k,
      GREATEST(pa.d_raw - COALESCE(ff.ffd, 0), 0)::bigint AS d,
      pa.matches::bigint AS matches
    FROM player_agg pa
    LEFT JOIN ff_totals ff ON LOWER(ff.player_name) = pa.norm_name
  ),
  with_class AS (
    SELECT
      pa.display_name,
      ch.class AS cname,
      pa.k,
      pa.d,
      pa.matches,
      CASE WHEN pa.d = 0 THEN pa.k::numeric ELSE ROUND(pa.k::numeric / pa.d::numeric, 2) END AS kda_calc
    FROM player_adj pa
    INNER JOIN characters ch ON LOWER(ch.name) = pa.norm_name
      AND ch.banned = false
      AND ch.class IS NOT NULL
      AND TRIM(ch.class) <> ''
  ),
  scored AS (
    SELECT
      wc.*,
      ROUND((wc.k * 3)::numeric + (wc.kda_calc * 2)::numeric - (wc.d * 1.5)::numeric, 2) AS escore
    FROM with_class wc
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (PARTITION BY s.cname ORDER BY s.escore DESC) AS rn_best,
      ROW_NUMBER() OVER (PARTITION BY s.cname ORDER BY s.escore ASC) AS rn_worst
    FROM scored s
  )
  SELECT
    r.cname::text,
    r.display_name::text,
    r.k,
    r.d,
    r.kda_calc,
    r.matches,
    r.escore,
    (r.rn_best = 1) AS is_best
  FROM ranked r
  WHERE r.rn_best = 1 OR r.rn_worst = 1;
END;
$function$;