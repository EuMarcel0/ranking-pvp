
-- ============ SEASONS TABLE ============
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  started_at date NOT NULL,
  ended_at date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

CREATE INDEX idx_seasons_status ON public.seasons(status);
CREATE INDEX idx_seasons_year_month ON public.seasons(year, month DESC);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view seasons" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "Admins can insert seasons" ON public.seasons FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update seasons" ON public.seasons FOR UPDATE USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete seasons" ON public.seasons FOR DELETE USING (has_role(auth.uid(),'admin'));

-- ============ SEASON SNAPSHOTS ============
CREATE TABLE public.season_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  ranking_type text NOT NULL,
  position integer NOT NULL,
  player_name text NOT NULL,
  player_class text,
  player_guild text,
  score numeric NOT NULL DEFAULT 0,
  extra_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_season_snapshots_season ON public.season_snapshots(season_id);
CREATE INDEX idx_season_snapshots_type ON public.season_snapshots(season_id, ranking_type, position);

ALTER TABLE public.season_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view snapshots" ON public.season_snapshots FOR SELECT USING (true);
CREATE POLICY "Admins can insert snapshots" ON public.season_snapshots FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete snapshots" ON public.season_snapshots FOR DELETE USING (has_role(auth.uid(),'admin'));

-- ============ HELPER: get_active_season ============
CREATE OR REPLACE FUNCTION public.get_active_season()
RETURNS TABLE(id uuid, name text, year int, month int, started_at date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT s.id INTO v_id FROM seasons s WHERE s.status = 'active' ORDER BY s.year DESC, s.month DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT s.id, s.name, s.year, s.month, s.started_at FROM seasons s WHERE s.id = v_id;
END;
$$;

-- ============ CLOSE SEASON ============
CREATE OR REPLACE FUNCTION public.close_current_season()
RETURNS TABLE(closed_season_id uuid, new_season_id uuid, snapshots_created int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_active_id uuid;
  v_active_started date;
  v_year int;
  v_month int;
  v_new_year int;
  v_new_month int;
  v_new_id uuid;
  v_count int := 0;
  v_now date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  -- Permite apenas admin OU service_role (cron)
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT s.id, s.year, s.month, s.started_at
    INTO v_active_id, v_year, v_month, v_active_started
  FROM seasons s WHERE s.status = 'active' ORDER BY s.year DESC, s.month DESC LIMIT 1;

  IF v_active_id IS NULL THEN
    -- Nenhuma ativa: cria a do mês corrente e retorna
    INSERT INTO seasons (name, year, month, started_at)
    VALUES (
      'Temporada ' || EXTRACT(MONTH FROM v_now) || '/' || EXTRACT(YEAR FROM v_now),
      EXTRACT(YEAR FROM v_now)::int,
      EXTRACT(MONTH FROM v_now)::int,
      date_trunc('month', v_now)::date
    )
    ON CONFLICT (year, month) DO UPDATE SET status='active'
    RETURNING id INTO v_new_id;
    RETURN QUERY SELECT NULL::uuid, v_new_id, 0;
    RETURN;
  END IF;

  -- ===== Snapshots Top 10 =====
  -- Usa janela de datas da temporada (start até hoje)
  -- Ranking Geral
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score, extra_data)
  SELECT v_active_id, 'geral', ROW_NUMBER() OVER (ORDER BY r.event_score DESC),
         r.player_name, r.player_class, r.player_guild, r.event_score,
         jsonb_build_object('kills', r.total_kills, 'deaths', r.total_deaths, 'kda', r.kda, 'matches', r.matches_played)
  FROM get_ranking_geral(v_active_started, v_now, NULL, NULL) r
  ORDER BY r.event_score DESC LIMIT 10;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Reis do PVP
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, score, extra_data)
  SELECT v_active_id, 'reis_pvp', ROW_NUMBER() OVER (ORDER BY r.vezes DESC, r.melhor_score DESC),
         r.player_name, r.melhor_score,
         jsonb_build_object('vezes', r.vezes, 'media', r.media_score)
  FROM get_ranking_reis_pvp(v_active_started, v_now, 'all') r
  WHERE r.is_rei = true
  ORDER BY r.vezes DESC, r.melhor_score DESC LIMIT 10;
  v_count := v_count + COALESCE((SELECT COUNT(*) FROM season_snapshots WHERE season_id=v_active_id AND ranking_type='reis_pvp'), 0);

  -- Cones Monodedo
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, score, extra_data)
  SELECT v_active_id, 'cones', ROW_NUMBER() OVER (ORDER BY r.vezes DESC, r.pior_score ASC),
         r.player_name, r.pior_score,
         jsonb_build_object('vezes', r.vezes, 'media', r.media_score)
  FROM get_ranking_reis_pvp(v_active_started, v_now, 'all') r
  WHERE r.is_rei = false
  ORDER BY r.vezes DESC, r.pior_score ASC LIMIT 10;

  -- Kill Streak
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score)
  SELECT v_active_id, 'kill_streak', ROW_NUMBER() OVER (ORDER BY r.max_streak DESC),
         r.player_name, r.player_class, r.player_guild, r.max_streak
  FROM get_ranking_kill_streak(v_active_started, v_now, NULL, NULL, 'all') r
  ORDER BY r.max_streak DESC LIMIT 10;

  -- Mural da Vergonha
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score, extra_data)
  SELECT v_active_id, 'mural_vergonha', ROW_NUMBER() OVER (ORDER BY r.total_deaths DESC),
         r.player_name, r.player_class, r.player_guild, r.total_deaths,
         jsonb_build_object('matches', r.matches_played, 'avg', r.avg_deaths_per_match)
  FROM get_ranking_mural_vergonha(v_active_started, v_now, NULL, NULL, 'all') r
  ORDER BY r.total_deaths DESC LIMIT 10;

  -- Fogo Amigo
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score, extra_data)
  SELECT v_active_id, 'fogo_amigo', ROW_NUMBER() OVER (ORDER BY r.event_score DESC),
         r.player_name, r.player_class, r.player_guild, r.event_score,
         jsonb_build_object('friendly_kills', r.friendly_kills, 'friendly_deaths', r.friendly_deaths)
  FROM get_ranking_fogo_amigo(v_active_started, v_now, NULL, NULL, 'all') r
  ORDER BY r.event_score DESC LIMIT 10;

  -- Putinha (par dominador → vítima)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, score, extra_data)
  SELECT v_active_id, 'putinha', ROW_NUMBER() OVER (ORDER BY p.deaths DESC),
         p.killer_name || ' → ' || p.victim_name, p.deaths,
         jsonb_build_object('killer', p.killer_name, 'victim', p.victim_name, 'killer_guild', p.killer_guild, 'victim_guild', p.victim_guild)
  FROM get_ranking_putinha(v_active_started, v_now, NULL, NULL, 'all') p
  ORDER BY p.deaths DESC LIMIT 10;

  -- Fecha temporada atual
  UPDATE seasons SET status='closed', ended_at=v_now, closed_at=now() WHERE id = v_active_id;

  -- Cria próxima temporada
  v_new_month := v_month + 1;
  v_new_year := v_year;
  IF v_new_month > 12 THEN
    v_new_month := 1;
    v_new_year := v_new_year + 1;
  END IF;

  INSERT INTO seasons (name, year, month, started_at)
  VALUES ('Temporada ' || v_new_month || '/' || v_new_year, v_new_year, v_new_month,
          make_date(v_new_year, v_new_month, 1))
  ON CONFLICT (year, month) DO UPDATE SET status='active'
  RETURNING id INTO v_new_id;

  SELECT COUNT(*) INTO v_count FROM season_snapshots WHERE season_id = v_active_id;

  RETURN QUERY SELECT v_active_id, v_new_id, v_count;
END;
$$;

-- ============ Inicializa temporada ativa atual (se nenhuma existe) ============
INSERT INTO seasons (name, year, month, started_at)
SELECT 'Temporada ' || EXTRACT(MONTH FROM CURRENT_DATE) || '/' || EXTRACT(YEAR FROM CURRENT_DATE),
       EXTRACT(YEAR FROM CURRENT_DATE)::int,
       EXTRACT(MONTH FROM CURRENT_DATE)::int,
       date_trunc('month', CURRENT_DATE)::date
WHERE NOT EXISTS (SELECT 1 FROM seasons WHERE status='active')
ON CONFLICT (year, month) DO NOTHING;
