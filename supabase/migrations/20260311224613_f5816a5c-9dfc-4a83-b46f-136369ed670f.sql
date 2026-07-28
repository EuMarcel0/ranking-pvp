CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE (
  role_id uuid,
  user_id uuid,
  email text,
  role app_role,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ur.id AS role_id,
    u.id AS user_id,
    u.email::text AS email,
    COALESCE(ur.role, 'user'::app_role) AS role,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY u.created_at DESC;
$$;