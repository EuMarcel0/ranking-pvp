-- Create table for PVP matches
CREATE TABLE public.pvp_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  boss_label TEXT NOT NULL,
  match_date DATE NOT NULL,
  match_hour INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for player stats in each match
CREATE TABLE public.pvp_match_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.pvp_matches(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  kda DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_pvp_matches_date ON public.pvp_matches(match_date);
CREATE INDEX idx_pvp_match_players_match_id ON public.pvp_match_players(match_id);
CREATE INDEX idx_pvp_match_players_name ON public.pvp_match_players(player_name);

-- Enable Row Level Security
ALTER TABLE public.pvp_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_match_players ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public read/write (since there's no authentication yet)
CREATE POLICY "Anyone can view matches" 
ON public.pvp_matches 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert matches" 
ON public.pvp_matches 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view match players" 
ON public.pvp_match_players 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert match players" 
ON public.pvp_match_players 
FOR INSERT 
WITH CHECK (true);