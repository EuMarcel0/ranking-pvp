import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      console.log('Iniciando logout...');
      
      // Limpeza manual de storage para garantir que a sessão local morra
      localStorage.clear();
      sessionStorage.clear();
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Erro ao sair via Supabase:', error);
      }
      
      console.log('Logout processado, redirecionando...');
      // Força recarregamento total da página para limpar estados do React
      window.location.assign('/auth');
    } catch (err) {
      console.error('Erro inesperado no logout:', err);
      window.location.assign('/auth');
    }
  };

  return { user, session, loading, signOut };
};
