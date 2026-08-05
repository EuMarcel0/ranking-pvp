/**
 * Detecta morte dos bosses PvP via ranking monster_kill do VortexMU
 * (NPC 968/966 Square + 922 World Boss).
 * Sem cronograma fixo: qualquer +1 dispara "Sincronizar e postar".
 * Janela de logs = lookback a partir de agora (BRT).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOSS_NPC_IDS = [922, 968, 966] as const;
const BOSS_NPC_NAMES: Record<number, string> = {
  922: 'World Boss',
  966: '(Elite) Devil Sword',
  968: '(Elite) Devil Sorcerer',
};
const WORLD_BOSS_NPC_ID = 922;
const VORTEX_URL = 'https://vortexmu.net/rankings/monster_kill/load_ranking_data';

/** Lookback padrão (Boss Square). World Boss costuma durar mais. */
const LOG_LOOKBACK_MINUTES = 150;
const WORLD_BOSS_LOOKBACK_MINUTES = 240;
/** Evita reprocessar o mesmo npc se o poll oscilar no mesmo minuto */
const DEDUPE_MINUTES = 3;

function lookbackMinutesForNpc(npcId: number): number {
  return npcId === WORLD_BOSS_NPC_ID ? WORLD_BOSS_LOOKBACK_MINUTES : LOG_LOOKBACK_MINUTES;
}

function bossNpcLabel(npcId: number): string {
  return BOSS_NPC_NAMES[npcId] ?? `NPC ${npcId}`;
}

interface MonsterEntry {
  name: string;
  count: number;
}

interface PendingTrigger {
  id: string;
  match_date: string;
  match_hour: number;
  match_minute: number;
  npc_id: number;
  killer_name: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

function brtNow(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

async function fetchMonsterRanking(npcId: number): Promise<MonsterEntry[]> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    origin: 'https://vortexmu.net',
    referer: 'https://vortexmu.net/rankings/monster-kill',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest',
  };

  const cookie = Deno.env.get('VORTEX_COOKIE');
  if (cookie) headers.cookie = cookie;

  const res = await fetch(VORTEX_URL, {
    method: 'POST',
    headers,
    body: `&server=MUONLINE&npc=${npcId}`,
  });

  if (!res.ok) {
    throw new Error(`Vortex API npc=${npcId} HTTP ${res.status}`);
  }

  const json = await res.json();
  const list = Array.isArray(json?.monster) ? json.monster : [];
  return list
    .map((m: { name?: string; count?: number | string }) => ({
      name: String(m?.name ?? '').trim(),
      count: Number(m?.count ?? 0),
    }))
    .filter((m: MonsterEntry) => m.name && Number.isFinite(m.count) && m.count >= 0);
}

async function loadBaseline(client: SupabaseClient, npcId: number): Promise<Map<string, number>> {
  const { data, error } = await client
    .from('monster_kill_baselines')
    .select('character_name, kill_count')
    .eq('npc_id', npcId);

  if (error) throw new Error(`baseline load: ${error.message}`);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.character_name, row.kill_count);
  }
  return map;
}

async function saveBaseline(
  client: SupabaseClient,
  npcId: number,
  entries: MonsterEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const now = new Date().toISOString();
  const rows = entries.map((e) => ({
    npc_id: npcId,
    character_name: e.name,
    kill_count: e.count,
    updated_at: now,
  }));

  const { error } = await client
    .from('monster_kill_baselines')
    .upsert(rows, { onConflict: 'npc_id,character_name' });

  if (error) throw new Error(`baseline save: ${error.message}`);
}

/** Qualquer aumento de um único personagem = boss morto (API pode atrasar e vir +1 ou mais). */
function detectKiller(
  baseline: Map<string, number>,
  current: MonsterEntry[],
): { name: string; prev: number; next: number; delta: number } | null {
  if (baseline.size === 0) return null;

  const increases: Array<{ name: string; prev: number; next: number; delta: number }> = [];

  for (const entry of current) {
    const prev = baseline.get(entry.name) ?? 0;
    if (entry.count > prev) {
      increases.push({
        name: entry.name,
        prev,
        next: entry.count,
        delta: entry.count - prev,
      });
    }
  }

  if (increases.length === 1 && increases[0].delta >= 1) {
    return increases[0];
  }

  if (increases.length > 0) {
    console.warn(
      '[DetectBossKill] Ambiguous delta, skipping trigger:',
      increases.map((i) => `${i.name}:${i.prev}->${i.next}`).join(', '),
    );
  }

  return null;
}

function eventTypeForNpc(npcId: number): 'boss_event' | 'world_boss' {
  return npcId === WORLD_BOSS_NPC_ID ? 'world_boss' : 'boss_event';
}

async function recentlyPostedForNpc(
  client: SupabaseClient,
  npcId: number,
  withinMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const { data } = await client
    .from('boss_kill_triggers')
    .select('id')
    .eq('npc_id', npcId)
    .eq('event_type', eventTypeForNpc(npcId))
    .not('posted_at', 'is', null)
    .gte('posted_at', since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function postPendingTrigger(
  supabaseUrl: string,
  serviceKey: string,
  client: SupabaseClient,
  pending: PendingTrigger,
  brt: Date,
): Promise<Record<string, unknown>> {
  const endHour = brt.getHours();
  const endMinute = brt.getMinutes();

  // Início da busca de logs = lookback a partir de agora (independente de horário fixo)
  const start = addMinutes(brt, -lookbackMinutesForNpc(pending.npc_id));
  // Se virou o dia no lookback, usa 00:00 do dia da detecção para não misturar dias
  const startSameDay =
    ymd(start) === pending.match_date
      ? start
      : new Date(brt.getFullYear(), brt.getMonth(), brt.getDate(), 0, 0, 0, 0);

  const eventHour = startSameDay.getHours();
  const eventMinute = startSameDay.getMinutes();

  console.log(
    `[DetectBossKill] Posting: ${pending.killer_name} ` +
      `${bossNpcLabel(pending.npc_id)} detected=${pending.match_date} ` +
      `${pending.match_hour}:${String(pending.match_minute).padStart(2, '0')} ` +
      `logs=${String(eventHour).padStart(2, '0')}:${String(eventMinute).padStart(2, '0')}→` +
      `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
  );

  const processRes = await fetch(`${supabaseUrl}/functions/v1/auto-process-ranking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      trigger: 'boss_kill',
      attempt: 3,
      forceProcess: true,
      forceReprocess: true,
      eventHour,
      eventMinute,
      eventEndHour: endHour,
      eventEndMinute: endMinute,
      eventType: eventTypeForNpc(pending.npc_id),
      eventDate: pending.match_date,
      // Identidade da partida = horário da detecção (não o lookback)
      matchHourOverride: pending.match_hour,
      matchMinuteOverride: pending.match_minute,
      bossKiller: pending.killer_name,
      bossNpcId: pending.npc_id,
    }),
  });

  const processJson = await processRes.json().catch(() => ({}));
  const processOk =
    processRes.ok &&
    processJson?.success === true &&
    processJson?.status !== 'no_logs' &&
    processJson?.status !== 'no_players' &&
    processJson?.status !== 'postponed';

  if (!processOk) {
    console.error('[DetectBossKill] auto-process failed, will retry next poll:', processJson);
    return { ok: false, pending, process: processJson };
  }

  await client
    .from('boss_kill_triggers')
    .update({ posted_at: new Date().toISOString() })
    .eq('id', pending.id);

  return {
    ok: true,
    npcId: pending.npc_id,
    killer: pending.killer_name,
    boss: bossNpcLabel(pending.npc_id),
    detected: {
      date: pending.match_date,
      hour: pending.match_hour,
      minute: pending.match_minute,
    },
    logWindow: {
      startHour: eventHour,
      startMinute: eventMinute,
      endHour,
      endMinute,
    },
    processStatus: processRes.status,
    process: processJson,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const client = createClient(supabaseUrl, serviceKey);

    const brt = brtNow();
    const today = ymd(brt);
    const npcResults: Array<Record<string, unknown>> = [];
    const triggeredList: Array<Record<string, unknown>> = [];

    // Drena postagens pendentes
    const { data: dueRows, error: dueErr } = await client
      .from('boss_kill_triggers')
      .select('id, match_date, match_hour, match_minute, npc_id, killer_name')
      .is('posted_at', null)
      .order('triggered_at', { ascending: true })
      .limit(5);

    if (dueErr) throw new Error(`pending load: ${dueErr.message}`);

    for (const row of (dueRows ?? []) as PendingTrigger[]) {
      const result = await postPendingTrigger(supabaseUrl, serviceKey, client, row, brt);
      if (result.ok) triggeredList.push(result);
    }

    for (const npcId of BOSS_NPC_IDS) {
      const current = await fetchMonsterRanking(npcId);
      const baseline = await loadBaseline(client, npcId);
      const isSeed = baseline.size === 0;

      const killer = !isSeed ? detectKiller(baseline, current) : null;

      const npcResult: Record<string, unknown> = {
        npcId,
        boss: bossNpcLabel(npcId),
        entries: current.length,
        seeded: isSeed,
        killer: killer?.name ?? null,
      };

      if (!killer) {
        await saveBaseline(client, npcId, current);
        npcResults.push(npcResult);
        continue;
      }

      if (await recentlyPostedForNpc(client, npcId, DEDUPE_MINUTES)) {
        await saveBaseline(client, npcId, current);
        npcResult.skipped = 'recently_posted_same_npc';
        npcResults.push(npcResult);
        continue;
      }

      // Identidade do evento = momento da detecção (BRT)
      const detectHour = brt.getHours();
      const detectMinute = brt.getMinutes();

      const eventType = eventTypeForNpc(npcId);

      const { data: existingTrigger } = await client
        .from('boss_kill_triggers')
        .select('id, posted_at')
        .eq('match_date', today)
        .eq('match_hour', detectHour)
        .eq('match_minute', detectMinute)
        .eq('event_type', eventType)
        .eq('npc_id', npcId)
        .maybeSingle();

      if (existingTrigger) {
        await saveBaseline(client, npcId, current);
        npcResult.skipped = existingTrigger.posted_at ? 'already_posted' : 'pending_retry';
        npcResults.push(npcResult);
        continue;
      }

      const nowIso = new Date().toISOString();
      const { data: lockRow, error: lockErr } = await client
        .from('boss_kill_triggers')
        .insert({
          match_date: today,
          match_hour: detectHour,
          match_minute: detectMinute,
          event_type: eventType,
          npc_id: npcId,
          killer_name: killer.name,
          post_after: nowIso,
          posted_at: null,
        })
        .select('id')
        .single();

      if (lockErr || !lockRow) {
        // Colisão de unique (mesmo minuto): tenta com +1 min lógico via update path no próximo poll
        console.log('[DetectBossKill] Trigger lock failed:', lockErr?.message);
        npcResult.skipped = 'lock_failed';
        npcResults.push(npcResult);
        continue;
      }

      console.log(
        `[DetectBossKill] Boss kill detected (schedule-free): ${killer.name} ` +
          `boss=${bossNpcLabel(npcId)} (${npcId}) ` +
          `at=${today} ${detectHour}:${String(detectMinute).padStart(2, '0')} ` +
          `(${killer.prev}->${killer.next}, delta=${killer.delta})`,
      );

      const result = await postPendingTrigger(
        supabaseUrl,
        serviceKey,
        client,
        {
          id: lockRow.id,
          match_date: today,
          match_hour: detectHour,
          match_minute: detectMinute,
          npc_id: npcId,
          killer_name: killer.name,
        },
        brt,
      );

      if (!result.ok) {
        await client.from('boss_kill_triggers').delete().eq('id', lockRow.id);
        npcResult.processFailed = result.process;
        npcResults.push(npcResult);
        continue;
      }

      await saveBaseline(client, npcId, current);
      triggeredList.push(result);
      npcResults.push(npcResult);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'schedule_free',
        brt: brt.toISOString(),
        lookbackMinutes: LOG_LOOKBACK_MINUTES,
        worldBossLookbackMinutes: WORLD_BOSS_LOOKBACK_MINUTES,
        npcs: npcResults,
        triggered: triggeredList[0] ?? null,
        triggeredAll: triggeredList,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[DetectBossKill] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
