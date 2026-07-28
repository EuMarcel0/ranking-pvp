-- Atualiza fórmula de pontuação para: (kills*3) + (kda*1) + (participação*1) - (deaths*3)
-- Onde participação = matches_played em agregados, ou 1 em por-partida

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
    SELECT ff.match_id, LOWER(TRIM(ff.player_name)) AS norm_name,
      SUM(ff.ff_kills)::bigint AS ff_kills, SUM(ff.ff_deaths)::bigint AS ff_deaths
    FROM public.v_friendly_fire_per_match ff
    INNER JOIN filtered_matches fm ON fm.mid = ff.match_id
    GROUP BY ff.match_id, LOWER(TRIM(ff.player_name))
  ),
  per_match AS (
    SELECT mp.player_name AS pname, LOWER(TRIM(mp.player_name)) AS norm_name, mp.match_id,
      GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::bigint AS adj_kills,
      GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::bigint AS adj_deaths
    FROM public.pvp_match_players mp
    INNER JOIN filtered_matches fm ON fm.mid = mp.match_id
    LEFT JOIN friendly_fire ff ON ff.match_id = mp.match_id AND ff.norm_name = LOWER(TRIM(mp.player_name))
    WHERE NOT EXISTS (SELECT 1 FROM public.characters bc WHERE LOWER(TRIM(bc.name)) = LOWER(TRIM(mp.player_name)) AND bc.banned = true)
  ),
  aggregated AS (
    SELECT pm.norm_name, MIN(pm.pname) AS display_name,
      SUM(pm.adj_kills)::bigint AS total_k,
      SUM(pm.adj_deaths)::bigint AS total_d,
      COUNT(DISTINCT pm.match_id)::bigint AS total_matches,
      MAX(pm.adj_kills)::bigint AS max_single
    FROM per_match pm GROUP BY pm.norm_name
  )
  SELECT
    a.display_name, COALESCE(ch.class, '')::text, COALESCE(ch.guild, '')::text,
    a.total_k, a.total_d,
    CASE WHEN a.total_d = 0 THEN a.total_k::numeric ELSE ROUND(a.total_k::numeric / a.total_d::numeric, 2) END,
    CASE WHEN v_total_matches = 0 THEN 0::numeric
      ELSE ROUND((CASE WHEN a.total_d = 0 THEN a.total_k::numeric ELSE a.total_k::numeric / a.total_d::numeric END)
        * (a.total_matches::numeric / v_total_matches::numeric), 2) END,
    a.total_matches,
    ROUND(
      (a.total_k * 3)::numeric
      + (CASE WHEN a.total_d = 0 THEN a.total_k::numeric ELSE a.total_k::numeric / a.total_d::numeric END) * 1
      + (a.total_matches)::numeric * 1
      - (a.total_d * 3)::numeric, 2),
    a.max_single,
    COALESCE(ch.class_short, '')::text
  FROM aggregated a
  LEFT JOIN public.characters ch ON LOWER(TRIM(ch.name)) = a.norm_name AND ch.banned = false
  WHERE a.total_k > 0 OR a.total_d > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking_fogo_amigo(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_hour_from integer DEFAULT NULL::integer, p_hour_to integer DEFAULT NULL::integer, p_event_type text DEFAULT NULL::text)
 RETURNS TABLE(player_name text, player_class text, player_class_short text, player_guild text, friendly_kills bigint, friendly_deaths bigint, kda numeric, event_score numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  ),
  friendly_logs AS (
    SELECT kl.killer_name, kl.victim_name, kl.match_id, ck.guild AS guild_name
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    INNER JOIN characters ck ON ck.name = kl.killer_name AND ck.banned = false
    INNER JOIN characters cv ON cv.name = kl.victim_name AND cv.banned = false
    WHERE ck.guild = cv.guild AND ck.guild IS NOT NULL AND ck.guild <> '' AND kl.killer_name <> kl.victim_name
  ),
  kills_agg AS (SELECT killer_name AS name, COUNT(*) AS kills, COUNT(DISTINCT match_id) AS matches FROM friendly_logs GROUP BY killer_name),
  deaths_agg AS (SELECT victim_name AS name, COUNT(*) AS deaths, COUNT(DISTINCT match_id) AS matches FROM friendly_logs GROUP BY victim_name),
  combined AS (
    SELECT COALESCE(k.name, d.name) AS pname,
      COALESCE(k.kills, 0) AS total_k, COALESCE(d.deaths, 0) AS total_d,
      GREATEST(COALESCE(k.matches, 0), COALESCE(d.matches, 0)) AS total_m
    FROM kills_agg k FULL OUTER JOIN deaths_agg d ON k.name = d.name
  )
  SELECT c.pname, COALESCE(ch.class, '')::text, COALESCE(ch.class_short, '')::text, COALESCE(ch.guild, '')::text,
    c.total_k, c.total_d,
    CASE WHEN c.total_d = 0 THEN c.total_k::numeric ELSE ROUND(c.total_k::numeric / c.total_d::numeric, 2) END,
    ROUND((c.total_k * 3)::numeric
      + (CASE WHEN c.total_d = 0 THEN c.total_k::numeric ELSE c.total_k::numeric / c.total_d::numeric END) * 1
      + c.total_m::numeric * 1
      - (c.total_d * 3)::numeric, 2)
  FROM combined c
  LEFT JOIN characters ch ON ch.name = c.pname AND ch.banned = false
  WHERE c.total_k > 0
  ORDER BY c.total_k DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking_reis_pvp(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_event_type text DEFAULT NULL::text)
 RETURNS TABLE(player_name text, is_rei boolean, vezes bigint, melhor_score numeric, pior_score numeric, media_score numeric, extreme_match_date date, extreme_match_hour integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid, m.match_date AS m_date, m.match_hour AS m_hour FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
  ),
  scored AS (
    SELECT mp.match_id AS s_mid, mp.player_name AS s_pname,
      GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric AS adj_k,
      GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric AS adj_d,
      ROUND(
        (GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0) * 3)::numeric
        + (CASE WHEN GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) = 0
                THEN GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                ELSE GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                     / GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric END) * 1
        + 1::numeric
        - (GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) * 3)::numeric
      , 2) AS s_score,
      fm.m_date AS s_date, fm.m_hour AS s_hour
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    LEFT JOIN v_friendly_fire_per_match ff ON ff.match_id = mp.match_id AND LOWER(ff.player_name) = LOWER(mp.player_name)
  ),
  ranked AS (
    SELECT s.*,
      ROW_NUMBER() OVER (PARTITION BY s.s_mid ORDER BY s.s_score DESC, s.s_pname ASC) AS rn_top,
      ROW_NUMBER() OVER (PARTITION BY s.s_mid ORDER BY s.s_score ASC, s.s_pname ASC) AS rn_bot
    FROM scored s
  ),
  reis AS (SELECT s_pname AS pname, s_score AS escore, s_date AS m_date, s_hour AS m_hour FROM ranked WHERE rn_top = 1),
  cones AS (SELECT s_pname AS pname, s_score AS escore, s_date AS m_date, s_hour AS m_hour FROM ranked WHERE rn_bot = 1),
  rei_extremes AS (SELECT DISTINCT ON (r.pname) r.pname, r.m_date, r.m_hour FROM reis r ORDER BY r.pname, r.escore DESC),
  cone_extremes AS (SELECT DISTINCT ON (c.pname) c.pname, c.m_date, c.m_hour FROM cones c ORDER BY c.pname, c.escore ASC),
  rei_agg AS (
    SELECT r.pname AS rp, true AS is_r, COUNT(*) AS vz, MAX(r.escore) AS mlhr, MIN(r.escore) AS pr, ROUND(AVG(r.escore), 2) AS md,
      re.m_date AS edt, re.m_hour AS ehr
    FROM reis r LEFT JOIN rei_extremes re ON re.pname = r.pname GROUP BY r.pname, re.m_date, re.m_hour
  ),
  cone_agg AS (
    SELECT c.pname AS rp, false AS is_r, COUNT(*) AS vz, MAX(c.escore) AS mlhr, MIN(c.escore) AS pr, ROUND(AVG(c.escore), 2) AS md,
      ce.m_date AS edt, ce.m_hour AS ehr
    FROM cones c LEFT JOIN cone_extremes ce ON ce.pname = c.pname GROUP BY c.pname, ce.m_date, ce.m_hour
  )
  SELECT rp, is_r, vz, mlhr, pr, md, edt, ehr FROM rei_agg
  UNION ALL
  SELECT rp, is_r, vz, mlhr, pr, md, edt, ehr FROM cone_agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking_nunca_positivo(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_hour_from integer DEFAULT NULL::integer, p_hour_to integer DEFAULT NULL::integer, p_event_type text DEFAULT NULL::text)
 RETURNS TABLE(player_name text, player_class text, player_guild text, matches_played bigint, best_kda numeric, total_kills bigint, total_deaths bigint, negative_count bigint, best_score numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  ),
  per_match_adj AS (
    SELECT mp.player_name AS pname, mp.match_id,
      GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric AS adj_k,
      GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric AS adj_d,
      CASE WHEN GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) = 0
           THEN GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
           ELSE ROUND(GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                      / GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric, 2)
      END AS adj_kda,
      ROUND(
        (GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0) * 3)::numeric
        + (CASE WHEN GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) = 0
                THEN GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                ELSE GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                     / GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric END) * 1
        + 1::numeric
        - (GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) * 3)::numeric
      , 2) AS adj_score
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    LEFT JOIN v_friendly_fire_per_match ff ON ff.match_id = mp.match_id AND LOWER(ff.player_name) = LOWER(mp.player_name)
  ),
  agg AS (
    SELECT pma.pname, COUNT(*) AS matches, MAX(pma.adj_kda) AS best_k,
      SUM(pma.adj_k)::bigint AS tk, SUM(pma.adj_d)::bigint AS td,
      SUM(CASE WHEN pma.adj_kda < 1 THEN 1 ELSE 0 END) AS neg,
      MAX(pma.adj_score) AS best_s
    FROM per_match_adj pma GROUP BY pma.pname
  )
  SELECT a.pname, COALESCE(ch.class, '')::text, COALESCE(ch.guild, '')::text, a.matches,
    ROUND(a.best_k, 2), a.tk, a.td, a.neg, ROUND(a.best_s, 2)
  FROM agg a
  LEFT JOIN characters ch ON LOWER(ch.name) = LOWER(a.pname) AND ch.banned = false
  WHERE a.neg > 0
  ORDER BY a.best_k ASC, a.matches DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking_best_per_class(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_event_type text DEFAULT 'boss_event'::text)
 RETURNS TABLE(class_name text, player_name text, total_kills bigint, total_deaths bigint, total_kda numeric, match_count bigint, event_score numeric, is_best boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid FROM pvp_matches m
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
    SELECT mp.player_name AS display_name, LOWER(TRIM(mp.player_name)) AS norm_name,
      SUM(mp.kills) AS k_raw, SUM(mp.deaths) AS d_raw, COUNT(*) AS matches
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    GROUP BY mp.player_name
  ),
  player_adj AS (
    SELECT pa.display_name, pa.norm_name,
      GREATEST(pa.k_raw - COALESCE(ff.ffk, 0), 0)::bigint AS k,
      GREATEST(pa.d_raw - COALESCE(ff.ffd, 0), 0)::bigint AS d,
      pa.matches::bigint AS matches
    FROM player_agg pa LEFT JOIN ff_totals ff ON LOWER(ff.player_name) = pa.norm_name
  ),
  with_class AS (
    SELECT pa.display_name, ch.class AS cname, pa.k, pa.d, pa.matches,
      CASE WHEN pa.d = 0 THEN pa.k::numeric ELSE ROUND(pa.k::numeric / pa.d::numeric, 2) END AS kda_calc
    FROM player_adj pa
    INNER JOIN characters ch ON LOWER(ch.name) = pa.norm_name
      AND ch.banned = false AND ch.class IS NOT NULL AND TRIM(ch.class) <> ''
  ),
  scored AS (
    SELECT wc.*,
      ROUND((wc.k * 3)::numeric + (wc.kda_calc * 1)::numeric + (wc.matches)::numeric * 1 - (wc.d * 3)::numeric, 2) AS escore
    FROM with_class wc
  ),
  ranked AS (
    SELECT s.*,
      ROW_NUMBER() OVER (PARTITION BY s.cname ORDER BY s.escore DESC) AS rn_best,
      ROW_NUMBER() OVER (PARTITION BY s.cname ORDER BY s.escore ASC) AS rn_worst
    FROM scored s
  )
  SELECT r.cname::text, r.display_name::text, r.k, r.d, r.kda_calc, r.matches, r.escore, (r.rn_best = 1) AS is_best
  FROM ranked r WHERE r.rn_best = 1 OR r.rn_worst = 1;
END;
$function$;