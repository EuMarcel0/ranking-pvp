
-- Thresholds (configurable)
CREATE TABLE public.milestone_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL CHECK (metric IN ('total_kills','kill_streak','single_match_kills','best_kda')),
  threshold numeric NOT NULL,
  label text NOT NULL,
  emoji text NOT NULL DEFAULT '🏅',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric, threshold)
);

ALTER TABLE public.milestone_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view thresholds" ON public.milestone_thresholds FOR SELECT USING (true);
CREATE POLICY "Admins manage thresholds insert" ON public.milestone_thresholds FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage thresholds update" ON public.milestone_thresholds FOR UPDATE USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage thresholds delete" ON public.milestone_thresholds FOR DELETE USING (has_role(auth.uid(),'admin'));

-- Achieved milestones
CREATE TABLE public.player_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  metric text NOT NULL,
  threshold numeric NOT NULL,
  label text NOT NULL,
  emoji text NOT NULL DEFAULT '🏅',
  achieved_at timestamptz NOT NULL DEFAULT now(),
  notified boolean NOT NULL DEFAULT false,
  UNIQUE (player_name, metric, threshold)
);

CREATE INDEX idx_player_milestones_player ON public.player_milestones(player_name);
CREATE INDEX idx_player_milestones_recent ON public.player_milestones(achieved_at DESC);

ALTER TABLE public.player_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view player milestones" ON public.player_milestones FOR SELECT USING (true);
CREATE POLICY "Admins insert milestones" ON public.player_milestones FOR INSERT WITH CHECK (auth.uid() IS NULL OR has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update milestones" ON public.player_milestones FOR UPDATE USING (auth.uid() IS NULL OR has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete milestones" ON public.player_milestones FOR DELETE USING (has_role(auth.uid(),'admin'));

-- Seed defaults
INSERT INTO public.milestone_thresholds (metric, threshold, label, emoji) VALUES
  ('total_kills', 100, '100 Kills', '⚔️'),
  ('total_kills', 500, '500 Kills', '🗡️'),
  ('total_kills', 1000, '1.000 Kills', '🏆'),
  ('total_kills', 2500, '2.500 Kills', '👑'),
  ('total_kills', 5000, '5.000 Kills - Lendário', '💎'),
  ('total_kills', 10000, '10.000 Kills - Lenda Viva', '🌟'),
  ('kill_streak', 10, 'Kill Streak 10', '🔥'),
  ('kill_streak', 20, 'Kill Streak 20 - Imparável', '💥'),
  ('kill_streak', 30, 'Kill Streak 30 - Devastador', '⚡'),
  ('kill_streak', 50, 'Kill Streak 50 - Mítico', '🌠'),
  ('single_match_kills', 20, '20 Kills em uma partida', '🎯'),
  ('single_match_kills', 30, '30 Kills em uma partida - Carnificina', '💀'),
  ('single_match_kills', 50, '50 Kills em uma partida - Massacre', '☠️'),
  ('best_kda', 5, 'KDA 5+', '⭐'),
  ('best_kda', 10, 'KDA 10+ - Excelência', '✨'),
  ('best_kda', 20, 'KDA 20+ - Perfeição', '👑');

-- Check function
CREATE OR REPLACE FUNCTION public.check_player_milestones()
RETURNS TABLE(player_name text, metric text, threshold numeric, label text, emoji text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH stats AS (
    -- Total kills per player
    SELECT kl.killer_name AS pname, COUNT(*)::numeric AS total_kills
    FROM pvp_kill_logs kl
    INNER JOIN characters c ON c.name = kl.killer_name AND c.banned = false
    GROUP BY kl.killer_name
  ),
  per_match AS (
    SELECT killer_name AS pname, MAX(cnt)::numeric AS max_single
    FROM (
      SELECT killer_name, match_id, COUNT(*) AS cnt
      FROM pvp_kill_logs
      GROUP BY killer_name, match_id
    ) sub
    GROUP BY killer_name
  ),
  best_kda_agg AS (
    SELECT mp.player_name AS pname, MAX(mp.kda)::numeric AS best_k
    FROM pvp_match_players mp
    GROUP BY mp.player_name
  ),
  ks AS (
    SELECT k.player_name AS pname, k.max_streak::numeric AS max_streak
    FROM get_ranking_kill_streak(NULL,NULL,NULL,NULL,'all') k
  ),
  candidates AS (
    SELECT s.pname, 'total_kills'::text AS m, t.threshold, t.label, t.emoji
    FROM stats s JOIN milestone_thresholds t ON t.metric='total_kills' AND t.enabled AND s.total_kills >= t.threshold
    UNION ALL
    SELECT pm.pname, 'single_match_kills', t.threshold, t.label, t.emoji
    FROM per_match pm JOIN milestone_thresholds t ON t.metric='single_match_kills' AND t.enabled AND pm.max_single >= t.threshold
    UNION ALL
    SELECT b.pname, 'best_kda', t.threshold, t.label, t.emoji
    FROM best_kda_agg b JOIN milestone_thresholds t ON t.metric='best_kda' AND t.enabled AND b.best_k >= t.threshold
    UNION ALL
    SELECT k.pname, 'kill_streak', t.threshold, t.label, t.emoji
    FROM ks k JOIN milestone_thresholds t ON t.metric='kill_streak' AND t.enabled AND k.max_streak >= t.threshold
  ),
  inserted AS (
    INSERT INTO player_milestones (player_name, metric, threshold, label, emoji)
    SELECT c.pname, c.m, c.threshold, c.label, c.emoji
    FROM candidates c
    ON CONFLICT (player_name, metric, threshold) DO NOTHING
    RETURNING player_milestones.player_name, player_milestones.metric, player_milestones.threshold, player_milestones.label, player_milestones.emoji
  )
  SELECT i.player_name, i.metric, i.threshold, i.label, i.emoji FROM inserted i;
END;
$$;
