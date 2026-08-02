import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncCharactersFromVortex } from '../_shared/vortexSync.ts';

/** Minutos sem kill no mapa do evento (logs_pvp) para considerar o PvP encerrado */
const EVENT_IDLE_MINUTES = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExternalLogEntry {
  id: string;
  content: string;
  timestamp: string;
  created_at: string;
}

interface PlayerStats {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
}

interface KillLog {
  killer: string;
  victim: string;
}

interface ParseResult {
  players: Record<string, PlayerStats>;
  bossLabel: string;
  killLogs: KillLog[];
}

interface GuildStats {
  playerCount: number;
  kills: number;
  deaths: number;
}

interface RequestBody {
  trigger?: string;
  attempt?: number;
  forceProcess?: boolean;
  forceReprocess?: boolean;
  eventHour?: number;
  eventMinute?: number;
  /** Fim da janela de busca em logs_pvp (BRT). Usado principalmente no Throne manual. */
  eventEndHour?: number;
  eventEndMinute?: number;
  eventType?: 'boss_event' | 'throne_conquest';
  testHomolog?: boolean;
  eventDate?: string; // 'YYYY-MM-DD' force a specific date (for homolog testing)
  /** Killer do boss (NPC 968/966) — preenchido pelo detect-boss-kill */
  bossKiller?: string;
  bossNpcId?: number;
}

const BOSS_NPC_NAMES: Record<number, string> = {
  966: '(Elite) Devil Sword',
  968: '(Elite) Devil Sorcerer',
};

function bossNpcLabel(npcId: number | null | undefined): string | null {
  if (npcId == null) return null;
  return BOSS_NPC_NAMES[npcId] ?? `NPC ${npcId}`;
}

function brtNowMs(): number {
  return Date.now();
}

function parseLogTimestampMs(log: ExternalLogEntry): number | null {
  // Preferir horário exato do content (`DD/MM/YYYY HH:MM:SS`) — mesma origem do discord-worker
  const contentMatch = log.content?.match(/`?(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})`?/);
  if (contentMatch) {
    const [, day, month, year, hour, minute, second] = contentMatch;
    return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + 3 * 3600000;
  }

  const raw = log.timestamp?.trim();
  if (!raw) return null;
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  // logs_pvp.timestamp guarda horário local BRT (sem timezone)
  return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + 3 * 3600000;
}

// Format ranking as monospaced table for Discord
function formatRankingTable(players: Array<{name: string, kills: number, deaths: number, kda: number, eventScore: number, class_short?: string}>): string {
  const maxNameLen = Math.max(7, ...players.map(p => p.name.length));
  const hasClassShort = players.some(p => p.class_short && p.class_short.trim() !== '');
  const classColWidth = 5;
  
  let table = '🏆 RANKING PVP\n';
  table += '═'.repeat(hasClassShort ? 57 : 52) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + (hasClassShort ? 'Sigla' + ' ' : '') + '  K    D    KDA     Score\n';
  table += '─'.repeat(hasClassShort ? 57 : 52) + '\n';
  
  players.forEach((player, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const nameStr = player.name.padEnd(maxNameLen + 2);
    const classStr = hasClassShort ? (player.class_short || '').padEnd(classColWidth + 1) : '';
    const killsStr = player.kills.toString().padStart(3);
    const deathsStr = player.deaths.toString().padStart(4);
    const kdaStr = player.kda.toFixed(2).padStart(7);
    const scoreStr = player.eventScore.toFixed(2).padStart(9);
    
    table += `${posStr} ${nameStr}${classStr}${killsStr}${deathsStr}${kdaStr}${scoreStr}\n`;
  });
  
  return table;
}

// Format guild ranking as monospaced table for Discord
function formatGuildRankingTable(guilds: Array<{
  guild: string;
  playerCount: number;
  kills: number;
  deaths: number;
  score: number;
}>): string {
  const maxGuildLen = Math.max(5, ...guilds.map(g => g.guild.length));
  
  let table = '⚔️ RANKING POR GUILD\n';
  table += '═'.repeat(55) + '\n\n';
  table += ' Pos  ' + 'Guild'.padEnd(maxGuildLen + 2) + 'Jogadores    K     D    Score\n';
  table += '─'.repeat(55) + '\n';
  
  guilds.forEach((guild, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const guildStr = guild.guild.padEnd(maxGuildLen + 2);
    const playersStr = guild.playerCount.toString().padStart(9);
    const killsStr = guild.kills.toString().padStart(5);
    const deathsStr = guild.deaths.toString().padStart(5);
    const scoreStr = guild.score.toFixed(2).padStart(9);
    
    table += `${posStr} ${guildStr}${playersStr}${killsStr}${deathsStr}${scoreStr}\n`;
  });
  
  return table;
}

// Format Fogo Amigo ranking as monospaced table
function formatFogoAmigoTableLocal(entries: Array<{name: string; class_short?: string; friendly_kills: number; friendly_deaths: number; kda: number; eventScore: number}>): string {
  if (!entries || entries.length === 0) return 'Nenhum caso de fogo amigo encontrado';
  const maxNameLen = Math.max(7, ...entries.map(e => e.name.length));
  const hasClass = entries.some(e => e.class_short && e.class_short.trim() !== '');
  const classW = 5;
  const width = maxNameLen + (hasClass ? classW + 1 : 0) + 32;

  let table = '🔥 RANKING FOGO AMIGO\n';
  table += '═'.repeat(width) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + (hasClass ? 'Sigla ' : '') + '  K    D    KDA     Score\n';
  table += '─'.repeat(width) + '\n';

  entries.forEach((p, index) => {
    const pos = index + 1;
    let posStr: string;
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;

    const nameStr = p.name.padEnd(maxNameLen + 2);
    const classStr = hasClass ? (p.class_short || '').padEnd(classW + 1) : '';
    const killsStr = p.friendly_kills.toString().padStart(3);
    const deathsStr = p.friendly_deaths.toString().padStart(4);
    const kdaStr = Number(p.kda).toFixed(2).padStart(7);
    const scoreStr = Number(p.eventScore).toFixed(2).padStart(9);

    table += `${posStr} ${nameStr}${classStr}${killsStr}${deathsStr}${kdaStr}${scoreStr}\n`;
  });

  return table;
}

// Parser logic for Boss Event (PvP Square map)
function parseExternalDbContentBoss(logs: ExternalLogEntry[]): ParseResult {
  const players: Record<string, PlayerStats> = {};
  const killLogs: KillLog[] = [];
  let bossLabel = '';
  let matchedEntries = 0;

  console.log(`[Auto Parser Boss] Processing ${logs.length} logs`);

  const killPatternDoubleAsterisks = /:dagger:\s*\*\*(\w+)\*\*\s*matou\s*:skull:\s*\*\*(\w+)\*\*/i;
  const mapPatternDoubleAsterisks = /\*\*PvP Square\*\*\s*-\s*\*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*\*/i;

  const killPatternSingleAsterisks = /:dagger:\s*\*(\w+)\*\s*matou\s*:skull:\s*\*(\w+)\*/i;
  const mapPatternSingleAsterisks = /\*PvP Square\*\s*-\s*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*/i;

  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  const mapPatternNoAsterisks = /PvP Square\s*-\s*\[Server: (?:Boss Event PvP|Platinum PvP)\]/i;

  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // STRICT: Only accept PvP Square map for Boss Events
    const hasValidMap = mapPatternDoubleAsterisks.test(content) ||
      mapPatternSingleAsterisks.test(content) ||
      mapPatternNoAsterisks.test(content);

    if (!hasValidMap) continue;

    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const [, day, month, year, hour] = dateMatch;
        bossLabel = `BOSSx2 ${day}/${month}/${year} ${hour}H`;
      }
    }

    let killMatch = content.match(killPatternDoubleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternSingleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternNoAsterisks);

    if (killMatch) {
      const killer = killMatch[1];
      const victim = killMatch[2];

      matchedEntries++;

      if (!players[killer]) {
        players[killer] = { name: killer, kills: 0, deaths: 0, kda: 0 };
      }
      players[killer].kills++;

      if (!players[victim]) {
        players[victim] = { name: victim, kills: 0, deaths: 0, kda: 0 };
      }
      players[victim].deaths++;

      killLogs.push({ killer, victim });
    }
  }

  for (const player of Object.values(players)) {
    player.kda = player.deaths === 0 ? player.kills : parseFloat((player.kills / player.deaths).toFixed(2));
  }

  console.log(`[Auto Parser Boss] Matched ${matchedEntries} valid entries (PvP Square), ${Object.keys(players).length} unique players`);

  return { players, bossLabel, killLogs };
}

// Parser logic for Throne Conquest (Devias map)
function parseExternalDbContentThrone(logs: ExternalLogEntry[]): ParseResult {
  const players: Record<string, PlayerStats> = {};
  const killLogs: KillLog[] = [];
  let bossLabel = '';
  let matchedEntries = 0;

  console.log(`[Auto Parser Throne] Processing ${logs.length} logs`);

  const killPatternDoubleAsterisks = /:dagger:\s*\*\*(\w+)\*\*\s*matou\s*:skull:\s*\*\*(\w+)\*\*/i;
  const mapPatternDoubleAsterisks = /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i;

  const killPatternSingleAsterisks = /:dagger:\s*\*(\w+)\*\s*matou\s*:skull:\s*\*(\w+)\*/i;
  const mapPatternSingleAsterisks = /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i;

  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  const mapPatternNoAsterisks = /Devias\s*-\s*\[Server: Boss Event PvP\]/i;

  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // STRICT: Only accept Devias map for Throne Conquest
    const hasValidMap = mapPatternDoubleAsterisks.test(content) ||
      mapPatternSingleAsterisks.test(content) ||
      mapPatternNoAsterisks.test(content);

    if (!hasValidMap) continue;

    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const [, day, month, year, hour] = dateMatch;
        bossLabel = `Throne ${day}/${month}/${year} ${hour}H`;
      }
    }

    let killMatch = content.match(killPatternDoubleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternSingleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternNoAsterisks);

    if (killMatch) {
      const killer = killMatch[1];
      const victim = killMatch[2];

      matchedEntries++;

      if (!players[killer]) {
        players[killer] = { name: killer, kills: 0, deaths: 0, kda: 0 };
      }
      players[killer].kills++;

      if (!players[victim]) {
        players[victim] = { name: victim, kills: 0, deaths: 0, kda: 0 };
      }
      players[victim].deaths++;

      killLogs.push({ killer, victim });
    }
  }

  for (const player of Object.values(players)) {
    player.kda = player.deaths === 0 ? player.kills : parseFloat((player.kills / player.deaths).toFixed(2));
  }

  console.log(`[Auto Parser Throne] Matched ${matchedEntries} valid entries (Devias), ${Object.keys(players).length} unique players`);

  return { players, bossLabel, killLogs };
}

// Calculate best kill streak (consecutive kills without dying) from kill logs
function calculateBestKillStreak(killLogs: KillLog[], bannedPlayers: Set<string> = new Set()): { name: string; streak: number } | null {
  if (!killLogs || killLogs.length === 0) return null;

  const playerStreaks = new Map<string, number>();
  const playerMaxStreaks = new Map<string, number>();

  for (const log of killLogs) {
    const killer = log.killer;
    const victim = log.victim;

    // Increment killer streak
    const currentStreak = (playerStreaks.get(killer) || 0) + 1;
    playerStreaks.set(killer, currentStreak);

    // Update max streak
    const globalMax = playerMaxStreaks.get(killer) || 0;
    if (currentStreak > globalMax) {
      playerMaxStreaks.set(killer, currentStreak);
    }

    // Reset victim streak
    playerStreaks.set(victim, 0);
  }

  // Find best streak among non-banned players
  let best: { name: string; streak: number } | null = null;
  for (const [name, streak] of playerMaxStreaks.entries()) {
    if (bannedPlayers.has(name)) continue;
    if (streak >= 2 && (!best || streak > best.streak)) {
      best = { name, streak };
    }
  }

  return best;
}

// Extrai timestamp do último kill válido no mapa do evento
function getLastKillTimestamp(
  logs: ExternalLogEntry[],
  eventType: 'boss_event' | 'throne_conquest',
): number | null {
  if (!logs || logs.length === 0) return null;

  const mapPatterns = eventType === 'throne_conquest'
    ? [
        /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i,
        /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i,
        /Devias\s*-\s*\[Server: Boss Event PvP\]/i,
      ]
    : [
        /\*\*PvP Square\*\*\s*-\s*\*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*\*/i,
        /\*PvP Square\*\s*-\s*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*/i,
        /PvP Square\s*-\s*\[Server: (?:Boss Event PvP|Platinum PvP)\]/i,
      ];

  for (const log of logs) {
    if (!log.content) continue;
    const hasValidMap = mapPatterns.some((pattern) => pattern.test(log.content));
    if (!hasValidMap) continue;

    const ts = parseLogTimestampMs(log);
    if (ts !== null) return ts;
  }

  return null;
}

// Adia postagem enquanto ainda houver PvP ativo (último kill recente)
function shouldPostpone(
  forceProcess: boolean,
  trigger: string | undefined,
  lastKillAtMs: number | null,
  idleMinutesRequired = EVENT_IDLE_MINUTES,
): boolean {
  // forceProcess só ignora idle para watchdog/manual — cron sempre respeita idle
  if (forceProcess && trigger !== 'cron') return false;
  if (lastKillAtMs === null) return false;

  const idleMin = Math.floor((brtNowMs() - lastKillAtMs) / 60000);
  return idleMin < idleMinutesRequired;
}

function getEventTimeRange(eventHour?: number, eventMinute: number = 0, eventType: 'boss_event' | 'throne_conquest' = 'boss_event'): { startDate: string; endDate: string; matchDate: string; matchHour: number; localStartDate: string; localEndDate: string } {
  // Brazil timezone offset (UTC-3)
  const BRAZIL_OFFSET = -3;
  
  // Get current time in Brazil timezone
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brazilTime = new Date(utcTime + (BRAZIL_OFFSET * 3600000));
  
  const dayOfWeek = brazilTime.getDay();
  const currentHour = brazilTime.getHours();
  
  console.log(`[Auto Process] Brazil time: ${brazilTime.toISOString()}, day: ${dayOfWeek}, hour: ${currentHour}, eventType: ${eventType}`);

  let targetEventHour: number;
  let targetEventMinute: number = eventMinute;

  // Use provided eventHour if available, otherwise determine from current time
  if (eventHour !== undefined) {
    targetEventHour = eventHour;
  } else {
    // Determine the event hour based on day and time
    if (dayOfWeek === 1) {
      // Monday: 21:00 and 22:00
      if (currentHour >= 22) targetEventHour = 22;
      else if (currentHour >= 21) targetEventHour = 21;
      else targetEventHour = 22;
    } else if (dayOfWeek === 2 || dayOfWeek === 4) {
      // Tuesday/Thursday: 19:00 and 22:30
      if (currentHour >= 22) targetEventHour = 22;
      else if (currentHour >= 19) targetEventHour = 19;
      else targetEventHour = 22;
    } else {
      // Other days: 19:00 and 22:00
      if (currentHour >= 22) targetEventHour = 22;
      else if (currentHour >= 19) targetEventHour = 19;
      else targetEventHour = 22;
    }
  }

  // Create event date in Brazil time
  const eventDateBrazil = new Date(brazilTime);
  eventDateBrazil.setHours(targetEventHour, targetEventMinute, 0, 0);

  // Only go back a day if we haven't reached the event time yet AND no eventHour was explicitly provided
  // When eventHour is provided via cron, we trust that the event already happened today
  if (eventHour === undefined && eventDateBrazil > brazilTime) {
    eventDateBrazil.setDate(eventDateBrazil.getDate() - 1);
  }

  // Convert Brazil time back to UTC for database query
  const startDateUTC = new Date(eventDateBrazil.getTime() - (BRAZIL_OFFSET * 3600000));
  
  // Determine end time based on event type
  let endOffsetMs = 3600000; // Default +1 hour
  if (eventType === 'throne_conquest') {
    // Throne Conquest: 21:36 to 22:36 = 60 minutes + buffer
    endOffsetMs = 4500000; // +75 minutes
  } else if (targetEventHour === 22) {
    endOffsetMs = 5400000; // +1.5 hours (until 23:30) for Boss
  } else if (targetEventHour === 19) {
    endOffsetMs = 7200000; // +2 hours (19:00 → ~21:00)
  }
  const endDateUTC = new Date(startDateUTC.getTime() + endOffsetMs);

  // Format match date in Brazil timezone for storage
  const matchDate = `${eventDateBrazil.getFullYear()}-${String(eventDateBrazil.getMonth() + 1).padStart(2, '0')}-${String(eventDateBrazil.getDate()).padStart(2, '0')}`;

  // Format local Brazil time strings for external database query (which stores in local time)
  let localEndHour = targetEventHour;
  let localEndMinute = 59;
  
  if (eventType === 'throne_conquest') {
    // Throne: 21:36 to 22:40 (with buffer)
    localEndHour = 22;
    localEndMinute = 40;
  } else if (targetEventHour === 22 && targetEventMinute === 0) {
    localEndHour = 23;
    localEndMinute = 29;
  } else if (targetEventHour === 22 && targetEventMinute === 30) {
    localEndHour = 23;
    localEndMinute = 29;
  } else if (targetEventHour === 19) {
    localEndHour = 20;
    localEndMinute = 59;
  }
  
  const localStartDate = `${matchDate}T${String(targetEventHour).padStart(2, '0')}:${String(targetEventMinute).padStart(2, '0')}`;
  const localEndDate = `${matchDate}T${String(localEndHour).padStart(2, '0')}:${String(localEndMinute).padStart(2, '0')}`;

  console.log(`[Auto Process] Event: ${matchDate} ${targetEventHour}:${String(targetEventMinute).padStart(2, '0')} BRT (${eventType})`);
  console.log(`[Auto Process] Local query range: ${localStartDate} to ${localEndDate}`);
  console.log(`[Auto Process] UTC query range: ${startDateUTC.toISOString()} to ${endDateUTC.toISOString()}`);

  return {
    startDate: startDateUTC.toISOString(),
    endDate: endDateUTC.toISOString(),
    matchDate,
    matchHour: targetEventHour,
    localStartDate,
    localEndDate
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Core processor extracted so we can optionally run it in background.
  const processRanking = async (body: RequestBody) => {
    const attempt = body.attempt || 1;
    const forceProcess = body.forceProcess || false;
    const forceReprocess = body.forceReprocess || false;
    const eventHour = body.eventHour;
    const eventMinute = body.eventMinute || 0;
    const eventType = body.eventType || 'boss_event';
    const hasCustomEnd =
      typeof body.eventEndHour === 'number' &&
      body.eventEndHour >= 0 &&
      body.eventEndHour <= 23;
    const eventEndHour = hasCustomEnd ? body.eventEndHour! : undefined;
    const eventEndMinute =
      hasCustomEnd && typeof body.eventEndMinute === 'number'
        ? Math.min(59, Math.max(0, body.eventEndMinute))
        : hasCustomEnd
          ? 0
          : undefined;
    
    console.log(`[Auto Process] Starting automatic ranking processing... Attempt: ${attempt}, Force: ${forceProcess}, Reprocess: ${forceReprocess}, EventHour: ${eventHour}, EventMinute: ${eventMinute}, EventType: ${eventType}, End: ${eventEndHour ?? '-'}:${eventEndMinute ?? '-'}`);

    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const internalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalClient = createClient(internalSupabaseUrl, internalServiceKey);

    let { startDate, endDate, matchDate, matchHour, localStartDate, localEndDate } = getEventTimeRange(eventHour, eventMinute, eventType);

    // Override matchDate if eventDate provided (homolog testing for past events)
    if (body.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(body.eventDate)) {
      const overrideDate = body.eventDate;
      // Recompute UTC startDate/endDate from overrideDate + matchHour/eventMinute (BRT = UTC-3)
      const sUtc = new Date(`${overrideDate}T${String(matchHour).padStart(2,'0')}:${String(eventMinute).padStart(2,'0')}:00-03:00`);
      let lEndH = matchHour, lEndM = 59;
      if (hasCustomEnd && eventEndHour !== undefined && eventEndMinute !== undefined) {
        lEndH = eventEndHour;
        lEndM = eventEndMinute;
      } else if (eventType === 'throne_conquest') {
        lEndH = 22; lEndM = 40;
      } else if (matchHour === 22) {
        lEndH = 23; lEndM = 29;
      } else if (matchHour === 19) {
        lEndH = 20; lEndM = 59;
      }
      const eUtc = new Date(`${overrideDate}T${String(lEndH).padStart(2,'0')}:${String(lEndM).padStart(2,'0')}:00-03:00`);
      startDate = sUtc.toISOString();
      endDate = eUtc.toISOString();
      matchDate = overrideDate;
      localStartDate = `${overrideDate}T${String(matchHour).padStart(2,'0')}:${String(eventMinute).padStart(2,'0')}`;
      localEndDate = `${overrideDate}T${String(lEndH).padStart(2,'0')}:${String(lEndM).padStart(2,'0')}`;
      console.log(`[Auto Process] OVERRIDE eventDate=${overrideDate} → ${localStartDate} to ${localEndDate} (UTC ${startDate} → ${endDate})`);
    } else if (hasCustomEnd && eventEndHour !== undefined && eventEndMinute !== undefined) {
      // Mesmo dia da partida, fim customizado (ex.: Throne manual)
      localEndDate = `${matchDate}T${String(eventEndHour).padStart(2,'0')}:${String(eventEndMinute).padStart(2,'0')}`;
      endDate = new Date(`${matchDate}T${String(eventEndHour).padStart(2,'0')}:${String(eventEndMinute).padStart(2,'0')}:00-03:00`).toISOString();
      console.log(`[Auto Process] Custom end window → ${localStartDate} to ${localEndDate}`);
    }

    console.log(`[Auto Process] Fetching logs for ${matchDate} ${matchHour}:${String(eventMinute).padStart(2, '0')} (${eventType})`);

    // Check if this match already exists - filter by event_type + minute to distinguish 22:00 vs 22:30
    const { data: existingRows } = await internalClient
      .from('pvp_matches')
      .select('id')
      .eq('match_date', matchDate)
      .eq('match_hour', matchHour)
      .eq('match_minute', eventMinute)
      .eq('event_type', eventType)
      .limit(1);
    const existingMatch = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existingMatch) {
      if (forceReprocess) {
        console.log(`[Auto Process] forceReprocess=true: deleting existing match ${existingMatch.id} and related data`);
        await internalClient.from('pvp_kill_logs').delete().eq('match_id', existingMatch.id);
        await internalClient.from('pvp_match_players').delete().eq('match_id', existingMatch.id);
        await internalClient.from('player_badges').delete().eq('match_id', existingMatch.id);
        await internalClient.from('pvp_matches').delete().eq('id', existingMatch.id);
      } else {
        console.log(`[Auto Process] ${eventType} match already exists for ${matchDate} ${matchHour}:00, skipping`);
        return {
          success: true,
          status: 'already_exists',
          message: 'Match already processed',
          matchDate,
          matchHour,
          eventType,
        };
      }
    }

    // Connect to external Supabase
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalUrl || !externalKey) {
      throw new Error('External database credentials not configured');
    }

    const externalClient = createClient(externalUrl, externalKey);

    // Query using local Brazil time (external DB stores timestamps in local time)
    // Paginate to fetch ALL logs (Supabase default limit is 1000 per request)
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 10;
    let logs: ExternalLogEntry[] = [];
    let page = 0;

    while (page < MAX_PAGES) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: pageLogs, error: logsError } = await externalClient
        .from('logs_pvp')
        .select('id, content, timestamp, created_at')
        .gte('timestamp', localStartDate)
        .lte('timestamp', localEndDate)
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (logsError) {
        throw new Error(`Failed to fetch logs: ${logsError.message}`);
      }

      if (!pageLogs || pageLogs.length === 0) break;

      logs = logs.concat(pageLogs as ExternalLogEntry[]);
      console.log(`[Auto Process] Page ${page + 1}: fetched ${pageLogs.length} logs (total: ${logs.length})`);

      if (pageLogs.length < PAGE_SIZE) break;
      page++;
    }

    // Deduplicate external logs by their id to prevent duplicate kill entries
    const seenLogIds = new Set<string>();
    const dedupedLogs: ExternalLogEntry[] = [];
    for (const log of logs) {
      if (!seenLogIds.has(log.id)) {
        seenLogIds.add(log.id);
        dedupedLogs.push(log);
      }
    }
    if (dedupedLogs.length < logs.length) {
      console.log(`[Auto Process] Deduplicated external logs: ${logs.length} -> ${dedupedLogs.length}`);
    }
    logs = dedupedLogs;

    console.log(`[Auto Process] Fetched ${logs.length} unique logs from external database`);

    if (!logs || logs.length === 0) {
      console.log('[Auto Process] No logs found for this time period');
      return { success: true, status: 'no_logs', message: 'No logs found', matchDate, matchHour, attempt, eventType };
    }

    // Check if we should postpone based on inactivity since last kill
    const lastKillAtMs = getLastKillTimestamp(logs, eventType);
    const idleMin = lastKillAtMs !== null
      ? Math.floor((brtNowMs() - lastKillAtMs) / 60000)
      : null;
    console.log(`[Auto Process] Last kill ms: ${lastKillAtMs ?? 'n/a'}, idle: ${idleMin ?? 'n/a'} min`);

    if (shouldPostpone(forceProcess, body.trigger, lastKillAtMs)) {
      console.log(`[Auto Process] Attempt ${attempt}: idle ${idleMin}min < ${EVENT_IDLE_MINUTES}min, postponing`);
      return {
        success: true,
        status: 'postponed',
        attempt,
        idleMin,
        idleThreshold: EVENT_IDLE_MINUTES,
        eventType,
        message: 'Event may still be active, waiting for inactivity',
      };
    }

    // Parse logs using the appropriate parser based on event type
    const parseResult = eventType === 'throne_conquest'
      ? parseExternalDbContentThrone(logs)
      : parseExternalDbContentBoss(logs);

    if (Object.keys(parseResult.players).length === 0) {
      console.log(`[Auto Process] No valid player data found after parsing for ${eventType}`);
      return { success: true, status: 'no_players', message: 'No valid player data', matchDate, matchHour, eventType };
    }

    const bossLabel = parseResult.bossLabel || (eventType === 'throne_conquest' 
      ? `Throne ${matchDate} ${matchHour}H`
      : `BOSSx2 ${matchDate} ${matchHour}H`);

    const bossKiller =
      typeof body.bossKiller === 'string' && body.bossKiller.trim()
        ? body.bossKiller.trim()
        : null;
    const bossNpcId =
      typeof body.bossNpcId === 'number' && Number.isFinite(body.bossNpcId)
        ? body.bossNpcId
        : null;

    // Insert match with event_type
    const { data: newMatch, error: matchError } = await internalClient
      .from('pvp_matches')
      .insert({
        match_date: matchDate,
        match_hour: matchHour,
        match_minute: eventMinute,
        boss_label: bossLabel,
        event_type: eventType,
        boss_killer: bossKiller,
        boss_npc_id: bossNpcId,
      })
      .select()
      .single();

    if (matchError) {
      throw new Error(`Failed to insert match: ${matchError.message}`);
    }

    console.log(`[Auto Process] Created ${eventType} match with ID: ${newMatch.id}`);

    // Insert players
    const playerInserts = Object.values(parseResult.players).map(player => ({
      match_id: newMatch.id,
      player_name: player.name,
      kills: player.kills,
      deaths: player.deaths,
      kda: player.kda,
    }));

    const { error: playersError } = await internalClient
      .from('pvp_match_players')
      .insert(playerInserts);

    if (playersError) {
      throw new Error(`Failed to insert players: ${playersError.message}`);
    }

    // Insert kill logs
    const killLogInserts = parseResult.killLogs.map(log => ({
      match_id: newMatch.id,
      killer_name: log.killer,
      victim_name: log.victim,
    }));

    const { error: killLogsError } = await internalClient
      .from('pvp_kill_logs')
      .insert(killLogInserts);

    if (killLogsError) {
      console.error('[Auto Process] Failed to insert kill logs:', killLogsError.message);
    }

    // Sincroniza guild/classe/sigla dos jogadores do evento (+ boss killer) antes de calcular rankings
    const playerNames = Object.keys(parseResult.players);
    const syncNames = bossKiller && !playerNames.includes(bossKiller)
      ? [...playerNames, bossKiller]
      : playerNames;
    console.log(`[Auto Process] Syncing ${syncNames.length} characters from VortexMU...`);
    const syncSummary = await syncCharactersFromVortex(internalClient, syncNames, {
      concurrency: 5,
      delayMs: 150,
    });
    console.log(`[Auto Process] VortexMU sync:`, syncSummary);

    // Fetch character data (including banned status for filtering)
    const { data: characters } = await internalClient
      .from('characters')
      .select('name, guild, class, banned, class_short')
      .in('name', syncNames);

    const characterMap: Record<string, { guild: string; class: string; banned: boolean; class_short: string }> = {};
    if (characters) {
      for (const char of characters) {
        characterMap[char.name] = { guild: char.guild, class: char.class, banned: char.banned || false, class_short: char.class_short || '' };
      }
    }

    // Filter out banned players from rankings
    const bannedPlayerNames = new Set(
      Object.entries(characterMap)
        .filter(([_, data]) => data.banned)
        .map(([name, _]) => name),
    );

    let nonBannedPlayers = Object.values(parseResult.players)
      .filter(p => !bannedPlayerNames.has(p.name));

    // Boss event: descontar fogo amigo (mesma guild) das kills/deaths/KDA
    // para alinhar com o site (get_ranking_geral). Throne/Arka mantêm contagem bruta.
    // Os kill_logs no banco continuam intactos (preserva ranking de Fogo Amigo).
    if (eventType === 'boss_event') {
      const ffKills: Record<string, number> = {};
      const ffDeaths: Record<string, number> = {};
      for (const log of parseResult.killLogs) {
        if (bannedPlayerNames.has(log.killer) || bannedPlayerNames.has(log.victim)) continue;
        if (log.killer === log.victim) continue;
        const kg = characterMap[log.killer]?.guild;
        const vg = characterMap[log.victim]?.guild;
        if (!kg || !vg || kg !== vg) continue;
        ffKills[log.killer] = (ffKills[log.killer] || 0) + 1;
        ffDeaths[log.victim] = (ffDeaths[log.victim] || 0) + 1;
      }
      nonBannedPlayers = nonBannedPlayers.map(p => {
        const k = Math.max(0, p.kills - (ffKills[p.name] || 0));
        const d = Math.max(0, p.deaths - (ffDeaths[p.name] || 0));
        const kda = d === 0 ? k : parseFloat((k / d).toFixed(2));
        return { ...p, kills: k, deaths: d, kda };
      });
      console.log(`[Auto Process] Boss FF excluído: ${Object.keys(ffKills).length} killers, ${Object.keys(ffDeaths).length} victims ajustados`);
    }

    // Calculate guild summary with full stats (only non-banned players)
    const guildSummary: Record<string, GuildStats> = {};
    for (const player of nonBannedPlayers) {
      const charInfo = characterMap[player.name];
      const guild = charInfo?.guild || 'Sem Guild';
      if (!guildSummary[guild]) {
        guildSummary[guild] = { playerCount: 0, kills: 0, deaths: 0 };
      }
      guildSummary[guild].playerCount++;
      guildSummary[guild].kills += player.kills;
      guildSummary[guild].deaths += player.deaths;
    }

    // Calculate guild scores and sort
    const guildsWithScore = Object.entries(guildSummary).map(([guild, stats]) => {
      const guildKDA = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
      const score = (stats.kills * 3) + (guildKDA * 1) + (stats.playerCount * 1) - (stats.deaths * 3);
      return { guild, ...stats, score };
    });
    const sortedGuilds = guildsWithScore.sort((a, b) => b.score - a.score);
    const guildRankingText = formatGuildRankingTable(sortedGuilds);

    // Calculate special rankings using formula: (kills*3) + (kda*1) + (participação*1) - (deaths*3)
    const playersWithEventScore = nonBannedPlayers.map(p => ({
      ...p,
      eventScore: (p.kills * 3) + (p.kda * 1) + 1 - (p.deaths * 3),
    }));

    // Cone Monodedo = worst eventScore (lowest)
    const sortedByEventScore = [...playersWithEventScore].sort((a, b) => a.eventScore - b.eventScore);
    const coneMonodedo = sortedByEventScore[0];

    // Rei do PVP / Rei do Trono = best eventScore (highest), excluding cone monodedo
    const eligibleForRei = playersWithEventScore.filter(p => p.name !== coneMonodedo?.name);
    const reiDoPVP = [...eligibleForRei].sort((a, b) => b.eventScore - a.eventScore)[0];

    // Brabissimo = best KDA, excluding cone monodedo
    const sortedByKDA = playersWithEventScore
      .filter(p => p.name !== coneMonodedo?.name)
      .sort((a, b) => b.kda - a.kda);
    const brabissimo = sortedByKDA[0];

    // Calculate best kill streak from killLogs
    const bestKillStreak = calculateBestKillStreak(parseResult.killLogs, bannedPlayerNames);

    // Agente Duplo: jogador que mais matou aliados da mesma guild (excluindo banidos)
    const friendlyKillsCount: Record<string, number> = {};
    for (const log of parseResult.killLogs) {
      if (bannedPlayerNames.has(log.killer) || bannedPlayerNames.has(log.victim)) continue;
      if (log.killer === log.victim) continue;
      const kg = characterMap[log.killer]?.guild;
      const vg = characterMap[log.victim]?.guild;
      if (!kg || !vg || kg !== vg) continue;
      friendlyKillsCount[log.killer] = (friendlyKillsCount[log.killer] || 0) + 1;
    }
    const agenteDuploEntry = Object.entries(friendlyKillsCount).sort((a, b) => b[1] - a[1])[0];
    const agenteDuplo = agenteDuploEntry
      ? { name: agenteDuploEntry[0], friendlyKills: agenteDuploEntry[1], guild: characterMap[agenteDuploEntry[0]]?.guild || '' }
      : null;

    // Putinha da Noite: par killer→victim com mais ocorrências
    const pairCount: Record<string, number> = {};
    for (const log of parseResult.killLogs) {
      if (bannedPlayerNames.has(log.killer) || bannedPlayerNames.has(log.victim)) continue;
      if (log.killer === log.victim) continue;
      const k = `${log.killer}→${log.victim}`;
      pairCount[k] = (pairCount[k] || 0) + 1;
    }
    const putinhaEntry = Object.entries(pairCount).sort((a, b) => b[1] - a[1])[0];
    const putinhaNoite = putinhaEntry
      ? (() => { const [d, p] = putinhaEntry[0].split('→'); return { dominador: d, putinha: p, kills: putinhaEntry[1] }; })()
      : null;

    const totals = {
      kills: nonBannedPlayers.reduce((sum, p) => sum + p.kills, 0),
      deaths: nonBannedPlayers.reduce((sum, p) => sum + p.deaths, 0),
      playerCount: nonBannedPlayers.length,
    };

    // Build ranking table text - excluding banned
    const playersWithScore = nonBannedPlayers.map(player => {
      const eventScore = (player.kills * 3) + (player.kda * 1) + 1 - (player.deaths * 3);
      const charInfo = characterMap[player.name];
      return { ...player, eventScore, class_short: charInfo?.class_short || '' };
    });
    const sortedPlayers = playersWithScore.sort((a, b) => b.eventScore - a.eventScore);
    const rankingTableText = formatRankingTable(sortedPlayers);

    // Post to Discord - select webhook based on event type (or homolog when testing)
    const isPostingPaused = Deno.env.get('AUTO_POST_PAUSED') === 'true';
    let webhookUrl: string | undefined;
    if (body.testHomolog) {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL'); // homolog
    } else if (eventType === 'throne_conquest') {
      // Throne Conquest: only post if triggered by cron or if manually forced AND it's a reprocess
      // The user wants manual "Process" button in UI to NOT post automatically,
      // so they can fill the winner guild first.
      const isManualFirstTime = !body.trigger && !body.forceReprocess;
      if (isManualFirstTime) {
        console.log(`[Auto Process] 🛡️ Manual process for Throne. Skipping Discord post so admin can fill winner guild.`);
        webhookUrl = undefined;
      } else {
        webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_THRONE');
      }
    } else {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_PROD') || Deno.env.get('DISCORD_WEBHOOK_URL');
    }

    if (isPostingPaused && !body.testHomolog) {
      console.log(`[Auto Process] ⏸️ Discord posting is PAUSED. Skipping webhook for ${eventType} (${matchDate} ${matchHour}H). Data was saved successfully.`);
    } else if (webhookUrl) {
      const [year, month, day] = matchDate.split('-');
      const formattedDate = `${day}/${month}/${year}`;
      const formattedHour = `${String(matchHour).padStart(2, '0')}:${String(eventMinute).padStart(2, '0')}`;

      const isThrone = eventType === 'throne_conquest';
      const rankingTitle = isThrone ? '🏆 Ranking Throne Conquest' : '🏆 Ranking BOSS Diário';
      const reiTitle = isThrone ? '👑 REI DO TRONO' : '👑 REI DO PvP';
      const embedColor = isThrone ? 0xF59E0B : 0x10B981;
      const eventLabel = isThrone ? 'Throne Conquest' : 'Boss/evento';

      const SEP = '━━━━━━━━━━━━━━━━━━';

      // Frases dinâmicas (rotação)
      const selectPhrase = async (category: string, name: string, value: string, fallback: string): Promise<string> => {
        try {
          const { data, error } = await internalClient
            .from('discord_highlight_phrases')
            .select('id, phrase_template')
            .eq('category', category)
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .limit(1)
            .single();
          if (error || !data) return fallback;
          await internalClient
            .from('discord_highlight_phrases')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', data.id);
          return data.phrase_template.replace(/\{name\}/g, name).replace(/\{value\}/g, value);
        } catch {
          return fallback;
        }
      };

      const footerLines: string[] = [`**Destaques ${eventLabel}:**`];
      if (bestKillStreak) {
        footerLines.push(`1 - ${await selectPhrase('kill_streak', `**${bestKillStreak.name}**`, String(bestKillStreak.streak), `**${bestKillStreak.name}** matou ${bestKillStreak.streak} vezes sem morrer!`)}`);
      }
      if (brabissimo) {
        footerLines.push(`2 - ${await selectPhrase('best_kda', `**${brabissimo.name}**`, brabissimo.kda.toFixed(2), `**${brabissimo.name}** KDA implacável ${brabissimo.kda.toFixed(2)}`)}`);
      }
      if (coneMonodedo) {
        footerLines.push(`3 - ${await selectPhrase('cone', `**${coneMonodedo.name}**`, String(coneMonodedo.deaths), `**${coneMonodedo.name}** morreu ${coneMonodedo.deaths} vezes!`)}`);
      }
      const footerMessage = footerLines.join('\n');

      // === Embed 1 — Resumo principal estruturado ===
      const lines: string[] = [];
      lines.push(`📅 ${formattedDate}  •  ⏰ ${formattedHour}`);
      lines.push(`🎯 Ordenação: Event Score`);
      if (bossKiller) {
        const bossName = bossNpcLabel(bossNpcId);
        const killerGuild = characterMap[bossKiller]?.guild?.trim();
        const killerLabel =
          killerGuild && killerGuild !== 'Sem Guild'
            ? `${bossKiller} - ${killerGuild}`
            : bossKiller;
        lines.push(`🐉 Boss Killer: **${killerLabel}**${bossName ? ` — ${bossName}` : ''}`);
      }
      lines.push(SEP);

      // Pódio principal
      if (reiDoPVP) {
        lines.push(`${isThrone ? '👑 **REI DO TRONO**' : '🥇 **REI DO PvP**'}`);
        lines.push(`👑 **${reiDoPVP.name}**`);
        lines.push(`⚔️ ${reiDoPVP.eventScore.toFixed(2)} Score • ${reiDoPVP.kills}K / ${reiDoPVP.deaths}D`);
        lines.push('');
      }
      if (brabissimo) {
        lines.push(`🥈 **BRABÍSSIMO**`);
        lines.push(`⚡ **${brabissimo.name}**`);
        lines.push(`⚔️ KDA ${brabissimo.kda.toFixed(2)} • ${brabissimo.kills}K / ${brabissimo.deaths}D`);
        lines.push('');
      }
      if (coneMonodedo) {
        lines.push(`🥉 **CONE MONODEDO**`);
        lines.push(`🍦 **${coneMonodedo.name}**`);
        lines.push(`💀 ${coneMonodedo.eventScore.toFixed(2)} Score • ${coneMonodedo.kills}K / ${coneMonodedo.deaths}D`);
      }

      lines.push(SEP);
      lines.push(`😂 **TROFÉUS ESPECIAIS**`);
      lines.push('');
      if (agenteDuplo) {
        lines.push(`🕵️ **Agente Duplo**`);
        lines.push(`📛 **${agenteDuplo.name}**${agenteDuplo.guild ? ` • ${agenteDuplo.guild}` : ''}`);
        lines.push(`☠️ ${agenteDuplo.friendlyKills} aliado(s) eliminado(s)`);
        lines.push('');
      } else {
        lines.push(`🕵️ **Agente Duplo** — _nenhum traidor hoje_`);
        lines.push('');
      }
      if (putinhaNoite) {
        lines.push(`💔 **Putinha da Noite**`);
        lines.push(`📛 **${putinhaNoite.dominador}** → **${putinhaNoite.putinha}**`);
        lines.push(`⚰️ ${putinhaNoite.kills} morte(s) sofrida(s)`);
      } else {
        lines.push(`💔 **Putinha da Noite** — _sem dominância clara_`);
      }

      lines.push(SEP);
      lines.push(`📊 **ESTATÍSTICAS**`);
      lines.push(`👥 Jogadores: **${totals.playerCount}**`);
      lines.push(`⚔️ Kills: **${totals.kills}**`);
      lines.push(`💀 Deaths: **${totals.deaths}**`);

      const embed1 = {
        title: rankingTitle,
        description: lines.join('\n'),
        color: embedColor,
        footer: {
          text: `Tentativa ${attempt}${forceProcess ? ' (forçado)' : ''}${body.testHomolog ? ' • TESTE HOMOLOG' : ''}`,
        },
        timestamp: new Date().toISOString(),
      };

      // === Embed 2 — Ranking por Guild (tabela) ===
      const embed2 = {
        title: '⚔️ Ranking por Guild',
        description: '```\n' + guildRankingText.substring(0, 3990) + '\n```',
        color: embedColor,
      };

      // === Embed 3 — Ranking completo (tabela) ===
      const embed3 = {
        title: '🏆 Ranking Completo',
        description: '```\n' + rankingTableText.substring(0, 3990) + '\n```',
        color: embedColor,
      };

      // === Embed 4 — Destaques + link ===
      const frontendUrlRaw = Deno.env.get('FRONTEND_URL') || 'https://rankingpvpboss.lovable.app';
      const frontendUrl = frontendUrlRaw.replace(/\/+$/, '');
      const tabParam = isThrone ? 'throne' : 'ranking';
      const rankingLink = `${frontendUrl}/?tab=${tabParam}&date=${matchDate}&hour=${matchHour}`;

      const embed4 = {
        description: `${footerMessage}\n\n🔗 **[Ver ranking completo no site](${rankingLink})**`,
        color: 0x9b87f5,
      };

      const discordResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed1, embed2, embed3, embed4] }),
      });

      if (!discordResponse.ok) {
        console.error('[Auto Process] Failed to post to Discord:', await discordResponse.text());
      } else {
        console.log(`[Auto Process] Successfully posted ${eventType} to Discord${body.testHomolog ? ' (HOMOLOG TEST)' : ''}`);
      }
    } else {
      console.log(`[Auto Process] No Discord webhook configured for ${eventType}`);
    }

    console.log(`[Auto Process] Completed ${eventType} successfully`);

    // Fire-and-forget milestones check (non-blocking)
    try {
      const milestonesUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-milestones`;
      fetch(milestonesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ match_id: newMatch.id }),
      }).catch((e) => console.error('[Auto Process] check-milestones invoke failed:', e));
    } catch (e) {
      console.error('[Auto Process] check-milestones setup error:', e);
    }

    // Fire-and-forget badges check (non-blocking)
    try {
      const badgesUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-badges`;
      fetch(badgesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ match_id: newMatch.id }),
      }).catch((e) => console.error('[Auto Process] check-badges invoke failed:', e));
    } catch (e) {
      console.error('[Auto Process] check-badges setup error:', e);
    }


    return {
      success: true,
      status: 'processed',
      matchId: newMatch.id,
      matchDate,
      matchHour,
      playerCount: totals.playerCount,
      totalKills: totals.kills,
      attempt,
      forceProcess,
      eventType,
      bossKiller,
      bossNpcId,
    };
  };

  try {
    // Parse request body
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON, use defaults
    }

    // --- Authentication ---
    const authHeader = req.headers.get('Authorization');

    // Postagem automática antiga (cron fixo / watchdog) desativada — só detect-boss-kill
    if (body.trigger === 'cron' || body.trigger === 'watchdog') {
      console.log(`[Auto Process] Trigger "${body.trigger}" disabled. Use detect-boss-kill.`);
      return new Response(
        JSON.stringify({
          success: false,
          status: 'disabled',
          message: 'Automatic posting via cron/watchdog is disabled. Boss kill detector is the only auto path.',
          trigger: body.trigger,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Disparo automático do detector de boss kill (service role / anon via pg_net)
    if (body.trigger === 'boss_kill') {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      const token = authHeader?.replace('Bearer ', '') || '';
      if (!token || (token !== serviceRoleKey && token !== anonKey)) {
        console.error('[Auto Process] Unauthorized boss_kill trigger attempt');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const result = await processRanking(body);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Manual / UI calls: require authenticated admin or moderator
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check admin or moderator role using service role client
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'moderator'])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin or moderator role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Default (manual / UI): run synchronously and return result.
    const result = await processRanking(body);
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('[Auto Process] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
