import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que escuta mudanças em pvp_matches / pvp_match_players / pvp_kill_logs
 * e invalida as queries de rankings/analytics, dando atualização ao vivo.
 *
 * Retorna o timestamp do último evento recebido (para indicador "AO VIVO").
 */
export function useRealtimeRankings() {
  const qc = useQueryClient();
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleInvalidate = () => {
      setLastEventAt(Date.now());
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        // Invalida tudo que começa com nossas chaves de ranking
        qc.invalidateQueries({
          predicate: (q) => {
            const k = String(q.queryKey?.[0] ?? '');
            return (
              k.startsWith('ranking-') ||
              k.startsWith('rankings-') ||
              k === 'analytics-dataset' ||
              k === 'player-badges' ||
              k === 'player-milestones-recent' ||
              k === 'kill-streak' ||
              k === 'reis-pvp' ||
              k === 'cones' ||
              k === 'mural-vergonha' ||
              k === 'fogo-amigo' ||
              k === 'putinha' ||
              k === 'best-per-class' ||
              k === 'class-matchup' ||
              k === 'class-guild' ||
              k === 'never-positive'
            );
          },
        });
      }, 1500);
    };

    const channel = supabase
      .channel('rankings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_matches' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_match_players' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_kill_logs' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_badges' }, scheduleInvalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_milestones' }, scheduleInvalidate)
      .subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return { lastEventAt };
}
