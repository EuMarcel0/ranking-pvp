/**
 * Detecta morte do boss PvP Square via ranking monster_kill do VortexMU (NPC 968/966).
 * Ao detectar +1, agenda postagem para +4 min (tempo de loot/clear da zona).
 * Nos polls seguintes, quando post_after chegar, executa o fluxo "Sincronizar e postar".
 *
 * Único mecanismo de postagem automática do Boss Event (crons/watchdog antigos desativados).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOSS_NPC_IDS = [968, 966] as const;
const BOSS_NPC_NAMES: Record<number, string> = {
  966: '(Elite) Devil Sword',
  968: '(Elite) Devil Sorcerer',
};
const VORTEX_URL = 'https://vortexmu.net/rankings/monster_kill/load_ranking_data';

/** Minutos após detecção da morte antes de postar o ranking (loot + clear da zona) */
const POST_DELAY_MINUTES = 4;
/** Janela máxima após início do evento (min) para aceitar detecção */
const MAX_WINDOW_MIN = 120;
/** Só tenta detectar após X min do início (evita ruído no começo) */
const MIN_ELAPSED_MIN = 10;

function bossNpcLabel(npcId: number): string {
  return BOSS_NPC_NAMES[npcId] ?? `NPC ${npcId}`;
}

interface MonsterEntry {
  name: string;
  count: number;
}

interface EventWindow {
  hour: number;
  minute: number;
}

interface PendingTrigger {
  id: string;
  match_date: string;
  match_hour: number;
  match_minute: number;
  npc_id: number;
  killer_name: string;
  post_after: string;
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

function getBossWindows(brt: Date): EventWindow[] {
  const dow = brt.getDay();
  const list: EventWindow[] = [];

  if (dow === 1) {
    list.push({ hour: 21, minute: 0 });
    list.push({ hour: 22, minute: 0 });
  } else {
    list.push({ hour: 20, minute: 0 });
    if (dow === 2 || dow === 4) {
      list.push({ hour: 22, minute: 30 });
    } else {
      list.push({ hour: 22, minute: 0 });
    }
  }

  return list;
}

function activeBossWindow(brt: Date): (EventWindow & { elapsedMin: number; date: string }) | null {
  const today = ymd(brt);
  const windows = getBossWindows(brt);

  for (const w of windows) {
    const start = new Date(brt);
    start.setHours(w.hour, w.minute, 0, 0);
    const elapsedMin = Math.floor((brt.getTime() - start.getTime()) / 60000);
    if (elapsedMin >= MIN_ELAPSED_MIN && elapsedMin <= MAX_WINDOW_MIN) {
      return { ...w, elapsedMin, date: today };
    }
  }
  return null;
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

function detectKiller(
  baseline: Map<string, number>,
  current: MonsterEntry[],
): { name: string; prev: number; next: number } | null {
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

  if (increases.length === 1 && increases[0].delta === 1) {
    return {
      name: increases[0].name,
      prev: increases[0].prev,
      next: increases[0].next,
    };
  }

  if (increases.length > 0) {
    console.warn(
      '[DetectBossKill] Ambiguous delta, skipping trigger:',
      increases.map((i) => `${i.name}:${i.prev}->${i.next}`).join(', '),
    );
  }

  return null;
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

  console.log(
    `[DetectBossKill] Posting after delay: ${pending.killer_name} ` +
      `${bossNpcLabel(pending.npc_id)} window=${pending.match_date} ` +
      `${pending.match_hour}:${String(pending.match_minute).padStart(2, '0')}`,
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
      eventHour: pending.match_hour,
      eventMinute: pending.match_minute,
      eventEndHour: endHour,
      eventEndMinute: endMinute,
      eventType: 'boss_event',
      eventDate: pending.match_date,
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
    window: {
      date: pending.match_date,
      hour: pending.match_hour,
      minute: pending.match_minute,
    },
    end: { hour: endHour, minute: endMinute },
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
    const nowIso = new Date().toISOString();
    const window = activeBossWindow(brt);
    const npcResults: Array<Record<string, unknown>> = [];
    let scheduled: Record<string, unknown> | null = null;
    let triggered: Record<string, unknown> | null = null;

    // 1) Postagens cujo delay de 4 min já venceu (independente da janela atual)
    const { data: dueRows, error: dueErr } = await client
      .from('boss_kill_triggers')
      .select('id, match_date, match_hour, match_minute, npc_id, killer_name, post_after')
      .is('posted_at', null)
      .lte('post_after', nowIso)
      .order('post_after', { ascending: true })
      .limit(5);

    if (dueErr) throw new Error(`pending load: ${dueErr.message}`);

    for (const row of (dueRows ?? []) as PendingTrigger[]) {
      const result = await postPendingTrigger(supabaseUrl, serviceKey, client, row, brt);
      if (result.ok) {
        triggered = result;
        break; // um post por execução é suficiente
      }
    }

    // 2) Poll dos NPCs — detectar morte e agendar (+4 min)
    for (const npcId of BOSS_NPC_IDS) {
      const current = await fetchMonsterRanking(npcId);
      const baseline = await loadBaseline(client, npcId);
      const isSeed = baseline.size === 0;

      let killer: ReturnType<typeof detectKiller> = null;
      if (!isSeed && window) {
        killer = detectKiller(baseline, current);
      }

      const npcResult: Record<string, unknown> = {
        npcId,
        boss: bossNpcLabel(npcId),
        entries: current.length,
        seeded: isSeed,
        killer: killer?.name ?? null,
      };

      if (!killer || !window || scheduled) {
        await saveBaseline(client, npcId, current);
        if (scheduled && killer) npcResult.skipped = 'already_scheduled_this_run';
        npcResults.push(npcResult);
        continue;
      }

      const { data: existingTrigger } = await client
        .from('boss_kill_triggers')
        .select('id, posted_at, post_after')
        .eq('match_date', window.date)
        .eq('match_hour', window.hour)
        .eq('match_minute', window.minute)
        .eq('event_type', 'boss_event')
        .maybeSingle();

      if (existingTrigger) {
        await saveBaseline(client, npcId, current);
        npcResult.skipped = existingTrigger.posted_at ? 'already_posted' : 'waiting_delay';
        npcResult.post_after = existingTrigger.post_after;
        npcResults.push(npcResult);
        continue;
      }

      const postAfter = new Date(Date.now() + POST_DELAY_MINUTES * 60_000).toISOString();

      const { error: lockErr } = await client.from('boss_kill_triggers').insert({
        match_date: window.date,
        match_hour: window.hour,
        match_minute: window.minute,
        event_type: 'boss_event',
        npc_id: npcId,
        killer_name: killer.name,
        post_after: postAfter,
        posted_at: null,
      });

      if (lockErr) {
        console.log('[DetectBossKill] Schedule lock failed:', lockErr.message);
        npcResult.skipped = 'lock_failed';
        npcResults.push(npcResult);
        continue;
      }

      // Baseline sobe já na detecção para não re-detectar o mesmo +1
      await saveBaseline(client, npcId, current);

      console.log(
        `[DetectBossKill] Boss kill scheduled (+${POST_DELAY_MINUTES}min): ${killer.name} ` +
          `boss=${bossNpcLabel(npcId)} (${npcId}) ` +
          `window=${window.date} ${window.hour}:${String(window.minute).padStart(2, '0')} ` +
          `(${killer.prev}->${killer.next}) post_after=${postAfter}`,
      );

      scheduled = {
        npcId,
        killer: killer.name,
        boss: bossNpcLabel(npcId),
        window,
        post_after: postAfter,
        delayMinutes: POST_DELAY_MINUTES,
      };
      npcResult.scheduled = true;
      npcResult.post_after = postAfter;
      npcResults.push(npcResult);
    }

    // Pendentes ainda aguardando delay (info para UI/logs)
    const { data: waitingRows } = await client
      .from('boss_kill_triggers')
      .select('id, killer_name, npc_id, post_after, match_date, match_hour, match_minute')
      .is('posted_at', null)
      .gt('post_after', nowIso)
      .order('post_after', { ascending: true })
      .limit(5);

    return new Response(
      JSON.stringify({
        success: true,
        brt: brt.toISOString(),
        postDelayMinutes: POST_DELAY_MINUTES,
        window: window
          ? {
              date: window.date,
              hour: window.hour,
              minute: window.minute,
              elapsedMin: window.elapsedMin,
            }
          : null,
        npcs: npcResults,
        scheduled,
        triggered,
        waiting: waitingRows ?? [],
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
