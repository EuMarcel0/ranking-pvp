
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS match_minute integer NOT NULL DEFAULT 0;

-- Cleanup tonight's duplicates
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.pvp_matches
  WHERE match_date='2026-05-19' AND match_hour=22 AND event_type='boss_event'
)
DELETE FROM public.pvp_kill_logs WHERE match_id IN (SELECT id FROM ranked WHERE rn > 2);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.pvp_matches
  WHERE match_date='2026-05-19' AND match_hour=22 AND event_type='boss_event'
)
DELETE FROM public.pvp_match_players WHERE match_id IN (SELECT id FROM ranked WHERE rn > 2);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.pvp_matches
  WHERE match_date='2026-05-19' AND match_hour=22 AND event_type='boss_event'
)
DELETE FROM public.pvp_matches WHERE id IN (SELECT id FROM ranked WHERE rn > 2);

-- Assign minute 0 and 30 to the two survivors (oldest = 22:00, newer = 22:30)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.pvp_matches
  WHERE match_date='2026-05-19' AND match_hour=22 AND event_type='boss_event'
)
UPDATE public.pvp_matches m
SET match_minute = CASE r.rn WHEN 1 THEN 0 ELSE 30 END
FROM ranked r WHERE m.id = r.id;

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS pvp_matches_unique_event
  ON public.pvp_matches (match_date, match_hour, match_minute, event_type);
