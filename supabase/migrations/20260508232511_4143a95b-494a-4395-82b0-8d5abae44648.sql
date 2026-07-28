CREATE OR REPLACE FUNCTION public.close_current_season()
 RETURNS TABLE(closed_season_id uuid, new_season_id uuid, snapshots_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT s.id, s.year, s.month, s.started_at
    INTO v_active_id, v_year, v_month, v_active_started
  FROM seasons s WHERE s.status = 'active' ORDER BY s.year DESC, s.month DESC LIMIT 1;

  IF v_active_id IS NULL THEN
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

  -- Ranking Geral (já filtra boss_event internamente)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score, extra_data)
  SELECT v_active_id, 'geral', ROW_NUMBER() OVER (ORDER BY r.event_score DESC),
         r.player_name, r.player_class, r.player_guild, r.event_score,
         jsonb_build_object('kills', r.total_kills, 'deaths', r.total_deaths, 'kda', r.kda, 'matches', r.matches_played)
  FROM get_ranking_geral(v_active_started, v_now, NULL, NULL) r
  ORDER BY r.event_score DESC LIMIT 10;

  -- Reis do PVP (apenas boss_event)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, score, extra_data)
  SELECT v_active_id, 'reis_pvp', ROW_NUMBER() OVER (ORDER BY r.vezes DESC, r.melhor_score DESC),
         r.player_name, r.melhor_score,
         jsonb_build_object('vezes', r.vezes, 'media', r.media_score)
  FROM get_ranking_reis_pvp(v_active_started, v_now, 'boss_event') r
  WHERE r.is_rei = true
  ORDER BY r.vezes DESC, r.melhor_score DESC LIMIT 10;

  -- Cones Monodedo (apenas boss_event)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, score, extra_data)
  SELECT v_active_id, 'cones', ROW_NUMBER() OVER (ORDER BY r.vezes DESC, r.pior_score ASC),
         r.player_name, r.pior_score,
         jsonb_build_object('vezes', r.vezes, 'media', r.media_score)
  FROM get_ranking_reis_pvp(v_active_started, v_now, 'boss_event') r
  WHERE r.is_rei = false
  ORDER BY r.vezes DESC, r.pior_score ASC LIMIT 10;

  -- Kill Streak (apenas boss_event)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score)
  SELECT v_active_id, 'kill_streak', ROW_NUMBER() OVER (ORDER BY r.max_streak DESC),
         r.player_name, r.player_class, r.player_guild, r.max_streak
  FROM get_ranking_kill_streak(v_active_started, v_now, NULL, NULL, 'boss_event') r
  ORDER BY r.max_streak DESC LIMIT 10;

  -- Mural da Vergonha (apenas boss_event)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score, extra_data)
  SELECT v_active_id, 'mural_vergonha', ROW_NUMBER() OVER (ORDER BY r.total_deaths DESC),
         r.player_name, r.player_class, r.player_guild, r.total_deaths,
         jsonb_build_object('matches', r.matches_played, 'avg', r.avg_deaths_per_match)
  FROM get_ranking_mural_vergonha(v_active_started, v_now, NULL, NULL, 'boss_event') r
  ORDER BY r.total_deaths DESC LIMIT 10;

  -- Fogo Amigo (apenas boss_event)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, player_class, player_guild, score, extra_data)
  SELECT v_active_id, 'fogo_amigo', ROW_NUMBER() OVER (ORDER BY r.event_score DESC),
         r.player_name, r.player_class, r.player_guild, r.event_score,
         jsonb_build_object('friendly_kills', r.friendly_kills, 'friendly_deaths', r.friendly_deaths)
  FROM get_ranking_fogo_amigo(v_active_started, v_now, NULL, NULL, 'boss_event') r
  ORDER BY r.event_score DESC LIMIT 10;

  -- Putinha (apenas boss_event)
  INSERT INTO season_snapshots (season_id, ranking_type, position, player_name, score, extra_data)
  SELECT v_active_id, 'putinha', ROW_NUMBER() OVER (ORDER BY p.deaths DESC),
         p.killer_name || ' → ' || p.victim_name, p.deaths,
         jsonb_build_object('killer', p.killer_name, 'victim', p.victim_name, 'killer_guild', p.killer_guild, 'victim_guild', p.victim_guild)
  FROM get_ranking_putinha(v_active_started, v_now, NULL, NULL, 'boss_event') p
  ORDER BY p.deaths DESC LIMIT 10;

  UPDATE seasons SET status='closed', ended_at=v_now, closed_at=now() WHERE id = v_active_id;

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
$function$;