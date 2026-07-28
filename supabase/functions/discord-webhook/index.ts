import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { syncCharactersFromVortex, getClassShort } from '../_shared/vortexSync.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpecialRankings {
  reiDoPVP: { name: string; kills: number; deaths: number; matches: number };
  brabissimo: { name: string; singleMatchKills: number; matches: number };
  coneMonodedo: { name: string; deaths: number; matches: number };
  agenteDuplo?: { name: string; friendlyKills: number; guild: string };
  putinhaNoite?: { dominador: string; putinha: string; kills: number };
}

interface StreakRankings {
  first: { name: string; streak: number; type: string; emoji: string } | null;
  second: { name: string; streak: number; type: string; emoji: string } | null;
  third: { name: string; streak: number; type: string; emoji: string } | null;
}

interface Filters {
  class?: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: number;
  hourTo?: number;
  sortBy?: string;
}

interface GuildData {
  guild: string;
  playerCount: number;
  kills: number;
  deaths: number;
  score: number;
}

interface PlayerData {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
  eventScore: number;
  class_short?: string;
}

interface KillLogEntry {
  killer_name: string;
  victim_name: string;
}

interface GeneralRankingBody {
  type?: 'general';
  environment: 'homolog' | 'prod';
  filters: Filters;
  specialRankings: SpecialRankings;
  image: string;
  specialCardsImage: string;
  totals: {
    kills: number;
    deaths: number;
    playerCount: number;
  };
  guildSummary: Record<string, number>; // Legacy format (backward compatibility)
  guildRanking?: GuildData[]; // New format with full stats
  playerRanking?: PlayerData[]; // Player ranking for text table
  killLogs?: KillLogEntry[]; // Kill logs for streak calculation
  eventType?: 'boss_event' | 'throne_conquest'; // Type of event
  winnerGuild?: string; // Guild vencedora do evento (Throne/Arka)
}

interface PutinhaEntry {
  position: number;
  killer: string;
  killerGuild: string;
  victim: string;
  victimGuild: string;
  deaths: number;
  level: string;
}

interface PutinhaBody {
  type: 'putinha';
  environment: 'homolog' | 'prod';
  filters: Filters;
  putinhaData: PutinhaEntry[];
  totals: { relationCount: number };
}

interface KillStreakBody {
  type: 'killstreak';
  environment: 'homolog' | 'prod';
  filters: Filters;
  streakRankings: StreakRankings;
  image: string;
  totals: {
    playerCount: number;
  };
}

interface SorteioBody {
  type: 'sorteio';
  environment: 'homolog' | 'prod';
  participants: { name: string; guild: string; matchCount: number }[];
  winners: { name: string; guild: string }[];
  filters: Filters;
  totals: { participantCount: number; prizeCount: number };
}

interface FogoAmigoEntry {
  name: string;
  class_short?: string;
  guild?: string;
  friendly_kills: number;
  friendly_deaths: number;
  kda: number;
  eventScore: number;
}

interface FogoAmigoBody {
  type: 'fogo_amigo';
  environment: 'homolog' | 'prod';
  filters: Filters & { eventType?: string };
  ranking: FogoAmigoEntry[];
  totals: { playerCount: number; totalFriendlyKills: number };
}

type RequestBody = GeneralRankingBody | KillStreakBody | PutinhaBody | SorteioBody | FogoAmigoBody;

// Format Fogo Amigo ranking as monospaced table
function formatFogoAmigoTable(entries: FogoAmigoEntry[]): string {
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

// Format guild ranking as monospaced table for Discord (same as auto-process-ranking)
function formatGuildRankingTable(guilds: GuildData[]): string {
  if (!guilds || guilds.length === 0) return 'Nenhuma guild registrada';
  
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

// Format player ranking as monospaced table for Discord (same as auto-process-ranking)
function formatRankingTable(players: PlayerData[]): string {
  if (!players || players.length === 0) return '';
  
  const maxNameLen = Math.max(7, ...players.map(p => p.name.length));
  const hasClassShort = players.some(p => p.class_short && p.class_short.trim() !== '');
  const classColWidth = 5;
  
  let table = '🏆 RANKING PVP\n';
  table += '═'.repeat(hasClassShort ? 57 : 52) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + (hasClassShort ? 'Sigla ' : '') + '  K    D    KDA     Score\n';
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

function collectNamesFromGeneralBody(body: GeneralRankingBody): string[] {
  const names = new Set<string>();

  for (const player of body.playerRanking || []) {
    if (player.name?.trim()) names.add(player.name.trim());
  }

  const sr = body.specialRankings;
  if (sr.reiDoPVP?.name) names.add(sr.reiDoPVP.name);
  if (sr.brabissimo?.name) names.add(sr.brabissimo.name);
  if (sr.coneMonodedo?.name) names.add(sr.coneMonodedo.name);
  if (sr.agenteDuplo?.name) names.add(sr.agenteDuplo.name);
  if (sr.putinhaNoite?.dominador) names.add(sr.putinhaNoite.dominador);
  if (sr.putinhaNoite?.putinha) names.add(sr.putinhaNoite.putinha);

  for (const log of body.killLogs || []) {
    if (log.killer_name?.trim()) names.add(log.killer_name.trim());
    if (log.victim_name?.trim()) names.add(log.victim_name.trim());
  }

  return [...names];
}

function rebuildGuildRanking(
  players: PlayerData[],
  guildByName: Map<string, string>,
): GuildData[] {
  const guildStats: Record<string, { playerCount: number; kills: number; deaths: number }> = {};

  for (const player of players) {
    const guild = guildByName.get(player.name) || 'Sem Guild';
    if (!guildStats[guild]) {
      guildStats[guild] = { playerCount: 0, kills: 0, deaths: 0 };
    }
    guildStats[guild].playerCount++;
    guildStats[guild].kills += player.kills;
    guildStats[guild].deaths += player.deaths;
  }

  return Object.entries(guildStats)
    .map(([guild, stats]) => {
      const guildKDA = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
      const score = (stats.kills * 3) + (guildKDA * 1) + (stats.playerCount * 1) - (stats.deaths * 3);
      return { guild, ...stats, score };
    })
    .sort((a, b) => b.score - a.score);
}

async function syncAndEnrichGeneralRanking(body: GeneralRankingBody): Promise<{
  players: PlayerData[];
  guildRanking: GuildData[];
  guildByName: Map<string, string>;
}> {
  const players = body.playerRanking || [];
  const names = collectNamesFromGeneralBody(body);

  if (names.length === 0) {
    return {
      players,
      guildRanking: body.guildRanking || [],
      guildByName: new Map(),
    };
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  console.log(`[Discord Webhook] Syncing ${names.length} characters from VortexMU...`);
  await syncCharactersFromVortex(serviceClient, names, { concurrency: 5, delayMs: 150 });

  const { data: chars, error } = await serviceClient
    .from('characters')
    .select('name, guild, class, class_short')
    .in('name', names);

  if (error) {
    console.error('[Discord Webhook] Failed to load characters after sync:', error);
    return {
      players,
      guildRanking: body.guildRanking || [],
      guildByName: new Map(),
    };
  }

  const charMap = new Map((chars || []).map((row) => [row.name, row]));
  const guildByName = new Map<string, string>();

  for (const name of names) {
    const row = charMap.get(name);
    guildByName.set(name, row?.guild || 'Sem Guild');
  }

  const enrichedPlayers = players.map((player) => {
    const row = charMap.get(player.name);
    const classShort = (player.class_short || '').trim()
      || (row?.class_short || '').trim()
      || getClassShort(row?.class);
    return { ...player, class_short: classShort };
  });

  return {
    players: enrichedPlayers,
    guildRanking: rebuildGuildRanking(enrichedPlayers, guildByName),
    guildByName,
  };
}

async function enrichPlayerRankingWithClassShort(players: PlayerData[]): Promise<PlayerData[]> {
  if (!players || players.length === 0) return [];

  const missingNames = [...new Set(
    players
      .filter((player) => !player.class_short || !player.class_short.trim())
      .map((player) => player.name.trim())
      .filter(Boolean)
  )];

  if (missingNames.length === 0) return players;

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await serviceClient
      .from('characters')
      .select('name, class, class_short')
      .in('name', missingNames);

    if (error) {
      console.error('[Discord Webhook] Failed to enrich class_short:', error);
      return players;
    }

    const CLASS_SHORT_MAP: Record<string, string> = {
      'Arcane Lancer': 'GL', 'Battle Mage': 'LEM', 'Bloody Fighter': 'RF',
      'Creator': 'ALQ', 'Dark Knight': 'BK', 'Dark Wizard': 'SM',
      'Darkness Wizard': 'SM', 'Douple Knight': 'MG', 'Endless Summoner': 'SUM',
      'Fist Blazer': 'RF', 'Force Emperor': 'DL', 'Glory Wizard': 'KD',
      'Grand Master': 'SM', 'Ignition Knight': 'BK', 'Infinity Rune Wizard': 'RW',
      'Light Wizard': 'KD', 'Magnus Gun Crusher': 'GUN', 'Majestic Rune Wizard': 'RW',
      'Master Paladim': 'CRZ', 'Noble Elves': 'ELF', 'Phantom Pain Knight': 'IK',
      'Rage Fighter': 'RF', 'Rogue Slayer': 'SLA', 'Royal Elf': 'ELF',
      'Shining Lancer': 'GL', 'Slaughterer': 'SLA', 'Soul Wizard': 'SM',
      'Templar Commander': 'CRZ',
    };

    const classShortByName = new Map(
      (data || []).map((row) => {
        const fromDb = (row.class_short || '').trim();
        const fromMap = CLASS_SHORT_MAP[(row.class || '').trim()] || '';
        return [row.name, fromDb || fromMap];
      })
    );

    return players.map((player) => ({
      ...player,
      class_short: player.class_short?.trim() || classShortByName.get(player.name) || '',
    }));
  } catch (error) {
    console.error('[Discord Webhook] Unexpected error enriching class_short:', error);
    return players;
  }
}

// Format putinha ranking as monospaced table for Discord
function formatPutinhaTable(entries: PutinhaEntry[]): string {
  if (!entries || entries.length === 0) return 'Nenhuma relação encontrada';
  
  const maxKillerLen = Math.max(9, ...entries.map(e => e.killer.length));
  const maxVictimLen = Math.max(8, ...entries.map(e => e.victim.length));
  
  let table = '💀 RANKING MINHA PUTINHA\n';
  table += '═'.repeat(60) + '\n\n';
  table += ' Pos  ' + 'Dominador'.padEnd(maxKillerLen + 2) + 'Kills  ' + 'Putinha'.padEnd(maxVictimLen + 2) + 'Nível\n';
  table += '─'.repeat(60) + '\n';
  
  entries.forEach((entry, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const killerStr = entry.killer.padEnd(maxKillerLen + 2);
    const killsStr = (entry.deaths.toString() + '×').padStart(5) + '  ';
    const victimStr = entry.victim.padEnd(maxVictimLen + 2);
    const levelStr = entry.level;
    
    table += `${posStr} ${killerStr}${killsStr}${victimStr}${levelStr}\n`;
  });
  
  return table;
}


function calculateBestKillStreakFromLogs(killLogs: KillLogEntry[]): { name: string; streak: number } | null {
  if (!killLogs || killLogs.length === 0) return null;

  const playerStreaks = new Map<string, number>();
  const playerMaxStreaks = new Map<string, number>();

  for (const log of killLogs) {
    const killer = log.killer_name;
    const victim = log.victim_name;

    const currentStreak = (playerStreaks.get(killer) || 0) + 1;
    playerStreaks.set(killer, currentStreak);

    const globalMax = playerMaxStreaks.get(killer) || 0;
    if (currentStreak > globalMax) {
      playerMaxStreaks.set(killer, currentStreak);
    }

    playerStreaks.set(victim, 0);
  }

  let best: { name: string; streak: number } | null = null;
  for (const [name, streak] of playerMaxStreaks.entries()) {
    if (streak >= 2 && (!best || streak > best.streak)) {
      best = { name, streak };
    }
  }

  return best;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client to check admin role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if user has admin role
    const { data: hasAdminRole, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (roleError || !hasAdminRole) {
      console.error('Role check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body: RequestBody = await req.json();
    const rankingType = body.type || 'general';
    console.log(`Received request to post ${rankingType} ranking to Discord from user ${user.email}`);
    
    // Get Discord webhook URL from environment secrets based on event type
    const generalBody = rankingType === 'general' ? body as GeneralRankingBody : null;
    const isThrone = generalBody?.eventType === 'throne_conquest';
    
    let webhookUrl: string | undefined;
    // Sorteio always uses LEGENDS webhook
    if (rankingType === 'sorteio') {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_LEGENDS');
    } else if (isThrone) {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_THRONE');
    } else if (body.environment === 'prod') {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_PROD');
    } else {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
    }
    
    if (!webhookUrl) {
      const webhookType = rankingType === 'sorteio' ? 'LEGENDS' : isThrone ? 'Throne Conquest' : body.environment;
      throw new Error(`Webhook URL not configured for ${webhookType}`);
    }
    
    console.log(`Publishing to ${body.environment} environment`);
    
    // Criar embeds baseado no tipo
    let embeds: any[];
    const formData = new FormData();
    if (rankingType === 'sorteio') {
      const sorteioBody = body as SorteioBody;
      const participantList = sorteioBody.participants.map((p, i) => `${i + 1}. ${p.name} (${p.guild}) - ${p.matchCount}x`).join('\n');
      const winnerList = sorteioBody.winners.map((w, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        return `${medal} **${w.name}** (${w.guild})`;
      }).join('\n');

      embeds = [
        {
          title: '🎉 Sorteio LEGENDS & iLEGENDS',
          description: `**${sorteioBody.totals.participantCount}** participantes • **${sorteioBody.totals.prizeCount}** prêmio(s)`,
          color: 0xFFD700,
          fields: [
            { name: '🔍 Filtros', value: formatFilters(sorteioBody.filters), inline: false },
            { name: '🏆 Ganhadores', value: winnerList, inline: false },
            { name: '👥 Participantes', value: '```\n' + participantList.substring(0, 1000) + '\n```', inline: false },
          ],
          timestamp: new Date().toISOString()
        }
      ];
    } else if (rankingType === 'fogo_amigo') {
      const faBody = body as FogoAmigoBody;
      const tableText = formatFogoAmigoTable(faBody.ranking);

      const embed1 = {
        title: '🔥 Ranking: Fogo Amigo',
        description: `Kills entre membros da mesma guild\n**${faBody.totals.playerCount}** jogadores • **${faBody.totals.totalFriendlyKills}** kills aliadas`,
        color: 0xDC2626,
        fields: [
          { name: '🔍 Filtros Aplicados', value: formatFilters(faBody.filters), inline: false }
        ],
        timestamp: new Date().toISOString()
      };

      const embed2 = {
        description: '```\n' + tableText.substring(0, 4000) + '\n```',
        color: 0xDC2626
      };

      const frontendUrl = (Deno.env.get('FRONTEND_URL') || 'https://rankingpvpboss.lovable.app').replace(/\/+$/, '');
      const embed3 = {
        description: `🔗 **[Ver ranking completo no site](${frontendUrl}/?tab=fogo-amigo)**`,
        color: 0x9b87f5
      };

      embeds = [embed1, embed2, embed3];
    } else if (rankingType === 'putinha') {
      const putinhaBody = body as PutinhaBody;
      
      const embed1 = {
        title: '💀 Ranking: Minha Putinha',
        description: `Quem morre 10+ vezes para o mesmo jogador\n**${putinhaBody.totals.relationCount}** relações de dominância`,
        color: 0xEF4444,
        fields: [
          {
            name: '🔍 Filtros Aplicados',
            value: formatFilters(putinhaBody.filters),
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };

      const tableText = formatPutinhaTable(putinhaBody.putinhaData);
      const embed2 = {
        description: '```\n' + tableText.substring(0, 4000) + '\n```',
        color: 0xEF4444
      };

      const frontendUrl = (Deno.env.get('FRONTEND_URL') || 'https://rankingpvpboss.lovable.app').replace(/\/+$/, '');
      const embed3 = {
        description: `🔗 **[Ver ranking completo no site](${frontendUrl}/?tab=putinha)**`,
        color: 0x9b87f5
      };

      embeds = [embed1, embed2, embed3];
    } else if (rankingType === 'killstreak') {
      // Kill streak still uses image
      const killStreakBody = body as KillStreakBody;
      
      if (!body.image || typeof body.image !== 'string') {
        throw new Error('Image data is missing or invalid for killstreak');
      }
      
      const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([imageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
      formData.append('file1', blob, 'kill-streak-ranking.jpg');
      
      const fields = [];
      fields.push({
        name: '🔍 Filtros Aplicados',
        value: formatFilters(body.filters),
        inline: false
      });
      
      if (killStreakBody.streakRankings.first) {
        fields.push({
          name: `${killStreakBody.streakRankings.first.emoji} 1º Lugar - ${killStreakBody.streakRankings.first.type}`,
          value: `**${killStreakBody.streakRankings.first.name}**\n${killStreakBody.streakRankings.first.streak} kills seguidos`,
          inline: true
        });
      }
      
      if (killStreakBody.streakRankings.second) {
        fields.push({
          name: `${killStreakBody.streakRankings.second.emoji} 2º Lugar - ${killStreakBody.streakRankings.second.type}`,
          value: `**${killStreakBody.streakRankings.second.name}**\n${killStreakBody.streakRankings.second.streak} kills seguidos`,
          inline: true
        });
      }
      
      if (killStreakBody.streakRankings.third) {
        fields.push({
          name: `${killStreakBody.streakRankings.third.emoji} 3º Lugar - ${killStreakBody.streakRankings.third.type}`,
          value: `**${killStreakBody.streakRankings.third.name}**\n${killStreakBody.streakRankings.third.streak} kills seguidos`,
          inline: true
        });
      }
      
      fields.push({
        name: '📈 Total',
        value: `${killStreakBody.totals.playerCount} jogadores com streaks`,
        inline: false
      });
      
      const embed1 = {
        title: '🏆 Ranking de Kill Streak',
        description: 'Maiores sequências de kills sem morrer',
        color: 0xF59E0B,
        fields,
        timestamp: new Date().toISOString()
      };
      
      const embed2 = {
        image: {
          url: 'attachment://kill-streak-ranking.jpg'
        }
      };
      
      const firstPlayer = killStreakBody.streakRankings.first;
      const embed3 = {
        description: firstPlayer 
          ? `🔥 **${firstPlayer.name}** dominou com ${firstPlayer.streak} kills seguidos! ${firstPlayer.emoji} ${firstPlayer.type}!`
          : 'Ninguém conseguiu fazer uma sequência de kills neste período.',
        color: 0x9b87f5
      };
      
      embeds = [embed1, embed2, embed3];
    } else {
      // Ranking Geral - formato rico texto (mesmo modelo do auto-process-ranking)
      const generalBody = body as GeneralRankingBody;
      const isThrone = generalBody.eventType === 'throne_conquest';
      const { players: enrichedPlayerRanking, guildRanking, guildByName } =
        await syncAndEnrichGeneralRanking(generalBody);
      generalBody.guildRanking = guildRanking;

      const rankingTitle = isThrone ? '🏆 Ranking Throne Conquest' : '🏆 Ranking BOSS Diário';
      const embedColor = isThrone ? 0xF59E0B : 0x10B981;
      const eventLabel = isThrone ? 'Throne Conquest' : 'Boss/evento';
      const SEP = '━━━━━━━━━━━━━━━━━━';

      // Lookup helper para enriquecer Rei/Brabíssimo/Cone com K/D/KDA/Score
      const playerByName = new Map<string, PlayerData>();
      for (const p of enrichedPlayerRanking) playerByName.set(p.name, p);
      const lookup = (name: string) => playerByName.get(name);

      const rei = generalBody.specialRankings.reiDoPVP;
      const brab = generalBody.specialRankings.brabissimo;
      const cone = generalBody.specialRankings.coneMonodedo;
      const reiStats = rei?.name ? lookup(rei.name) : undefined;
      const brabStats = brab?.name ? lookup(brab.name) : undefined;
      const coneStats = cone?.name ? lookup(cone.name) : undefined;
      const agenteDuplo = generalBody.specialRankings.agenteDuplo
        ? {
            ...generalBody.specialRankings.agenteDuplo,
            guild: guildByName.get(generalBody.specialRankings.agenteDuplo.name)
              || generalBody.specialRankings.agenteDuplo.guild
              || '',
          }
        : undefined;
      const putinhaNoite = generalBody.specialRankings.putinhaNoite;

      // Data/hora formatadas a partir dos filtros
      const dateFromStr = generalBody.filters.dateFrom || '';
      let formattedDate = '';
      if (dateFromStr) {
        const [y, m, d] = dateFromStr.split('-');
        formattedDate = `${d}/${m}/${y}`;
      }
      const formattedHour = generalBody.filters.hourFrom !== undefined
        ? `${String(generalBody.filters.hourFrom).padStart(2, '0')}:00`
        : '';

      // Frases dinâmicas (rotação) – mantém compatibilidade com o sistema atual
      let dynamicPhrases: Record<string, string[]> = {};
      try {
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { data: phrasesData } = await serviceClient
          .from('discord_highlight_phrases')
          .select('category, phrase_template');
        if (phrasesData && phrasesData.length > 0) {
          for (const p of phrasesData) {
            if (!dynamicPhrases[p.category]) dynamicPhrases[p.category] = [];
            dynamicPhrases[p.category].push(p.phrase_template);
          }
        }
      } catch (e) {
        console.log('[Discord Webhook] Failed to fetch dynamic phrases, using defaults');
      }
      const nowDate = new Date();
      const startOfYear = new Date(nowDate.getFullYear(), 0, 0);
      const dayOfYear = Math.floor((nowDate.getTime() - startOfYear.getTime()) / 86400000);
      const selectPhrase = (category: string, name: string, value: string, fallback: string): string => {
        const phrases = dynamicPhrases[category];
        if (phrases && phrases.length > 0) {
          const template = phrases[dayOfYear % phrases.length];
          return template.replace(/\{name\}/g, name).replace(/\{value\}/g, value);
        }
        return fallback;
      };

      const bestStreak = generalBody.killLogs ? calculateBestKillStreakFromLogs(generalBody.killLogs) : null;
      const footerLines: string[] = [`**Destaques ${eventLabel}:**`];
      if (bestStreak) {
        footerLines.push(`1 - ${selectPhrase('kill_streak', `**${bestStreak.name}**`, String(bestStreak.streak), `**${bestStreak.name}** matou ${bestStreak.streak} vezes sem morrer!`)}`);
      }
      if (brabStats) {
        footerLines.push(`2 - ${selectPhrase('best_kda', `**${brabStats.name}**`, brabStats.kda.toFixed(2), `**${brabStats.name}** KDA implacável ${brabStats.kda.toFixed(2)}`)}`);
      }
      if (coneStats) {
        footerLines.push(`3 - ${selectPhrase('cone', `**${coneStats.name}**`, String(coneStats.deaths), `**${coneStats.name}** morreu ${coneStats.deaths} vezes!`)}`);
      }
      const footerMessage = footerLines.join('\n');

      // === Embed 1 — Resumo principal estruturado ===
      const lines: string[] = [];
      if (formattedDate || formattedHour) {
        lines.push(`📅 ${formattedDate}${formattedHour ? `  •  ⏰ ${formattedHour}` : ''}`);
      }
      lines.push(`🎯 Ordenação: Event Score`);
      if (generalBody.winnerGuild && generalBody.winnerGuild.trim()) {
        lines.push(`🏆 GUILD VENCEDORA:`);
        lines.push(`## **${generalBody.winnerGuild.trim()}**`);
      }
      lines.push(SEP);

      if (rei?.name) {
        lines.push(`${isThrone ? '👑 **REI DO TRONO**' : '🥇 **REI DO PvP**'}`);
        lines.push(`👑 **${rei.name}**`);
        if (reiStats) {
          lines.push(`⚔️ ${reiStats.eventScore.toFixed(2)} Score • ${reiStats.kills}K / ${reiStats.deaths}D`);
        } else {
          lines.push(`⚔️ ${rei.kills}K / ${rei.deaths}D`);
        }
        lines.push('');
      }
      if (brab?.name) {
        lines.push(`🥈 **BRABÍSSIMO**`);
        lines.push(`⚡ **${brab.name}**`);
        if (brabStats) {
          lines.push(`⚔️ KDA ${brabStats.kda.toFixed(2)} • ${brabStats.kills}K / ${brabStats.deaths}D`);
        } else {
          lines.push(`⚔️ ${brab.singleMatchKills} kills em 1 partida`);
        }
        lines.push('');
      }
      if (cone?.name) {
        lines.push(`🥉 **${isThrone ? 'ALVO PRIORITÁRIO' : 'CONE MONODEDO'}**`);
        lines.push(`🍦 **${cone.name}**`);
        if (coneStats) {
          lines.push(`💀 ${coneStats.eventScore.toFixed(2)} Score • ${coneStats.kills}K / ${coneStats.deaths}D`);
        } else {
          lines.push(`💀 ${cone.deaths} deaths`);
        }
      }

      if (!isThrone) {
        lines.push(SEP);
        lines.push(`😂 **TROFÉUS ESPECIAIS**`);
        lines.push('');
        if (agenteDuplo && agenteDuplo.name) {
          lines.push(`🕵️ **Agente Duplo**`);
          lines.push(`📛 **${agenteDuplo.name}**${agenteDuplo.guild ? ` • ${agenteDuplo.guild}` : ''}`);
          lines.push(`☠️ ${agenteDuplo.friendlyKills} aliado(s) eliminado(s)`);
          lines.push('');
        } else {
          lines.push(`🕵️ **Agente Duplo** — _nenhum traidor hoje_`);
          lines.push('');
        }
        if (putinhaNoite && putinhaNoite.dominador) {
          lines.push(`💔 **Putinha da Noite**`);
          lines.push(`📛 **${putinhaNoite.dominador}** → **${putinhaNoite.putinha}**`);
          lines.push(`⚰️ ${putinhaNoite.kills} morte(s) sofrida(s)`);
        } else {
          lines.push(`💔 **Putinha da Noite** — _sem dominância clara_`);
        }
      }

      lines.push(SEP);
      lines.push(`📊 **ESTATÍSTICAS**`);
      lines.push(`👥 Jogadores: **${generalBody.totals.playerCount}**`);
      lines.push(`⚔️ Kills: **${generalBody.totals.kills}**`);
      lines.push(`💀 Deaths: **${generalBody.totals.deaths}**`);

      const embed1 = {
        title: rankingTitle,
        description: lines.join('\n'),
        color: embedColor,
        timestamp: new Date().toISOString(),
      };

      // === Embed 2 — Ranking por Guild ===
      const guildText = generalBody.guildRanking && generalBody.guildRanking.length > 0
        ? formatGuildRankingTable(generalBody.guildRanking)
        : 'Nenhuma guild registrada';
      const embed2 = {
        title: '⚔️ Ranking por Guild',
        description: '```\n' + guildText.substring(0, 3990) + '\n```',
        color: embedColor,
      };

      // === Embed 3 — Ranking completo ===
      const embed3 = enrichedPlayerRanking.length > 0
        ? {
            title: '🏆 Ranking Completo',
            description: '```\n' + formatRankingTable(enrichedPlayerRanking).substring(0, 3990) + '\n```',
            color: embedColor,
          }
        : null;

      // === Embed 4 — Destaques + link ===
      const frontendUrlRaw = Deno.env.get('FRONTEND_URL') || 'https://rankingpvpboss.lovable.app';
      const frontendUrl = frontendUrlRaw.replace(/\/+$/, '');
      const tabParam = isThrone ? 'throne' : 'ranking';
      const dateParam = generalBody.filters.dateFrom || '';
      const hourParam = generalBody.filters.hourFrom !== undefined ? generalBody.filters.hourFrom : '';
      const linkParts = [`tab=${tabParam}`];
      if (dateParam) linkParts.push(`date=${dateParam}`);
      if (hourParam !== '') linkParts.push(`hour=${hourParam}`);
      const rankingLink = `${frontendUrl}/?${linkParts.join('&')}`;

      const embed4 = {
        description: `${footerMessage}\n\n🔗 **[Ver ranking completo no site](${rankingLink})**`,
        color: 0x9b87f5,
      };

      // === Embed Mains (apenas Throne) ===
      let embedMains: any = null;
      if (isThrone && generalBody.killLogs && generalBody.killLogs.length > 0) {
        try {
          const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );
          const { data: mainsData } = await serviceClient
            .from('characters')
            .select('name, guild')
            .eq('is_main', true);
          const mains = (mainsData || []) as { name: string; guild: string }[];
          if (mains.length > 0) {
            const mainNameSet = new Set(mains.map((m) => m.name.toLowerCase()));
            // For each main, count kills against them and per-killer breakdown
            const perMain = new Map<string, { guild: string; total: number; killers: Map<string, number> }>();
            for (const m of mains) {
              perMain.set(m.name, { guild: m.guild, total: 0, killers: new Map() });
            }
            for (const log of generalBody.killLogs) {
              const victim = log.victim_name;
              const victimKey = victim?.toLowerCase();
              if (!victimKey || !mainNameSet.has(victimKey)) continue;
              // Find the main entry by case-insensitive match
              const mainKey = mains.find((m) => m.name.toLowerCase() === victimKey)?.name;
              if (!mainKey) continue;
              const entry = perMain.get(mainKey)!;
              entry.total += 1;
              entry.killers.set(log.killer_name, (entry.killers.get(log.killer_name) || 0) + 1);
            }
            const blocks: string[] = [];
            // Order by total deaths desc, then guild
            const ordered = [...perMain.entries()]
              .filter(([, v]) => v.total > 0)
              .sort((a, b) => b[1].total - a[1].total);
            for (const [name, info] of ordered) {
              const lines2: string[] = [];
              lines2.push(`**${name}** (${info.guild}) morreu: **${info.total}x**`);
              lines2.push('Morreu para:');
              const killerRows = [...info.killers.entries()].sort((a, b) => b[1] - a[1]);
              const tableLines = ['Jogador          Vezes', '-----------------------'];
              for (const [killer, cnt] of killerRows) {
                tableLines.push(`${killer.padEnd(16, ' ').slice(0, 16)} ${cnt}x`);
              }
              lines2.push('```\n' + tableLines.join('\n') + '\n```');
              blocks.push(lines2.join('\n'));
            }
            if (blocks.length === 0) {
              blocks.push('_Nenhum Main foi morto neste evento._');
            }
            embedMains = {
              title: '👑 Kill dos Mains',
              description: blocks.join('\n\n').substring(0, 4000),
              color: 0xFACC15,
            };
          }
        } catch (e) {
          console.error('[Discord Webhook] Failed to build Kill dos Mains embed:', e);
        }
      }

      embeds = [embed1, embed2, embed3, embedMains, embed4].filter(Boolean);
    }

    formData.append('payload_json', JSON.stringify({ embeds }));

    console.log('Sending to Discord...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord API error:', errorText);
      throw new Error(`Discord API error: ${response.status} ${errorText}`);
    }

    console.log('Successfully posted ranking to Discord');

    // LEGENDS automatic posting removed - now only posted via Sorteio tab

    return new Response(
      JSON.stringify({ 
        success: true,
        playerCount: (body as any).totals?.playerCount || (body as any).totals?.relationCount || 0
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error posting to Discord:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function formatFilters(filters: Filters): string {
  const parts = [];
  
  if (filters.class && filters.class !== 'all') {
    parts.push(`Classe: **${filters.class}**`);
  }
  
  if (filters.dateFrom && filters.dateTo) {
    parts.push(`Período: **${filters.dateFrom}** até **${filters.dateTo}**`);
  } else if (filters.dateFrom) {
    parts.push(`A partir de: **${filters.dateFrom}**`);
  } else if (filters.dateTo) {
    parts.push(`Até: **${filters.dateTo}**`);
  }
  
  if (filters.hourFrom !== undefined && filters.hourTo !== undefined) {
    parts.push(`Hora: **${filters.hourFrom}:00** - **${filters.hourTo}:00**`);
  } else if (filters.hourFrom !== undefined) {
    parts.push(`Hora inicial: **${filters.hourFrom}:00**`);
  } else if (filters.hourTo !== undefined) {
    parts.push(`Hora final: **${filters.hourTo}:00**`);
  }
  
  if (filters.sortBy) {
    const sortLabels: Record<string, string> = {
      kills: 'Kills',
      deaths: 'Deaths',
      kda: 'KDA',
      weightedKda: 'KDA/Médio'
    };
    parts.push(`Ordenação: **${sortLabels[filters.sortBy] || filters.sortBy}**`);
  }
  
  return parts.length > 0 ? parts.join('\n') : 'Sem filtros aplicados';
}
