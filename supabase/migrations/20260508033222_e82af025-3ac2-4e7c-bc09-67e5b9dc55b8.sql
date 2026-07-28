-- Recompute badges based ONLY on current active season stats.
-- 1) Update check_player_badges to also remove badges that no longer qualify within the season window.
CREATE OR REPLACE FUNCTION public.check_player_badges()
 RETURNS TABLE(p_name text, p_badge_code text, p_label text, p_emoji text, p_rarity text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_season_start date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT started_at INTO v_season_start
  FROM seasons WHERE status='active'
  ORDER BY year DESC, month DESC LIMIT 1;

  RETURN QUERY
  WITH season_matches AS (
    SELECT id FROM pvp_matches
    WHERE v_season_start IS NULL OR match_date >= v_season_start
  ),
  total_k AS (
    SELECT kl.killer_name AS pname, COUNT(*)::numeric AS v
    FROM pvp_kill_logs kl
    INNER JOIN season_matches sm ON sm.id = kl.match_id
    INNER JOIN characters c ON c.name = kl.killer_name AND c.banned = false
    GROUP BY kl.killer_name
  ),
  per_match AS (
    SELECT kl.killer_name AS pname, kl.match_id, COUNT(*)::numeric AS k
    FROM pvp_kill_logs kl
    INNER JOIN season_matches sm ON sm.id = kl.match_id
    GROUP BY kl.killer_name, kl.match_id
  ),
  single_max AS (
    SELECT pname, MAX(k) AS v FROM per_match GROUP BY pname
  ),
  match_no_death AS (
    SELECT mp.player_name AS pname, MAX(mp.kills)::numeric AS v
    FROM pvp_match_players mp
    INNER JOIN season_matches sm ON sm.id = mp.match_id
    WHERE mp.deaths = 0 AND mp.kills > 0
    GROUP BY mp.player_name
  ),
  match_kda AS (
    SELECT mp.player_name AS pname, MAX(mp.kda)::numeric AS v
    FROM pvp_match_players mp
    INNER JOIN season_matches sm ON sm.id = mp.match_id
    GROUP BY mp.player_name
  ),
  total_m AS (
    SELECT mp.player_name AS pname, COUNT(*)::numeric AS v
    FROM pvp_match_players mp
    INNER JOIN season_matches sm ON sm.id = mp.match_id
    GROUP BY mp.player_name
  ),
  ks AS (
    SELECT k.player_name AS pname, k.max_streak::numeric AS v
    FROM get_ranking_kill_streak(v_season_start, NULL, NULL, NULL, 'all') k
  ),
  candidates AS (
    SELECT t.pname, b.code, b.name, b.emoji, b.rarity FROM total_k t JOIN badge_definitions b ON b.criteria_type='total_kills' AND b.enabled AND t.v >= b.criteria_value
    UNION
    SELECT s.pname, b.code, b.name, b.emoji, b.rarity FROM single_max s JOIN badge_definitions b ON b.criteria_type='single_match_kills' AND b.enabled AND s.v >= b.criteria_value
    UNION
    SELECT m.pname, b.code, b.name, b.emoji, b.rarity FROM match_no_death m JOIN badge_definitions b ON b.criteria_type='single_match_no_deaths' AND b.enabled AND m.v >= b.criteria_value
    UNION
    SELECT mk.pname, b.code, b.name, b.emoji, b.rarity FROM match_kda mk JOIN badge_definitions b ON b.criteria_type='single_match_kda' AND b.enabled AND mk.v >= b.criteria_value
    UNION
    SELECT tm.pname, b.code, b.name, b.emoji, b.rarity FROM total_m tm JOIN badge_definitions b ON b.criteria_type='total_matches' AND b.enabled AND tm.v >= b.criteria_value
    UNION
    SELECT k.pname, b.code, b.name, b.emoji, b.rarity FROM ks k JOIN badge_definitions b ON b.criteria_type='kill_streak' AND b.enabled AND k.v >= b.criteria_value
  ),
  -- Remove badges that no longer qualify under current season stats
  removed AS (
    DELETE FROM player_badges pb
    WHERE NOT EXISTS (
      SELECT 1 FROM candidates c WHERE c.pname = pb.player_name AND c.code = pb.badge_code
    )
    RETURNING pb.player_name, pb.badge_code
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
$function$;

-- 2) Same fix for milestones: remove milestones that no longer qualify within the season window.
CREATE OR REPLACE FUNCTION public.check_player_milestones()
 RETURNS TABLE(p_name text, p_metric text, p_threshold numeric, p_label text, p_emoji text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_season_start date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT started_at INTO v_season_start
  FROM seasons WHERE status='active'
  ORDER BY year DESC, month DESC LIMIT 1;

  RETURN QUERY
  WITH season_matches AS (
    SELECT id FROM pvp_matches
    WHERE v_season_start IS NULL OR match_date >= v_season_start
  ),
  stats AS (
    SELECT kl.killer_name AS pname, COUNT(*)::numeric AS total_kills
    FROM pvp_kill_logs kl
    INNER JOIN season_matches sm ON sm.id = kl.match_id
    INNER JOIN characters c ON c.name = kl.killer_name AND c.banned = false
    GROUP BY kl.killer_name
  ),
  per_match AS (
    SELECT killer_name AS pname, MAX(cnt)::numeric AS max_single
    FROM (
      SELECT kl.killer_name, kl.match_id, COUNT(*) AS cnt
      FROM pvp_kill_logs kl
      INNER JOIN season_matches sm ON sm.id = kl.match_id
      GROUP BY kl.killer_name, kl.match_id
    ) sub
    GROUP BY killer_name
  ),
  best_kda_agg AS (
    SELECT mp.player_name AS pname, MAX(mp.kda)::numeric AS best_k
    FROM pvp_match_players mp
    INNER JOIN season_matches sm ON sm.id = mp.match_id
    GROUP BY mp.player_name
  ),
  ks AS (
    SELECT k.player_name AS pname, k.max_streak::numeric AS max_streak
    FROM get_ranking_kill_streak(v_season_start, NULL, NULL, NULL, 'all') k
  ),
  candidates AS (
    SELECT s.pname, 'total_kills'::text AS m, t.threshold, t.label, t.emoji
    FROM stats s JOIN milestone_thresholds t ON t.metric='total_kills' AND t.enabled AND s.total_kills >= t.threshold
    UNION
    SELECT pm.pname, 'single_match_kills', t.threshold, t.label, t.emoji
    FROM per_match pm JOIN milestone_thresholds t ON t.metric='single_match_kills' AND t.enabled AND pm.max_single >= t.threshold
    UNION
    SELECT b.pname, 'best_kda', t.threshold, t.label, t.emoji
    FROM best_kda_agg b JOIN milestone_thresholds t ON t.metric='best_kda' AND t.enabled AND b.best_k >= t.threshold
    UNION
    SELECT k.pname, 'kill_streak', t.threshold, t.label, t.emoji
    FROM ks k JOIN milestone_thresholds t ON t.metric='kill_streak' AND t.enabled AND k.max_streak >= t.threshold
  ),
  removed AS (
    DELETE FROM player_milestones pm
    WHERE NOT EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.pname = pm.player_name AND c.m = pm.metric AND c.threshold = pm.threshold
    )
    RETURNING pm.player_name
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
$function$;

-- 3) Force a clean recompute now: wipe and re-evaluate based on the active season.
DELETE FROM public.player_badges;
DELETE FROM public.player_milestones;

SELECT public.check_player_badges();
SELECT public.check_player_milestones();