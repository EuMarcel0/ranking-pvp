-- =====================================================================
-- Helper view: por (match_id, player_name) em partidas de boss_event,
-- conta quantas kills/mortes foram fogo amigo (mesma guild).
-- =====================================================================
CREATE OR REPLACE VIEW public.v_friendly_fire_per_match AS
SELECT
  fl.match_id,
  fl.player_name,
  SUM(CASE WHEN fl.role = 'killer' THEN 1 ELSE 0 END) AS ff_kills,
  SUM(CASE WHEN fl.role = 'victim' THEN 1 ELSE 0 END) AS ff_deaths
FROM (
  SELECT kl.match_id, kl.killer_name AS player_name, 'killer'::text AS role
  FROM public.pvp_kill_logs kl
  INNER JOIN public.pvp_matches m ON m.id = kl.match_id AND m.event_type = 'boss_event'
  INNER JOIN public.characters ck ON ck.name = kl.killer_name AND ck.banned = false
  INNER JOIN public.characters cv ON cv.name = kl.victim_name AND cv.banned = false
  WHERE ck.guild = cv.guild AND ck.guild IS NOT NULL AND ck.guild <> ''
    AND kl.killer_name <> kl.victim_name
  UNION ALL
  SELECT kl.match_id, kl.victim_name, 'victim'::text
  FROM public.pvp_kill_logs kl
  INNER JOIN public.pvp_matches m ON m.id = kl.match_id AND m.event_type = 'boss_event'
  INNER JOIN public.characters ck ON ck.name = kl.killer_name AND ck.banned = false
  INNER JOIN public.characters cv ON cv.name = kl.victim_name AND cv.banned = false
  WHERE ck.guild = cv.guild AND ck.guild IS NOT NULL AND ck.guild <> ''
    AND kl.killer_name <> kl.victim_name
) fl
GROUP BY fl.match_id, fl.player_name;

-- =====================================================================
-- Ranking Geral (Boss): exclui logs de fogo amigo direto na origem.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_ranking_geral(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL
)
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
  -- Logs efetivos: exclui fogo amigo (mesma guild)
  effective_logs AS (
    SELECT kl.match_id, kl.killer_name, kl.victim_name
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    WHERE NOT EXISTS (
      SELECT 1 FROM characters ck
      INNER JOIN characters cv ON cv.guild = ck.guild
      WHERE ck.name = kl.killer_name AND cv.name = kl.victim_name
        AND ck.guild IS NOT NULL AND ck.guild <> ''
        AND ck.banned = false AND cv.banned = false
        AND kl.killer_name <> kl.victim_name
    )
  ),
  kills_agg AS (
    SELECT el.killer_name AS name, COUNT(*) AS kills
    FROM effective_logs el
    WHERE NOT EXISTS (SELECT 1 FROM characters c WHERE c.name = el.killer_name AND c.banned = true)
    GROUP BY el.killer_name
  ),
  deaths_agg AS (
    SELECT el.victim_name AS name, COUNT(*) AS deaths
    FROM effective_logs el
    WHERE NOT EXISTS (SELECT 1 FROM characters c WHERE c.name = el.victim_name AND c.banned = true)
    GROUP BY el.victim_name
  ),
  per_match_kills AS (
    SELECT sub.killer_name AS name, MAX(sub.kill_count) AS max_kills_single_match
    FROM (
      SELECT el.killer_name, el.match_id, COUNT(*) AS kill_count
      FROM effective_logs el
      GROUP BY el.killer_name, el.match_id
    ) sub
    GROUP BY sub.killer_name
  ),
  combined AS (
    SELECT
      COALESCE(k.name, d.name) AS pname,
      COALESCE(k.kills, 0) AS total_k,
      COALESCE(d.deaths, 0) AS total_d,
      (
        SELECT COUNT(DISTINCT el.match_id)
        FROM effective_logs el
        WHERE el.killer_name = COALESCE(k.name, d.name) OR el.victim_name = COALESCE(k.name, d.name)
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

-- =====================================================================
-- Mural da Vergonha: subtrai mortes/kills de fogo amigo em boss_event.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_ranking_mural_vergonha(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
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
    GREATEST(a.td - COALESCE(ff.ffd, 0), 0) AS total_deaths,
    GREATEST(a.tk - COALESCE(ff.ffk, 0), 0) AS total_kills,
    a.matches,
    CASE WHEN a.matches = 0 THEN 0
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

-- =====================================================================
-- Reis do PVP / Cones: recalcula kills/deaths/kda por partida descontando
-- fogo amigo, então recalcula score com a fórmula oficial.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_ranking_reis_pvp(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
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
      -- Ajusta kills/deaths descontando fogo amigo (apenas boss_event tem ff)
      GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric AS adj_k,
      GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric AS adj_d,
      ROUND(
        (GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0) * 3)::numeric
        + (CASE WHEN GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) = 0
                THEN GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                ELSE GREATEST(mp.kills - COALESCE(ff.ff_kills, 0), 0)::numeric
                     / GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric END) * 2
        - (GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) * 1.5)::numeric
      , 2) AS s_score,
      fm.m_date AS s_date,
      fm.m_hour AS s_hour
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    LEFT JOIN v_friendly_fire_per_match ff
      ON ff.match_id = mp.match_id AND LOWER(ff.player_name) = LOWER(mp.player_name)
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
    SELECT r.pname AS rp, true AS is_r, COUNT(*) AS vz,
      MAX(r.escore) AS mlhr, MIN(r.escore) AS pr, ROUND(AVG(r.escore), 2) AS md,
      re.m_date AS edt, re.m_hour AS ehr
    FROM reis r LEFT JOIN rei_extremes re ON re.pname = r.pname
    GROUP BY r.pname, re.m_date, re.m_hour
  ),
  cone_agg AS (
    SELECT c.pname AS rp, false AS is_r, COUNT(*) AS vz,
      MAX(c.escore) AS mlhr, MIN(c.escore) AS pr, ROUND(AVG(c.escore), 2) AS md,
      ce.m_date AS edt, ce.m_hour AS ehr
    FROM cones c LEFT JOIN cone_extremes ce ON ce.pname = c.pname
    GROUP BY c.pname, ce.m_date, ce.m_hour
  )
  SELECT rp, is_r, vz, mlhr, pr, md, edt, ehr FROM rei_agg
  UNION ALL
  SELECT rp, is_r, vz, mlhr, pr, md, edt, ehr FROM cone_agg;
END;
$function$;

-- =====================================================================
-- Nunca Positivo: ajusta KDA/score por partida descontando fogo amigo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_ranking_nunca_positivo(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE(player_name text, player_class text, player_guild text, matches_played bigint, best_kda numeric, total_kills bigint, total_deaths bigint, negative_count bigint, best_score numeric)
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
  per_match_adj AS (
    SELECT
      mp.player_name AS pname,
      mp.match_id,
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
                     / GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0)::numeric END) * 2
        - (GREATEST(mp.deaths - COALESCE(ff.ff_deaths, 0), 0) * 1.5)::numeric
      , 2) AS adj_score
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    LEFT JOIN v_friendly_fire_per_match ff
      ON ff.match_id = mp.match_id AND LOWER(ff.player_name) = LOWER(mp.player_name)
  ),
  agg AS (
    SELECT
      pma.pname,
      COUNT(*) AS matches,
      MAX(pma.adj_kda) AS best_k,
      SUM(pma.adj_k)::bigint AS tk,
      SUM(pma.adj_d)::bigint AS td,
      SUM(CASE WHEN pma.adj_kda < 1 THEN 1 ELSE 0 END) AS neg,
      MAX(pma.adj_score) AS best_s
    FROM per_match_adj pma
    GROUP BY pma.pname
  )
  SELECT
    a.pname,
    COALESCE(ch.class, '')::text,
    COALESCE(ch.guild, '')::text,
    a.matches,
    ROUND(a.best_k, 2),
    a.tk,
    a.td,
    a.neg,
    ROUND(a.best_s, 2)
  FROM agg a
  LEFT JOIN characters ch ON LOWER(ch.name) = LOWER(a.pname) AND ch.banned = false
  WHERE a.neg > 0
  ORDER BY a.best_k ASC, a.matches DESC;
END;
$function$;

-- =====================================================================
-- Best per Class: agrega kills/deaths já descontando fogo amigo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_ranking_best_per_class(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_event_type text DEFAULT 'boss_event'
)
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
      GREATEST(pa.k_raw - COALESCE(ff.ffk, 0), 0) AS k,
      GREATEST(pa.d_raw - COALESCE(ff.ffd, 0), 0) AS d,
      pa.matches
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