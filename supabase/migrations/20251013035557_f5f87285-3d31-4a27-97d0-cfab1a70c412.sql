-- Remove dangerous public INSERT policies
DROP POLICY IF EXISTS "Anyone can insert matches" ON pvp_matches;
DROP POLICY IF EXISTS "Anyone can insert match players" ON pvp_match_players;

-- Add authenticated-only INSERT policies
CREATE POLICY "Authenticated users can insert matches"
ON pvp_matches FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can insert match players"
ON pvp_match_players FOR INSERT
TO authenticated
WITH CHECK (true);

-- Keep public SELECT policies (everyone can view rankings)
-- These already exist, no changes needed