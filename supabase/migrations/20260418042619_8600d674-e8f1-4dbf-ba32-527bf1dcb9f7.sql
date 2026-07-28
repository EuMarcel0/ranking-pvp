CREATE OR REPLACE FUNCTION public.get_ranking_fogo_amigo(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE(
  player_name text,
  player_class text,
  player_class_short text,
  player_guild text,
  friendly_kills bigint,
  friendly_deaths bigint,
  kda numeric,
  event_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
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
  friendly_logs AS (
    SELECT kl.killer_name, kl.victim_name, ck.guild AS guild_name
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    INNER JOIN characters ck ON ck.name = kl.killer_name AND ck.banned = false
    INNER JOIN characters cv ON cv.name = kl.victim_name AND cv.banned = false
    WHERE ck.guild = cv.guild
      AND ck.guild IS NOT NULL AND ck.guild <> ''
      AND kl.killer_name <> kl.victim_name
  ),
  kills_agg AS (
    SELECT killer_name AS name, COUNT(*) AS kills
    FROM friendly_logs
    GROUP BY killer_name
  ),
  deaths_agg AS (
    SELECT victim_name AS name, COUNT(*) AS deaths
    FROM friendly_logs
    GROUP BY victim_name
  ),
  combined AS (
    SELECT
      COALESCE(k.name, d.name) AS pname,
      COALESCE(k.kills, 0) AS total_k,
      COALESCE(d.deaths, 0) AS total_d
    FROM kills_agg k
    FULL OUTER JOIN deaths_agg d ON k.name = d.name
  )
  SELECT
    c.pname AS player_name,
    COALESCE(ch.class, '')::text AS player_class,
    COALESCE(ch.class_short, '')::text AS player_class_short,
    COALESCE(ch.guild, '')::text AS player_guild,
    c.total_k AS friendly_kills,
    c.total_d AS friendly_deaths,
    CASE WHEN c.total_d = 0 THEN c.total_k::numeric
         ELSE ROUND(c.total_k::numeric / c.total_d::numeric, 2) END AS kda,
    ROUND(
      (c.total_k * 3)::numeric
      + (CASE WHEN c.total_d = 0 THEN c.total_k::numeric ELSE c.total_k::numeric / c.total_d::numeric END) * 2
      - (c.total_d * 1.5)::numeric
    , 2) AS event_score
  FROM combined c
  LEFT JOIN characters ch ON ch.name = c.pname AND ch.banned = false
  WHERE c.total_k > 0
  ORDER BY c.total_k DESC, event_score DESC;
END;
$function$;