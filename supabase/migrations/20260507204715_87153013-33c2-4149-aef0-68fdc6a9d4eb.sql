
-- ============= BADGE DEFINITIONS =============
CREATE TABLE public.badge_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL DEFAULT '🏅',
  rarity text NOT NULL DEFAULT 'common',
  criteria_type text NOT NULL,
  criteria_value numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badge definitions" ON public.badge_definitions FOR SELECT USING (true);
CREATE POLICY "Admins insert badge definitions" ON public.badge_definitions FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update badge definitions" ON public.badge_definitions FOR UPDATE USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete badge definitions" ON public.badge_definitions FOR DELETE USING (has_role(auth.uid(),'admin'));

-- ============= PLAYER BADGES =============
CREATE TABLE public.player_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  badge_code text NOT NULL,
  match_id uuid,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  notified boolean NOT NULL DEFAULT false,
  UNIQUE(player_name, badge_code)
);

ALTER TABLE public.player_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view player badges" ON public.player_badges FOR SELECT USING (true);
CREATE POLICY "Admins insert player badges" ON public.player_badges FOR INSERT WITH CHECK (auth.uid() IS NULL OR has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update player badges" ON public.player_badges FOR UPDATE USING (auth.uid() IS NULL OR has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete player badges" ON public.player_badges FOR DELETE USING (has_role(auth.uid(),'admin'));

CREATE INDEX idx_player_badges_player ON public.player_badges(player_name);
CREATE INDEX idx_player_badges_notified ON public.player_badges(notified) WHERE notified = false;

-- ============= SEED DEFINITIONS =============
INSERT INTO public.badge_definitions (code, name, description, emoji, rarity, criteria_type, criteria_value) VALUES
  ('primeira_sangue', 'Primeira Sangue', 'Conquistou seu primeiro kill', '🩸', 'common', 'total_kills', 1),
  ('carrasco', 'Carrasco', '10+ kills em uma única partida', '🪓', 'rare', 'single_match_kills', 10),
  ('indestrutivel', 'Indestrutível', '5+ kills sem morrer em uma partida', '🛡️', 'epic', 'single_match_no_deaths', 5),
  ('pentakill', 'Pentakill', 'Sequência de 5 kills sem morrer', '🔥', 'rare', 'kill_streak', 5),
  ('decakill', 'Decakill', 'Sequência de 10 kills sem morrer', '💥', 'epic', 'kill_streak', 10),
  ('veterano', 'Veterano', 'Participou de 100 partidas', '🎖️', 'rare', 'total_matches', 100),
  ('lenda', 'Lenda', 'Atingiu 1000 kills totais', '👑', 'legendary', 'total_kills', 1000),
  ('imortal', 'Imortal', 'KDA 10+ em uma única partida', '⚡', 'legendary', 'single_match_kda', 10);

-- ============= CHECK FUNCTION =============
CREATE OR REPLACE FUNCTION public.check_player_badges()
RETURNS TABLE(p_name text, p_badge_code text, p_label text, p_emoji text, p_rarity text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH
  total_k AS (
    SELECT kl.killer_name AS pname, COUNT(*)::numeric AS v
    FROM pvp_kill_logs kl
    INNER JOIN characters c ON c.name = kl.killer_name AND c.banned = false
    GROUP BY kl.killer_name
  ),
  per_match AS (
    SELECT killer_name AS pname, match_id, COUNT(*)::numeric AS k
    FROM pvp_kill_logs GROUP BY killer_name, match_id
  ),
  single_max AS (
    SELECT pname, MAX(k) AS v FROM per_match GROUP BY pname
  ),
  match_no_death AS (
    SELECT mp.player_name AS pname, MAX(mp.kills)::numeric AS v
    FROM pvp_match_players mp
    WHERE mp.deaths = 0 AND mp.kills > 0
    GROUP BY mp.player_name
  ),
  match_kda AS (
    SELECT mp.player_name AS pname, MAX(mp.kda)::numeric AS v
    FROM pvp_match_players mp GROUP BY mp.player_name
  ),
  total_m AS (
    SELECT mp.player_name AS pname, COUNT(*)::numeric AS v
    FROM pvp_match_players mp GROUP BY mp.player_name
  ),
  ks AS (
    SELECT k.player_name AS pname, k.max_streak::numeric AS v
    FROM get_ranking_kill_streak(NULL,NULL,NULL,NULL,'all') k
  ),
  candidates AS (
    SELECT t.pname, b.code, b.name, b.emoji, b.rarity FROM total_k t JOIN badge_definitions b ON b.criteria_type='total_kills' AND b.enabled AND t.v >= b.criteria_value
    UNION ALL
    SELECT s.pname, b.code, b.name, b.emoji, b.rarity FROM single_max s JOIN badge_definitions b ON b.criteria_type='single_match_kills' AND b.enabled AND s.v >= b.criteria_value
    UNION ALL
    SELECT m.pname, b.code, b.name, b.emoji, b.rarity FROM match_no_death m JOIN badge_definitions b ON b.criteria_type='single_match_no_deaths' AND b.enabled AND m.v >= b.criteria_value
    UNION ALL
    SELECT mk.pname, b.code, b.name, b.emoji, b.rarity FROM match_kda mk JOIN badge_definitions b ON b.criteria_type='single_match_kda' AND b.enabled AND mk.v >= b.criteria_value
    UNION ALL
    SELECT tm.pname, b.code, b.name, b.emoji, b.rarity FROM total_m tm JOIN badge_definitions b ON b.criteria_type='total_matches' AND b.enabled AND tm.v >= b.criteria_value
    UNION ALL
    SELECT k.pname, b.code, b.name, b.emoji, b.rarity FROM ks k JOIN badge_definitions b ON b.criteria_type='kill_streak' AND b.enabled AND k.v >= b.criteria_value
  ),
  inserted AS (
    INSERT INTO player_badges (player_name, badge_code)
    SELECT DISTINCT c.pname, c.code FROM candidates c
    ON CONFLICT (player_name, badge_code) DO NOTHING
    RETURNING player_badges.player_name, player_badges.badge_code
  )
  SELECT i.player_name, i.badge_code, c.name, c.emoji, c.rarity
  FROM inserted i
  JOIN badge_definitions c ON c.code = i.badge_code;
END;
$$;
