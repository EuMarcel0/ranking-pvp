
-- =============================================================
-- FASE 1.1 — Índices compostos adicionais
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_pvp_matches_date_event_hour
  ON public.pvp_matches USING btree (match_date, event_type, match_hour);

CREATE INDEX IF NOT EXISTS idx_kill_logs_killer_match
  ON public.pvp_kill_logs USING btree (killer_name, match_id);

CREATE INDEX IF NOT EXISTS idx_kill_logs_victim_match
  ON public.pvp_kill_logs USING btree (victim_name, match_id);

CREATE INDEX IF NOT EXISTS idx_kill_logs_match_created
  ON public.pvp_kill_logs USING btree (match_id, created_at);

CREATE INDEX IF NOT EXISTS idx_match_players_match_player
  ON public.pvp_match_players USING btree (match_id, player_name);

CREATE INDEX IF NOT EXISTS idx_characters_name_banned
  ON public.characters USING btree (name, banned);


-- =============================================================
-- FASE 1.2 — RPCs
-- Todas SECURITY DEFINER, search_path=public, parâmetros opcionais
-- =============================================================


-- ---------- PUTINHA RANKING ----------
-- Pares vítima->algoz com 10+ mortes; exclui dominação mútua (ambos 10+)
CREATE OR REPLACE FUNCTION public.get_ranking_putinha(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  victim_name text,
  killer_name text,
  victim_guild text,
  killer_guild text,
  deaths bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  pair_counts AS (
    SELECT kl.victim_name AS vname, kl.killer_name AS kname, COUNT(*) AS cnt
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    WHERE kl.killer_name <> kl.victim_name
    GROUP BY kl.victim_name, kl.killer_name
    HAVING COUNT(*) >= 10
  ),
  -- Excluir mútua dominação (par invertido também tem 10+)
  filtered_pairs AS (
    SELECT a.vname, a.kname, a.cnt
    FROM pair_counts a
    WHERE NOT EXISTS (
      SELECT 1 FROM pair_counts b
      WHERE b.vname = a.kname AND b.kname = a.vname
    )
  )
  SELECT
    fp.vname AS victim_name,
    fp.kname AS killer_name,
    COALESCE(cv.guild, '')::text AS victim_guild,
    COALESCE(ck.guild, '')::text AS killer_guild,
    fp.cnt AS deaths
  FROM filtered_pairs fp
  LEFT JOIN characters cv ON cv.name = fp.vname
  LEFT JOIN characters ck ON ck.name = fp.kname
  ORDER BY fp.cnt DESC, fp.vname ASC;
END;
$$;


-- ---------- NUNCA POSITIVO ----------
CREATE OR REPLACE FUNCTION public.get_ranking_nunca_positivo(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  player_name text,
  player_class text,
  player_guild text,
  matches_played bigint,
  best_kda numeric,
  total_kills bigint,
  total_deaths bigint,
  negative_count bigint,
  best_score numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  agg AS (
    SELECT
      mp.player_name AS pname,
      COUNT(*) AS matches,
      MAX(mp.kda) AS best_k,
      SUM(mp.kills) AS tk,
      SUM(mp.deaths) AS td,
      SUM(CASE WHEN mp.kda < 1 THEN 1 ELSE 0 END) AS neg,
      MAX((mp.kills * 3)::numeric + (mp.kda * 2)::numeric - (mp.deaths * 1.5)::numeric) AS best_s
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    GROUP BY mp.player_name
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
$$;


-- ---------- KILL STREAK ----------
-- Calcula maior streak de kills sem morrer por jogador, dentro de cada partida
CREATE OR REPLACE FUNCTION public.get_ranking_kill_streak(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  player_name text,
  max_streak integer,
  player_class text,
  player_class_short text,
  player_guild text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_player_streaks JSONB;
  v_player_max JSONB := '{}'::jsonb;
  v_current_match uuid := NULL;
  v_current_streak integer;
  v_global_max integer;
BEGIN
  -- Tabela temp para acumular max streaks
  CREATE TEMP TABLE IF NOT EXISTS _ks_tmp (
    pname text PRIMARY KEY,
    max_s integer
  ) ON COMMIT DROP;
  TRUNCATE _ks_tmp;

  FOR rec IN
    WITH filtered_matches AS (
      SELECT m.id AS mid
      FROM pvp_matches m
      WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
        AND (p_date_from IS NULL OR m.match_date >= p_date_from)
        AND (p_date_to IS NULL OR m.match_date <= p_date_to)
        AND (p_hour_from IS NULL OR m.match_hour >= p_hour_from)
        AND (p_hour_to IS NULL OR m.match_hour <= p_hour_to)
    )
    SELECT kl.match_id, kl.killer_name, kl.victim_name
    FROM pvp_kill_logs kl
    INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
    ORDER BY kl.match_id, kl.created_at ASC
  LOOP
    -- Reset por match
    IF v_current_match IS DISTINCT FROM rec.match_id THEN
      v_current_match := rec.match_id;
      v_player_streaks := '{}'::jsonb;
    END IF;

    -- Incrementa streak do killer
    v_current_streak := COALESCE((v_player_streaks ->> rec.killer_name)::int, 0) + 1;
    v_player_streaks := jsonb_set(v_player_streaks, ARRAY[rec.killer_name], to_jsonb(v_current_streak));

    -- Atualiza max global do killer
    v_global_max := COALESCE((v_player_max ->> rec.killer_name)::int, 0);
    IF v_current_streak > v_global_max THEN
      v_player_max := jsonb_set(v_player_max, ARRAY[rec.killer_name], to_jsonb(v_current_streak));
    END IF;

    -- Reset streak da vítima
    v_player_streaks := jsonb_set(v_player_streaks, ARRAY[rec.victim_name], to_jsonb(0));
  END LOOP;

  -- Retorna resultados
  RETURN QUERY
  SELECT
    k.key::text AS player_name,
    (k.value)::int AS max_streak,
    COALESCE(ch.class, '')::text AS player_class,
    COALESCE(ch.class_short, '')::text AS player_class_short,
    COALESCE(ch.guild, '')::text AS player_guild
  FROM jsonb_each_text(v_player_max) k
  LEFT JOIN characters ch ON ch.name = k.key AND ch.banned = false
  WHERE (k.value)::int >= 2
  ORDER BY (k.value)::int DESC;
END;
$$;


-- ---------- MURAL DA VERGONHA ----------
CREATE OR REPLACE FUNCTION public.get_ranking_mural_vergonha(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  player_name text,
  total_deaths bigint,
  total_kills bigint,
  matches_played bigint,
  avg_deaths_per_match numeric,
  player_guild text,
  player_class text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    a.td,
    a.tk,
    a.matches,
    CASE WHEN a.matches = 0 THEN 0 ELSE ROUND(a.td::numeric / a.matches::numeric, 2) END,
    COALESCE(ch.guild, '')::text,
    COALESCE(ch.class, '')::text
  FROM agg a
  LEFT JOIN characters ch ON LOWER(ch.name) = LOWER(a.pname) AND ch.banned = false
  WHERE a.td > 0
  ORDER BY a.td DESC;
END;
$$;


-- ---------- BEST/WORST PER CLASS ----------
CREATE OR REPLACE FUNCTION public.get_ranking_best_per_class(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_event_type text DEFAULT 'boss_event'
)
RETURNS TABLE (
  class_name text,
  player_name text,
  total_kills bigint,
  total_deaths bigint,
  total_kda numeric,
  match_count bigint,
  event_score numeric,
  is_best boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid
    FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
  ),
  player_agg AS (
    SELECT
      mp.player_name AS display_name,
      LOWER(TRIM(mp.player_name)) AS norm_name,
      SUM(mp.kills) AS k,
      SUM(mp.deaths) AS d,
      COUNT(*) AS matches
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    GROUP BY mp.player_name
  ),
  with_class AS (
    SELECT
      pa.display_name,
      ch.class AS cname,
      pa.k,
      pa.d,
      pa.matches,
      CASE WHEN pa.d = 0 THEN pa.k::numeric ELSE ROUND(pa.k::numeric / pa.d::numeric, 2) END AS kda_calc
    FROM player_agg pa
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
$$;


-- ---------- REIS DO PVP / CONE MONODEDO ----------
CREATE OR REPLACE FUNCTION public.get_ranking_reis_pvp(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  player_name text,
  is_rei boolean,
  vezes bigint,
  melhor_score numeric,
  pior_score numeric,
  media_score numeric,
  extreme_match_date date,
  extreme_match_hour integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid, m.match_date, m.match_hour
    FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
  ),
  scored AS (
    SELECT
      mp.match_id,
      mp.player_name,
      ROUND((mp.kills * 3)::numeric + (mp.kda * 2)::numeric - (mp.deaths * 1.5)::numeric, 2) AS escore,
      fm.match_date,
      fm.match_hour
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (PARTITION BY s.match_id ORDER BY s.escore DESC, s.player_name ASC) AS rn_top,
      ROW_NUMBER() OVER (PARTITION BY s.match_id ORDER BY s.escore ASC, s.player_name ASC) AS rn_bot
    FROM scored s
  ),
  reis AS (
    SELECT player_name AS pname, escore, match_date, match_hour FROM ranked WHERE rn_top = 1
  ),
  cones AS (
    SELECT player_name AS pname, escore, match_date, match_hour FROM ranked WHERE rn_bot = 1
  ),
  rei_agg AS (
    SELECT
      r.pname,
      true AS is_rei,
      COUNT(*) AS vezes,
      MAX(r.escore) AS melhor,
      MIN(r.escore) AS pior,
      ROUND(AVG(r.escore), 2) AS media,
      (SELECT r2.match_date FROM reis r2 WHERE r2.pname = r.pname ORDER BY r2.escore DESC LIMIT 1) AS edate,
      (SELECT r2.match_hour FROM reis r2 WHERE r2.pname = r.pname ORDER BY r2.escore DESC LIMIT 1) AS ehour
    FROM reis r
    GROUP BY r.pname
  ),
  cone_agg AS (
    SELECT
      c.pname,
      false AS is_rei,
      COUNT(*) AS vezes,
      MAX(c.escore) AS melhor,
      MIN(c.escore) AS pior,
      ROUND(AVG(c.escore), 2) AS media,
      (SELECT c2.match_date FROM cones c2 WHERE c2.pname = c.pname ORDER BY c2.escore ASC LIMIT 1) AS edate,
      (SELECT c2.match_hour FROM cones c2 WHERE c2.pname = c.pname ORDER BY c2.escore ASC LIMIT 1) AS ehour
    FROM cones c
    GROUP BY c.pname
  )
  SELECT * FROM rei_agg
  UNION ALL
  SELECT * FROM cone_agg;
END;
$$;


-- ---------- CLASS MATCHUP MATRIX ----------
CREATE OR REPLACE FUNCTION public.get_class_matchup_matrix(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  attacker_class text,
  victim_class text,
  kills bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_matches AS (
    SELECT m.id AS mid
    FROM pvp_matches m
    WHERE (p_event_type IS NULL OR p_event_type = 'all' OR m.event_type = p_event_type)
      AND (p_date_from IS NULL OR m.match_date >= p_date_from)
      AND (p_date_to IS NULL OR m.match_date <= p_date_to)
  )
  SELECT
    ck.class::text AS attacker_class,
    cv.class::text AS victim_class,
    COUNT(*) AS kills
  FROM pvp_kill_logs kl
  INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
  INNER JOIN characters ck ON LOWER(ck.name) = LOWER(kl.killer_name) AND ck.banned = false
  INNER JOIN characters cv ON LOWER(cv.name) = LOWER(kl.victim_name) AND cv.banned = false
  WHERE ck.class IS NOT NULL AND cv.class IS NOT NULL
    AND TRIM(ck.class) <> '' AND TRIM(cv.class) <> ''
  GROUP BY ck.class, cv.class;
END;
$$;


-- ---------- CLASS / GUILD RANKING ----------
CREATE OR REPLACE FUNCTION public.get_class_guild_ranking(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_hour_from integer DEFAULT NULL,
  p_hour_to integer DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  player_name text,
  player_class text,
  player_guild text,
  kills bigint,
  deaths bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  agg AS (
    SELECT
      mp.player_name AS pname,
      SUM(mp.kills) AS k,
      SUM(mp.deaths) AS d
    FROM pvp_match_players mp
    INNER JOIN filtered_matches fm ON mp.match_id = fm.mid
    GROUP BY mp.player_name
  )
  SELECT
    a.pname::text,
    COALESCE(ch.class, '')::text,
    COALESCE(ch.guild, '')::text,
    a.k,
    a.d
  FROM agg a
  LEFT JOIN characters ch ON LOWER(ch.name) = LOWER(a.pname) AND ch.banned = false;
END;
$$;
