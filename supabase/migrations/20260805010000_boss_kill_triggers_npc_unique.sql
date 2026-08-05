-- Schedule-free: dois bosses (966/968) podem morrer no mesmo minuto
ALTER TABLE public.boss_kill_triggers
  DROP CONSTRAINT IF EXISTS boss_kill_triggers_match_date_match_hour_match_minute_event_type_key;

ALTER TABLE public.boss_kill_triggers
  DROP CONSTRAINT IF EXISTS boss_kill_triggers_match_date_match_hour_match_minute_event_ty_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.boss_kill_triggers'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%match_date%match_hour%match_minute%event_type%'
      AND pg_get_constraintdef(oid) NOT LIKE '%npc_id%'
  ) THEN
    EXECUTE (
      SELECT format('ALTER TABLE public.boss_kill_triggers DROP CONSTRAINT %I', conname)
      FROM pg_constraint
      WHERE conrelid = 'public.boss_kill_triggers'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE '%match_date%match_hour%match_minute%event_type%'
        AND pg_get_constraintdef(oid) NOT LIKE '%npc_id%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.boss_kill_triggers
  ADD CONSTRAINT boss_kill_triggers_date_hour_min_type_npc_key
  UNIQUE (match_date, match_hour, match_minute, event_type, npc_id);

COMMENT ON TABLE public.boss_kill_triggers IS
  'Disparos de postagem por morte de boss PvP (schedule-free). Unique inclui npc_id.';
