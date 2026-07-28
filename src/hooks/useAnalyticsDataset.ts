import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AnalyticsFilters,
  fetchAllCharacters,
  fetchMatchesWithType,
  buildCharacterMap,
  KillLog,
  CharacterInfo,
  MatchWithType,
} from './useAnalyticsData';

export interface AnalyticsDataset {
  matches: MatchWithType[];
  matchIds: string[];
  matchDateMap: Map<string, string>;
  matchTypeMap: Map<string, string>;
  characters: CharacterInfo[];
  charMap: Map<string, CharacterInfo>;
  logs: KillLog[];
}

function filtersKey(f: AnalyticsFilters): string {
  return JSON.stringify({
    d1: f.dateFrom,
    d2: f.dateTo,
    h1: f.hourFrom,
    h2: f.hourTo,
    e: f.eventType,
    g: f.guild,
    c: f.playerClass,
  });
}

/**
 * Single source of truth for the analytics dashboard. Now uses an RPC
 * (`get_analytics_kill_logs`) which performs the heavy joins/filters in
 * Postgres in a single round-trip — replacing the old client-side fetch
 * that paginated through tens of thousands of kill logs.
 */
export function useAnalyticsDataset(filters: AnalyticsFilters) {
  return useQuery<AnalyticsDataset>({
    queryKey: ['analytics-dataset', filtersKey(filters)],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      const PAGE_SIZE = 1000;

      const fetchAllLogs = async (): Promise<KillLog[]> => {
        const all: KillLog[] = [];
        let page = 0;
        // Supabase trunca RPC em 1000 linhas por padrão. Paginar via .range().
        // Loop até receber menos que PAGE_SIZE.
         
        while (true) {
          const { data, error } = await (supabase.rpc as any)(
            'get_analytics_kill_logs',
            {
              p_date_from: filters.dateFrom || null,
              p_date_to: filters.dateTo || null,
              p_hour_from: filters.hourFrom,
              p_hour_to: filters.hourTo,
              p_event_type: filters.eventType,
              p_guild: filters.guild,
            },
          ).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
          if (error) throw error;
          const rows = (data || []) as KillLog[];
          all.push(...rows);
          if (rows.length < PAGE_SIZE) break;
          page++;
          if (page > 500) break; // safety cap (500k rows)
        }
        return all;
      };

      const [matches, characters, logs] = await Promise.all([
        fetchMatchesWithType(filters),
        fetchAllCharacters(),
        fetchAllLogs(),
      ]);

      const charMap = buildCharacterMap(characters);
      const matchIds = matches.map((m) => m.id);

      const matchDateMap = new Map<string, string>();
      const matchTypeMap = new Map<string, string>();
      for (const m of matches) {
        matchDateMap.set(m.id, m.match_date);
        matchTypeMap.set(m.id, m.event_type);
      }



      return {
        matches,
        matchIds,
        matchDateMap,
        matchTypeMap,
        characters,
        charMap,
        logs,
      };
    },
  });
}
