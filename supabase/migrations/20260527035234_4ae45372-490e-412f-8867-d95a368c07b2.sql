CREATE OR REPLACE FUNCTION public.get_ranking_geral(
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_hour_from integer DEFAULT NULL::integer,
  p_hour_to integer DEFAULT NULL::integer
)
RETURNS TABLE(
  player_name text,
  player_class text,
  player_guild text,
  total_kills bigint,
  total_deaths bigint,
  kda numeric,
  weighted_kda numeric,
  matches_played bigint,
  event_score numeric,
  single_match_max_kills bigint,
  player_class_short text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_matches bigint;
BEGIN
  SELECT COUNT(DISTINCT m.id) INTO v_total_matches
  FROM public.pvp_matches m
  WHERE m.event_type = 'boss_event'
    AND (p_date_from IS NULL OR m.match_date >= p_date_from)
    AND (p_date_to IS NULL OR m.match_date <= p_date_to)
    AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
    AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to);

  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid
    FROM public.pvp_matches m
    WHERE m.event_type = 'boss_event'
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  ),
  friendly_fire AS (
    SELECT
      ff.match_id,
      LOWER(TRIM(ff.player_name)) AS norm_name,
      SUM(ff.ff_kills)::bigint AS ff_kills,
      SUM(ff.ff_deaths)::bigint AS ff_deaths
    FROM public.v_friendly_fire_per_match ff
    INNER JOIN filtered_matches fm ON fm.mid = ff.match_id
    GROUP BY ff.match_id, LOWER(TRIM(ff.player_name))
  ),
  per_match AS (
    SELECT
      mp.player_name AS pname,
      LOWER(TRIM(mp.player_name)) AS norm_name,
      mp.match_id,
      GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::bigint AS adj_kills,
      GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::bigint AS adj_deaths
    FROM public.pvp_match_players mp
    INNER JOIN filtered_matches fm ON fm.mid = mp.match_id
    LEFT JOIN friendly_fire ff
      ON ff.match_id = mp.match_id
     AND ff.norm_name = LOWER(TRIM(mp.player_name))
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.characters bc
      WHERE LOWER(TRIM(bc.name)) = LOWER(TRIM(mp.player_name))
        AND bc.banned = true
    )
  ),
  aggregated AS (
    SELECT
      pm.norm_name,
      MIN(pm.pname) AS display_name,
      SUM(pm.adj_kills)::bigint AS total_k,
      SUM(pm.adj_deaths)::bigint AS total_d,
      COUNT(DISTINCT pm.match_id)::bigint AS total_matches,
      MAX(pm.adj_kills)::bigint AS max_single
    FROM per_match pm
    GROUP BY pm.norm_name
  )
  SELECT
    a.display_name AS player_name,
    COALESCE(ch.class, '')::text AS player_class,
    COALESCE(ch.guild, '')::text AS player_guild,
    a.total_k AS total_kills,
    a.total_d AS total_deaths,
    CASE
      WHEN a.total_d = 0 THEN a.total_k::numeric
      ELSE ROUND(a.total_k::numeric / a.total_d::numeric, 2)
    END AS kda,
    CASE
      WHEN v_total_matches = 0 THEN 0::numeric
      ELSE ROUND(
        (CASE WHEN a.total_d = 0 THEN a.total_k::numeric ELSE a.total_k::numeric / a.total_d::numeric END)
        * (a.total_matches::numeric / v_total_matches::numeric),
        2
      )
    END AS weighted_kda,
    a.total_matches AS matches_played,
    ROUND(
      (a.total_k * 3)::numeric
      + (CASE WHEN a.total_d = 0 THEN a.total_k::numeric ELSE a.total_k::numeric / a.total_d::numeric END) * 2
      - (a.total_d * 1.5)::numeric,
      2
    ) AS event_score,
    a.max_single AS single_match_max_kills,
    COALESCE(ch.class_short, '')::text AS player_class_short
  FROM aggregated a
  LEFT JOIN public.characters ch
    ON LOWER(TRIM(ch.name)) = a.norm_name
   AND ch.banned = false
  WHERE a.total_k > 0 OR a.total_d > 0;
END;
$function$;