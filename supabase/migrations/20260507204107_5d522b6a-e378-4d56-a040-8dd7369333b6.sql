
DROP FUNCTION IF EXISTS public.check_player_milestones();

CREATE OR REPLACE FUNCTION public.check_player_milestones()
RETURNS TABLE(p_name text, p_metric text, p_threshold numeric, p_label text, p_emoji text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH stats AS (
    SELECT kl.killer_name AS pname, COUNT(*)::numeric AS total_kills
    FROM pvp_kill_logs kl
    INNER JOIN characters c ON c.name = kl.killer_name AND c.banned = false
    GROUP BY kl.killer_name
  ),
  per_match AS (
    SELECT killer_name AS pname, MAX(cnt)::numeric AS max_single
    FROM (SELECT killer_name, match_id, COUNT(*) AS cnt FROM pvp_kill_logs GROUP BY killer_name, match_id) sub
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
