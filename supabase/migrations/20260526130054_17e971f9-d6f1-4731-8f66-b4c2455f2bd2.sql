DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='pvp_matches') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_matches';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='pvp_match_players') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_match_players';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='pvp_kill_logs') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_kill_logs';
  END IF;
END $$;