-- Update INSERT policies to allow both admin and moderator

-- pvp_matches
DROP POLICY IF EXISTS "Admins can insert matches" ON public.pvp_matches;
CREATE POLICY "Admins and moderators can insert matches" 
ON public.pvp_matches 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- pvp_match_players
DROP POLICY IF EXISTS "Admins can insert match players" ON public.pvp_match_players;
CREATE POLICY "Admins and moderators can insert match players" 
ON public.pvp_match_players 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- pvp_kill_logs
DROP POLICY IF EXISTS "Admins can insert kill logs" ON public.pvp_kill_logs;
CREATE POLICY "Admins and moderators can insert kill logs" 
ON public.pvp_kill_logs 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- characters
DROP POLICY IF EXISTS "Admins can insert characters" ON public.characters;
CREATE POLICY "Admins and moderators can insert characters" 
ON public.characters 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

DROP POLICY IF EXISTS "Admins can update characters" ON public.characters;
CREATE POLICY "Admins and moderators can update characters" 
ON public.characters 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- user_roles - Allow admins to manage user roles
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles" 
ON public.user_roles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles" 
ON public.user_roles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update SELECT policy to allow admins to see all roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles or admins can view all" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id);