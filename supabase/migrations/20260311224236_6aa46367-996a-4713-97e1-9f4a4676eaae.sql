DROP POLICY "Users can view own roles or admins can view all" ON public.user_roles;

CREATE POLICY "Users can view own roles or admins can view all"
ON public.user_roles
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = user_id));