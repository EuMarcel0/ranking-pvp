import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type AppRole = 'admin' | 'moderator' | 'user';

const roleCache = new Map<string, AppRole | null>();
const rolePromises = new Map<string, Promise<AppRole | null>>();

const fetchRoleForUser = (userId: string) => {
  const cached = roleCache.get(userId);
  if (roleCache.has(userId)) return Promise.resolve(cached);

  const existingPromise = rolePromises.get(userId);
  if (existingPromise) return existingPromise;

  const promise = Promise.resolve(
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
  )
    .then(({ data, error }) => {
      if (error) throw error;
      const value = (data?.role as AppRole) ?? null;
      roleCache.set(userId, value);
      return value;
    })
    .finally(() => {
      rolePromises.delete(userId);
    });

  rolePromises.set(userId, promise);
  return promise;
};

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        setRole(await fetchRoleForUser(user.id));
      } catch (err) {
        console.error('Error fetching user role:', err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  return {
    role,
    loading,
    isAdmin: role === 'admin',
    isModerator: role === 'moderator',
    canEditData: role === 'admin' || role === 'moderator',
  };
};
