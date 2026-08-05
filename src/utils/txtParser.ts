import { PlayerStats } from '@/components/Scoreboard';
import { z } from 'zod';

export type EventType = 'boss_event' | 'throne_conquest' | 'world_boss';

export interface KillLog {
  killer: string;
  victim: string;
}

export interface ParseResult {
  players: PlayerStats[];
  bossLabel: string | null;
  killLogs: KillLog[];
  eventType: EventType;
}

export interface ExternalLogEntry {
  id: number;
  content: string;
  timestamp: string | null;
  created_at: string;
}

const playerNameSchema = z.string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid characters');

// Parser for external database single-line format
// Supports multiple formats:
// 1. With asterisks: 05/12/2025 23:11:04 - :dagger: *kikito* matou :skull: *MisticoDL* no mapa :map: *PvP Square* - *[Server: Boss Event PvP]*
// 2. Without asterisks: 07/12/2025 20:01:02 - :dagger: Freezing matou :skull: HulkSmash no mapa :map: PvP Square - [Server: Boss Event PvP]
export const parseExternalDbContent = (logs: ExternalLogEntry[], targetEventType?: EventType): ParseResult => {
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;
  let matchedEntries = 0;
  let detectedEventType: EventType = 'boss_event';

  console.log(`[External DB Parser] Processing ${logs.length} logs`);
  if (logs.length > 0) {
    console.log(`[External DB Parser] Sample content: "${logs[0].content}"`);
  }

  // Pattern with double asterisks: **name** (banco externo)
  const killPatternDoubleAsterisks = /:dagger:\s*\*\*(\w+)\*\*\s*matou\s*:skull:\s*\*\*(\w+)\*\*/i;
  
  // Pattern with single asterisks: *name*
  const killPatternSingleAsterisks = /:dagger:\s*\*(\w+)\*\s*matou\s*:skull:\s*\*(\w+)\*/i;
  
  // Pattern without asterisks (TXT format)
  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  
  // Map patterns for Boss Event (PvP Square) - supports Boss Event PvP and Platinum PvP servers
  const mapPatternPvPSquareDoubleAsterisks = /\*\*PvP Square\*\*\s*-\s*\*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*\*/i;
  const mapPatternPvPSquareSingleAsterisks = /\*PvP Square\*\s*-\s*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*/i;
  const mapPatternPvPSquareNoAsterisks = /PvP Square\s*-\s*\[Server: (?:Boss Event PvP|Platinum PvP)\]/i;
  
  // Map patterns for Throne Conquest (Devias)
  const mapPatternDeviasDoubleAsterisks = /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i;
  const mapPatternDeviasSingleAsterisks = /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i;
  const mapPatternDeviasNoAsterisks = /Devias\s*-\s*\[Server: Boss Event PvP\]/i;

  // World Boss (NPC 922): qualquer mapa no Boss Event / Platinum, exceto Devias
  const isBossEventServer = (c: string) => /\[Server:\s*(?:Boss Event PvP|Platinum PvP)\]/i.test(c);
  
  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // Check if it's a valid PvP Square map (Boss Event)
    const isPvPSquareMap = mapPatternPvPSquareDoubleAsterisks.test(content) || 
                           mapPatternPvPSquareSingleAsterisks.test(content) || 
                           mapPatternPvPSquareNoAsterisks.test(content);
    
    // Check if it's a valid Devias map (Throne Conquest)
    const isDeviasMap = mapPatternDeviasDoubleAsterisks.test(content) || 
                        mapPatternDeviasSingleAsterisks.test(content) || 
                        mapPatternDeviasNoAsterisks.test(content);

    const isWorldBossMap = isBossEventServer(content) && !isDeviasMap;
    
    // If target event type is specified, filter by it
    if (targetEventType === 'boss_event' && !isPvPSquareMap) continue;
    if (targetEventType === 'throne_conquest' && !isDeviasMap) continue;
    if (targetEventType === 'world_boss' && !isWorldBossMap) continue;
    
    // If no target specified, accept square, throne ou world boss open-world
    if (!targetEventType && !isPvPSquareMap && !isDeviasMap && !isWorldBossMap) continue;

    // Detect event type from first valid entry
    if (matchedEntries === 0) {
      detectedEventType = isDeviasMap
        ? 'throne_conquest'
        : isPvPSquareMap
          ? 'boss_event'
          : 'world_boss';
    }

    // Extract date for boss/throne label from first valid entry
    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        const hour = parseInt(dateMatch[4]);
        const labelPrefix = isDeviasMap
          ? 'throne'
          : detectedEventType === 'world_boss'
            ? 'world boss'
            : 'boss';
        bossLabel = `${labelPrefix} ${day}/${month} ${hour} horas`;
      }
    }

    // Try to extract killer and victim (try all patterns: double asterisks, single, none)
    let killMatch = content.match(killPatternDoubleAsterisks);
    if (!killMatch) {
      killMatch = content.match(killPatternSingleAsterisks);
    }
    if (!killMatch) {
      killMatch = content.match(killPatternNoAsterisks);
    }
    
    if (killMatch) {
      try {
        const killer = playerNameSchema.parse(killMatch[1].trim());
        const victim = playerNameSchema.parse(killMatch[2].trim());

        // Add to kill logs
        killLogs.push({ killer, victim });
        matchedEntries++;

        // Update killer stats
        const killerStats = playerMap.get(killer) || { kills: 0, deaths: 0 };
        killerStats.kills += 1;
        playerMap.set(killer, killerStats);

        // Update victim stats
        const victimStats = playerMap.get(victim) || { kills: 0, deaths: 0 };
        victimStats.deaths += 1;
        playerMap.set(victim, victimStats);
      } catch {
        console.warn('[External DB Parser] Invalid player name, skipping');
      }
    }
  }

  console.log(`[External DB Parser] Matched entries: ${matchedEntries}, Players: ${playerMap.size}`);

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return { players, bossLabel, killLogs, eventType: detectedEventType };
};

export const parseTxtFile = (content: string, targetEventType?: EventType): ParseResult => {
  const MAX_LINES = 10000;
  const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

  if (content.length === 0) {
    throw new Error('Arquivo vazio');
  }

  if (content.length > MAX_CONTENT_SIZE) {
    throw new Error('Conteúdo muito grande');
  }

  const lines = content.split('\n').slice(0, MAX_LINES);
  console.log(`[TXT Parser] Total lines: ${lines.length}`);
  
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;
  let matchedEntries = 0;
  let detectedEventType: EventType = 'boss_event';

  // Single-line format (most common):
  // 07/12/2025 20:01:02 - :dagger: Freezing matou :skull: HulkSmash no mapa :map: PvP Square - [Server: Boss Event PvP]
  // 27/01/2026 22:05:56 - :dagger: **ViidaBoa** matou :skull: **LOGAN** no mapa :map: **Devias** - **[Server: Boss Event PvP]**
  const singleLinePattern = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*-\s*:dagger:\s*\*{0,2}(\w+)\*{0,2}\s+matou\s+:skull:\s*\*{0,2}(\w+)\*{0,2}\s+no mapa\s+:map:\s*(.+)$/i;
  const validMapPvPSquare = /^\*{0,2}PvP Square\*{0,2}\s*-\s*\*{0,2}\[Server: (?:Boss Event PvP|Platinum PvP)\]\*{0,2}$/i;
  const validMapDevias = /^\*{0,2}Devias\*{0,2}\s*-\s*\*{0,2}\[Server: Boss Event PvP\]\*{0,2}$/i;
  const validMapWorldBoss = /^\*{0,2}.+?\*{0,2}\s*-\s*\*{0,2}\[Server: (?:Boss Event PvP|Platinum PvP)\]\*{0,2}$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try single-line format first
    const singleMatch = line.match(singleLinePattern);
    if (singleMatch) {
      const day = singleMatch[1];
      const month = singleMatch[2];
      const hour = parseInt(singleMatch[4]);
      const killer = singleMatch[7];
      const victim = singleMatch[8];
      const mapPart = singleMatch[9].trim();

      // Check which map type this is
      const isPvPSquare = validMapPvPSquare.test(mapPart);
      const isDevias = validMapDevias.test(mapPart);
      const isWorldBoss = !isDevias && validMapWorldBoss.test(mapPart);
      
      // If target event type is specified, filter by it
      if (targetEventType === 'boss_event' && !isPvPSquare) {
        console.log(`[TXT Parser] Skipped (filtering for boss_event): "${mapPart}"`);
        continue;
      }
      if (targetEventType === 'throne_conquest' && !isDevias) {
        console.log(`[TXT Parser] Skipped (filtering for throne_conquest): "${mapPart}"`);
        continue;
      }
      if (targetEventType === 'world_boss' && !isWorldBoss) {
        console.log(`[TXT Parser] Skipped (filtering for world_boss): "${mapPart}"`);
        continue;
      }
      
      // If no target specified, accept square, throne ou world boss
      if (!targetEventType && !isPvPSquare && !isDevias && !isWorldBoss) {
        console.log(`[TXT Parser] Skipped (wrong map): "${mapPart}"`);
        continue;
      }

      // Detect event type from first valid entry
      if (matchedEntries === 0) {
        detectedEventType = isDevias
          ? 'throne_conquest'
          : isPvPSquare
            ? 'boss_event'
            : 'world_boss';
      }

      // Extract boss/throne label from first valid entry
      if (!bossLabel) {
        const labelPrefix = isDevias
          ? 'throne'
          : detectedEventType === 'world_boss'
            ? 'world boss'
            : 'boss';
        bossLabel = `${labelPrefix} ${day}/${month} ${hour} horas`;
      }

      // Validate map - now we know it's valid
      matchedEntries++;
      try {
        const validKiller = playerNameSchema.parse(killer.trim());
        const validVictim = playerNameSchema.parse(victim.trim());

        // Add to kill logs
        killLogs.push({ killer: validKiller, victim: validVictim });

        // Update killer stats
        const killerStats = playerMap.get(validKiller) || { kills: 0, deaths: 0 };
        killerStats.kills += 1;
        playerMap.set(validKiller, killerStats);

        // Update victim stats
        const victimStats = playerMap.get(validVictim) || { kills: 0, deaths: 0 };
        victimStats.deaths += 1;
        playerMap.set(validVictim, victimStats);
      } catch {
        console.warn('[TXT Parser] Invalid player name, skipping');
      }
      continue;
    }

    // Fallback: Multi-line format
    // Line 1: 06/12/2025 23:11:14 - :dagger:
    // Line 2: MAGOO1 matou :skull:
    // Line 3: Hakumen no mapa :map:
    // Line 4: PvP Square - [Server: Boss Event PvP]
    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*-\s*:dagger:$/);
    
    if (dateMatch) {
      if (!bossLabel) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        const hour = parseInt(dateMatch[4]);
        bossLabel = `boss ${day}/${month} ${hour} horas`;
      }
      
      if (i + 3 < lines.length) {
        const killerLine = lines[i + 1].trim();
        const victimLine = lines[i + 2].trim();
        const mapLine = lines[i + 3].trim();
        
        const killerMatch = killerLine.match(/^(\w+)\s+matou\s+:skull:$/i);
        const victimMatch = victimLine.match(/^(\w+)\s+no mapa\s+:map:$/i);
        const isValidMap = mapLine === 'PvP Square - [Server: Boss Event PvP]' || mapLine === 'PvP Square - [Server: Platinum PvP]';
        
        if (killerMatch && victimMatch && isValidMap) {
          matchedEntries++;
          try {
            const killer = playerNameSchema.parse(killerMatch[1].trim());
            const victim = playerNameSchema.parse(victimMatch[1].trim());

            killLogs.push({ killer, victim });

            const killerStats = playerMap.get(killer) || { kills: 0, deaths: 0 };
            killerStats.kills += 1;
            playerMap.set(killer, killerStats);

            const victimStats = playerMap.get(victim) || { kills: 0, deaths: 0 };
            victimStats.deaths += 1;
            playerMap.set(victim, victimStats);
          } catch {
            console.warn('[TXT Parser] Invalid player name, skipping');
          }
        }
        i += 3;
      }
    }
  }

  console.log(`[TXT Parser] Matched entries from ${detectedEventType}: ${matchedEntries}`);

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return { players, bossLabel, killLogs, eventType: detectedEventType };
};
