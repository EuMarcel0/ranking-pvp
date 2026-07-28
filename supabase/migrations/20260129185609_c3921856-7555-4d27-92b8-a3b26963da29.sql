-- Add event_type column to pvp_matches table
ALTER TABLE public.pvp_matches 
ADD COLUMN event_type text NOT NULL DEFAULT 'boss_event';

-- Add comment for documentation
COMMENT ON COLUMN public.pvp_matches.event_type IS 'Type of event: boss_event (PvP Square) or throne_conquest (Devias)';