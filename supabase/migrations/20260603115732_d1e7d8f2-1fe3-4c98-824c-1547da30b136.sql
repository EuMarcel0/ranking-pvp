DROP POLICY IF EXISTS "Admins delete milestones" ON public.player_milestones;
CREATE POLICY "Admins delete milestones" ON public.player_milestones FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete snapshots" ON public.season_snapshots;
CREATE POLICY "Admins can delete snapshots" ON public.season_snapshots FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert snapshots" ON public.season_snapshots;
CREATE POLICY "Admins can insert snapshots" ON public.season_snapshots FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update snapshots" ON public.season_snapshots FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));