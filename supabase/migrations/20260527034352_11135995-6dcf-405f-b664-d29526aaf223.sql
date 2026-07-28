
-- Fix player_badges policies
DROP POLICY IF EXISTS "Admins insert player badges" ON public.player_badges;
DROP POLICY IF EXISTS "Admins update player badges" ON public.player_badges;
CREATE POLICY "Admins insert player badges" ON public.player_badges
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update player badges" ON public.player_badges
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix player_milestones policies
DROP POLICY IF EXISTS "Admins insert milestones" ON public.player_milestones;
DROP POLICY IF EXISTS "Admins update milestones" ON public.player_milestones;
CREATE POLICY "Admins insert milestones" ON public.player_milestones
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update milestones" ON public.player_milestones
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Revoke execute from anon/authenticated on admin-only SECURITY DEFINER functions.
-- Edge functions use service_role and bypass these grants.
REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_users_with_roles() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_current_season() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reopen_season(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_player_badges() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_player_milestones() FROM anon, authenticated, PUBLIC;

-- Re-grant admin-callable functions to authenticated; internal access check still applies via has_role
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_current_season() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_season(uuid) TO authenticated;
