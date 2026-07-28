import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

export interface AnalyticsFilters {
  dateFrom: string | null;
  dateTo: string | null;
  hourFrom: number | null;
  hourTo: number | null;
  eventType: 'boss_event' | 'throne_conquest' | 'arka_war' | 'all';
  guild: string | null;
  playerClass: string | null;
  playerName: string | null;
}

export interface KillLog {
  killer_name: string;
  victim_name: string;
  match_id: string;
}

export interface CharacterInfo {
  name: string;
  class: string;
  guild: string;
  banned: boolean;
  pilot_name: string;
}

export const defaultFilters: AnalyticsFilters = {
  dateFrom: null,
  dateTo: null,
  hourFrom: null,
  hourTo: null,
  eventType: 'all',
  guild: null,
  playerClass: null,
  playerName: null,
};

export async function fetchFilteredMatchIds(filters: AnalyticsFilters): Promise<string[]> {
  let query = supabase.from('pvp_matches').select('id');

  if (filters.eventType !== 'all') {
    query = query.eq('event_type', filters.eventType);
  }
  if (filters.dateFrom) {
    query = query.gte('match_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('match_date', filters.dateTo);
  }
  if (filters.hourFrom !== null) {
    query = query.gte('match_hour', filters.hourFrom);
  }
  if (filters.hourTo !== null) {
    query = query.lte('match_hour', filters.hourTo);
  }

  const allIds: string[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allIds.push(...data.map(m => m.id));
      hasMore = data.length === PAGE_SIZE;
      page++;
    }
  }

  return allIds;
}

export async function fetchKillLogsForMatches(matchIds: string[]): Promise<KillLog[]> {
  if (matchIds.length === 0) return [];

  const allLogs: KillLog[] = [];
  // Process in batches of match IDs to avoid query size limits
  const BATCH_SIZE = 100;
  
  for (let b = 0; b < matchIds.length; b += BATCH_SIZE) {
    const batchIds = matchIds.slice(b, b + BATCH_SIZE);
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('pvp_kill_logs')
        .select('killer_name, victim_name, match_id')
        .in('match_id', batchIds)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allLogs.push(...data);
        hasMore = data.length === PAGE_SIZE;
        page++;
      }
    }
  }

  return allLogs;
}

export async function fetchAllCharacters(): Promise<CharacterInfo[]> {
  const all: CharacterInfo[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('characters')
      .select('name, class, guild, banned, pilot_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      all.push(...data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    }
  }

  return all;
}

export function buildCharacterMap(characters: CharacterInfo[]): Map<string, CharacterInfo> {
  const map = new Map<string, CharacterInfo>();
  for (const c of characters) {
    map.set(c.name, c);
  }
  return map;
}

export function filterBanned(logs: KillLog[], charMap: Map<string, CharacterInfo>): KillLog[] {
  return logs.filter(l => {
    const killer = charMap.get(l.killer_name);
    const victim = charMap.get(l.victim_name);
    if (killer?.banned || victim?.banned) return false;
    return true;
  });
}

export function filterByGuild(logs: KillLog[], guild: string | null, charMap: Map<string, CharacterInfo>): KillLog[] {
  if (!guild) return logs;
  return logs.filter(l => {
    const killer = charMap.get(l.killer_name);
    const victim = charMap.get(l.victim_name);
    return killer?.guild === guild || victim?.guild === guild;
  });
}

export function filterByClass(logs: KillLog[], playerClass: string | null, charMap: Map<string, CharacterInfo>): KillLog[] {
  if (!playerClass) return logs;
  return logs.filter(l => {
    const killer = charMap.get(l.killer_name);
    const victim = charMap.get(l.victim_name);
    return killer?.class === playerClass || victim?.class === playerClass;
  });
}

export function filterByPlayerName(logs: KillLog[], playerName: string | null): KillLog[] {
  if (!playerName) return logs;
  const lower = playerName.toLowerCase();
  return logs.filter(l =>
    l.killer_name.toLowerCase().includes(lower) || l.victim_name.toLowerCase().includes(lower)
  );
}

export interface MatchWithType {
  id: string;
  event_type: string;
  match_date: string;
}

export async function fetchMatchesWithType(filters: AnalyticsFilters): Promise<MatchWithType[]> {
  let query = supabase.from('pvp_matches').select('id, event_type, match_date');

  if (filters.eventType !== 'all') {
    query = query.eq('event_type', filters.eventType);
  }
  if (filters.dateFrom) {
    query = query.gte('match_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('match_date', filters.dateTo);
  }
  if (filters.hourFrom !== null) {
    query = query.gte('match_hour', filters.hourFrom);
  }
  if (filters.hourTo !== null) {
    query = query.lte('match_hour', filters.hourTo);
  }

  query = query.order('match_date', { ascending: true });

  const all: MatchWithType[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      all.push(...data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    }
  }

  return all;
}
