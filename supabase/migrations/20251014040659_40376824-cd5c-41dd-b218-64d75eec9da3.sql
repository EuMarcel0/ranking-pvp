-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Update characters table policies
DROP POLICY IF EXISTS "Authenticated users can insert characters" ON public.characters;
DROP POLICY IF EXISTS "Authenticated users can update characters" ON public.characters;
DROP POLICY IF EXISTS "Authenticated users can delete characters" ON public.characters;

CREATE POLICY "Admins can insert characters" ON public.characters
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update characters" ON public.characters
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete characters" ON public.characters
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update pvp_matches table policies
DROP POLICY IF EXISTS "Authenticated users can insert matches" ON public.pvp_matches;

CREATE POLICY "Admins can insert matches" ON public.pvp_matches
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update matches" ON public.pvp_matches
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete matches" ON public.pvp_matches
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update pvp_match_players table policies
DROP POLICY IF EXISTS "Authenticated users can insert match players" ON public.pvp_match_players;

CREATE POLICY "Admins can insert match players" ON public.pvp_match_players
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update match players" ON public.pvp_match_players
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete match players" ON public.pvp_match_players
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Grant admin role to existing user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'emersonferri.pb@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;