
ALTER TABLE public.pvp_matches REPLICA IDENTITY FULL;
ALTER TABLE public.pvp_match_players REPLICA IDENTITY FULL;
ALTER TABLE public.pvp_kill_logs REPLICA IDENTITY FULL;
ALTER TABLE public.player_milestones REPLICA IDENTITY FULL;
ALTER TABLE public.player_badges REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_matches; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_match_players; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_kill_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.player_milestones; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.player_badges; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
