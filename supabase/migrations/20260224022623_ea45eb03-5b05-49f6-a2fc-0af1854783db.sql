
-- Índices para melhorar performance das queries de pvp_matches
CREATE INDEX IF NOT EXISTS idx_pvp_matches_event_type ON pvp_matches(event_type);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_event_type_date ON pvp_matches(event_type, match_date);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_hour ON pvp_matches(match_hour);

-- Índice para pvp_kill_logs por match_id (acelera JOINs)
CREATE INDEX IF NOT EXISTS idx_pvp_kill_logs_match_id ON pvp_kill_logs(match_id);

-- Função RPC para agregação server-side do Ranking Geral
CREATE OR REPLACE FUNCTION public.get_ranking_geral(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL
)
RETURNS TABLE (
  player_name text,
  player_class text,
  player_guild text,
  total_kills bigint,
  total_deaths bigint,
  kda numeric,
  weighted_kda numeric,
  matches_played bigint,
  event_score numeric,
  single_match_max_kills bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_matches bigint;
BEGIN
  -- Contar total de partidas boss_event com filtros
  SELECT COUNT(DISTINCT m.id) INTO v_total_matches
  FROM pvp_matches m
  WHERE m.event_type = 'boss_event'
    AND (p_date_from IS NULL OR m.match_date >= p_date_from)
    AND (p_date_to IS NULL OR m.match_date <= p_date_to)
    AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
    AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to);

  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS match_id
    FROM pvp_matches m
    WHERE m.event_type = 'boss_event'
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
      AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
      AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
  ),
  -- Agregar kills por jogador
  kills_agg AS (
    SELECT 
      kl.killer_name AS name,
      COUNT(*) AS kills,
      COUNT(DISTINCT kl.match_id) AS kill_matches
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.match_id
    WHERE NOT EXISTS (
      SELECT 1 FROM characters c WHERE c.name = kl.killer_name AND c.banned = true
    )
    GROUP BY kl.killer_name
  ),
  -- Agregar deaths por jogador
  deaths_agg AS (
    SELECT 
      kl.victim_name AS name,
      COUNT(*) AS deaths,
      COUNT(DISTINCT kl.match_id) AS death_matches
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.match_id
    WHERE NOT EXISTS (
      SELECT 1 FROM characters c WHERE c.name = kl.victim_name AND c.banned = true
    )
    GROUP BY kl.victim_name
  ),
  -- Max kills em uma única partida por jogador
  per_match_kills AS (
    SELECT 
      kl.killer_name AS name,
      MAX(kill_count) AS max_kills_single_match
    FROM (
      SELECT killer_name, match_id, COUNT(*) AS kill_count
      FROM pvp_kill_logs kl2
      INNER JOIN filtered_matches fm ON kl2.match_id = fm.match_id
      GROUP BY killer_name, match_id
    ) kl
    GROUP BY kl.killer_name
  ),
  -- Combinar kills e deaths
  combined AS (
    SELECT
      COALESCE(k.name, d.name) AS pname,
      COALESCE(k.kills, 0) AS total_k,
      COALESCE(d.deaths, 0) AS total_d,
      -- Número de partidas distintas onde o jogador apareceu
      (
        SELECT COUNT(DISTINCT sub_match_id) FROM (
          SELECT kl3.match_id AS sub_match_id FROM pvp_kill_logs kl3
          INNER JOIN filtered_matches fm3 ON kl3.match_id = fm3.match_id
          WHERE kl3.killer_name = COALESCE(k.name, d.name) OR kl3.victim_name = COALESCE(k.name, d.name)
        ) sub
      ) AS total_matches,
      COALESCE(pmk.max_kills_single_match, 0) AS max_single
    FROM kills_agg k
    FULL OUTER JOIN deaths_agg d ON k.name = d.name
    LEFT JOIN per_match_kills pmk ON COALESCE(k.name, d.name) = pmk.name
  )
  SELECT
    c2.pname AS player_name,
    COALESCE(ch.class, '') AS player_class,
    COALESCE(ch.guild, '') AS player_guild,
    c2.total_k AS total_kills,
    c2.total_d AS total_deaths,
    CASE WHEN c2.total_d = 0 THEN c2.total_k::numeric ELSE ROUND(c2.total_k::numeric / c2.total_d::numeric, 2) END AS kda,
    CASE WHEN v_total_matches = 0 THEN 0
      ELSE ROUND(
        (CASE WHEN c2.total_d = 0 THEN c2.total_k::numeric ELSE c2.total_k::numeric / c2.total_d::numeric END) 
        * (c2.total_matches::numeric / v_total_matches::numeric), 2
      )
    END AS weighted_kda,
    c2.total_matches AS matches_played,
    ROUND((c2.total_k * 3)::numeric + 
      (CASE WHEN c2.total_d = 0 THEN c2.total_k::numeric ELSE c2.total_k::numeric / c2.total_d::numeric END) * 2 
      - (c2.total_d * 1.5)::numeric, 2) AS event_score,
    c2.max_single AS single_match_max_kills
  FROM combined c2
  LEFT JOIN characters ch ON ch.name = c2.pname AND ch.banned = false
  WHERE c2.total_k > 0 OR c2.total_d > 0;
END;
$$;
