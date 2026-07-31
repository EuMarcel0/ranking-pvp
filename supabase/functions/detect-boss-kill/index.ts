/**
 * Detecta morte do boss PvP Square via ranking monster_kill do VortexMU (NPC 968/966).
 * Quando detecta +1 kill, dispara o mesmo fluxo do botão "Sincronizar e postar".
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

function bossNpcLabel(npcId: number): string {
  return BOSS_NPC_NAMES[npcId] ?? `NPC ${npcId}`;
}
/** Janela máxima após início do evento (min) para aceitar detecção */
const MAX_WINDOW_MIN = 120;
/** Só tenta disparar após X min do início (evita ruído no começo) */
const MIN_ELAPSED_MIN = 10;

interface MonsterEntry {
  name: string;
  name_hex?: string;
  count: number;
}

interface EventWindow {
  hour: number;
  minute: number;
}

function brtNow(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Janelas de Boss Event do dia (espelho do watchdog / AutoProcessMonitor) */
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

async function loadBaseline(
  client: ReturnType<typeof createClient>,
  npcId: number,
): Promise<Map<string, number>> {
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
  client: ReturnType<typeof createClient>,
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

/** Retorna killer se exatamente um personagem subiu +1 vs baseline */
function detectKiller(
  baseline: Map<string, number>,
  current: MonsterEntry[],
): { name: string; prev: number; next: number } | null {
  if (baseline.size === 0) return null; // primeira carga: só seed

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const client = createClient(supabaseUrl, serviceKey);

    const brt = brtNow();
    const window = activeBossWindow(brt);
    const npcResults: Array<Record<string, unknown>> = [];
    let triggered: Record<string, unknown> | null = null;

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
        entries: current.length,
        seeded: isSeed,
        killer: killer?.name ?? null,
      };

      // Seed / sem kill / fora da janela: só atualiza baseline
      if (!killer || !window || triggered) {
        await saveBaseline(client, npcId, current);
        if (triggered && killer) npcResult.skipped = 'already_triggered_this_run';
        npcResults.push(npcResult);
        continue;
      }

      // Anti-duplicata por janela
      const { data: existingTrigger } = await client
        .from('boss_kill_triggers')
        .select('id')
        .eq('match_date', window.date)
        .eq('match_hour', window.hour)
        .eq('match_minute', window.minute)
        .eq('event_type', 'boss_event')
        .maybeSingle();

      if (existingTrigger) {
        await saveBaseline(client, npcId, current);
        npcResult.skipped = 'already_triggered';
        npcResults.push(npcResult);
        continue;
      }

      const { data: lockRow, error: lockErr } = await client
        .from('boss_kill_triggers')
        .insert({
          match_date: window.date,
          match_hour: window.hour,
          match_minute: window.minute,
          event_type: 'boss_event',
          npc_id: npcId,
          killer_name: killer.name,
        })
        .select('id')
        .single();

      if (lockErr) {
        console.log('[DetectBossKill] Trigger lock failed:', lockErr.message);
        npcResult.skipped = 'lock_failed';
        npcResults.push(npcResult);
        continue;
      }

      console.log(
        `[DetectBossKill] Boss kill detected: ${killer.name} boss=${bossNpcLabel(npcId)} (${npcId}) ` +
          `window=${window.date} ${window.hour}:${String(window.minute).padStart(2, '0')} ` +
          `(${killer.prev}->${killer.next})`,
      );

      // Mesmo processo do botão "Sincronizar e postar"
      const endHour = brt.getHours();
      const endMinute = brt.getMinutes();

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
          eventHour: window.hour,
          eventMinute: window.minute,
          eventEndHour: endHour,
          eventEndMinute: endMinute,
          eventType: 'boss_event',
          eventDate: window.date,
          bossKiller: killer.name,
          bossNpcId: npcId,
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
        // Libera lock e NÃO atualiza baseline → próximo poll tenta de novo
        if (lockRow?.id) {
          await client.from('boss_kill_triggers').delete().eq('id', lockRow.id);
        }
        console.error('[DetectBossKill] auto-process failed, will retry:', processJson);
        npcResult.processFailed = processJson;
        npcResults.push(npcResult);
        continue;
      }

      await saveBaseline(client, npcId, current);

      triggered = {
        npcId,
        killer: killer.name,
        window,
        end: { hour: endHour, minute: endMinute },
        processStatus: processRes.status,
        process: processJson,
      };
      npcResults.push(npcResult);
      console.log('[DetectBossKill] auto-process-ranking result:', processJson);
    }

    return new Response(
      JSON.stringify({
        success: true,
        brt: brt.toISOString(),
        window: window
          ? {
              date: window.date,
              hour: window.hour,
              minute: window.minute,
              elapsedMin: window.elapsedMin,
            }
          : null,
        npcs: npcResults,
        triggered,
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
