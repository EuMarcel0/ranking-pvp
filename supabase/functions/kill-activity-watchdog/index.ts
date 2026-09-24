/**
 * Idle detector:
 * - Throne (terça 21:36 Devias)
 * - Square fallback: se houve PvP Square e ficou 5+ min idle sem
 *   detect-boss-kill ter postado (boss não detectado / PvP pequeno), posta o ranking.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INACTIVITY_MIN = 5;
/** Sessão atual (última): idle maior para não postar no meio do boss por uma pausa curta */
const LAST_SESSION_IDLE_MIN = 12;
const THRONE_MIN_ELAPSED_MIN = 25;
const THRONE_MAX_WINDOW_MIN = 150;
/** Lookback para achar sessão Square ainda não postada */
const SQUARE_LOOKBACK_MINUTES = 240;
const SQUARE_SESSION_GAP_MINUTES = 15;
/** PvP pequeno ainda conta — só evita 1 kill solto */
const SQUARE_MIN_SESSION_KILLS = 3;

const SQUARE_MATCH_SLOTS = [
  { hour: 19, minute: 0 },
  { hour: 20, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 22, minute: 0 },
  { hour: 22, minute: 30 },
] as const;

const THRONE_MAP_PATTERNS = [
  /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i,
  /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i,
  /Devias\s*-\s*\[Server: Boss Event PvP\]/i,
];

const SQUARE_MAP_PATTERN =
  /\*{0,2}(?:PvP Square|Silent Map)\*{0,2}\s*-\s*\*{0,2}\[Server:\s*(?:Boss Event PvP|Platinum PvP)\]\*{0,2}/i;

interface EventWindow {
  hour: number;
  minute: number;
}

function brtNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getThroneWindows(brt: Date): EventWindow[] {
  if (brt.getDay() === 2) return [{ hour: 21, minute: 36 }];
  return [];
}

function snapToSquareMatchSlot(hour: number, minute: number): EventWindow {
  const mins = hour * 60 + minute;
  let best = SQUARE_MATCH_SLOTS[0];
  for (const slot of SQUARE_MATCH_SLOTS) {
    if (slot.hour * 60 + slot.minute <= mins) best = slot;
  }
  return { hour: best.hour, minute: best.minute };
}

function parseLogTimestampMs(timestamp: string | null | undefined, content: string | null | undefined): number | null {
  const contentMatch = content?.match(/`?(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})`?/);
  if (contentMatch) {
    const [, day, month, year, hour, minute, second] = contentMatch;
    return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + 3 * 3600000;
  }

  const raw = timestamp?.trim();
  if (!raw) return null;
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + 3 * 3600000;
}

function msToBrtParts(ms: number): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
  };
}

async function triggerAutoProcess(
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${supabaseUrl}/functions/v1/auto-process-ranking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internal = createClient(supabaseUrl, serviceKey);

    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || supabaseUrl;
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || serviceKey;
    const external = createClient(externalUrl, externalKey);

    const brt = brtNow();
    const today = ymd(brt);
    const results: Array<Record<string, unknown>> = [];

    // ---------- Throne (terça) ----------
    for (const w of getThroneWindows(brt)) {
      const startBRT = new Date(brt);
      startBRT.setHours(w.hour, w.minute, 0, 0);
      const elapsedMin = Math.floor((brt.getTime() - startBRT.getTime()) / 60000);

      if (elapsedMin < THRONE_MIN_ELAPSED_MIN || elapsedMin > THRONE_MAX_WINDOW_MIN) {
        results.push({ ...w, eventType: 'throne_conquest', skipped: 'out_of_window', elapsedMin });
        continue;
      }

      const { data: existingRows } = await internal
        .from('pvp_matches')
        .select('id')
        .eq('match_date', today)
        .eq('match_hour', w.hour)
        .eq('match_minute', w.minute)
        .eq('event_type', 'throne_conquest')
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        results.push({ ...w, eventType: 'throne_conquest', skipped: 'already_processed' });
        continue;
      }

      const startStr = `${today}T${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
      const endStr = `${today}T${String(Math.min(23, w.hour + 2)).padStart(2, '0')}:59`;

      const { data: candidates, error: logErr } = await external
        .from('logs_pvp')
        .select('id, timestamp, content')
        .gte('timestamp', startStr)
        .lte('timestamp', endStr)
        .ilike('content', '%Devias%Boss Event PvP%')
        .order('timestamp', { ascending: false })
        .limit(80);

      if (logErr) {
        results.push({ ...w, eventType: 'throne_conquest', error: logErr.message });
        continue;
      }

      const lastLog = (candidates ?? []).find((log) =>
        THRONE_MAP_PATTERNS.some((p) => p.test(log.content ?? '')),
      );

      if (!lastLog) {
        results.push({ ...w, eventType: 'throne_conquest', status: 'no_kills_yet', elapsedMin });
        continue;
      }

      const lastTsMs = parseLogTimestampMs(lastLog.timestamp, lastLog.content);
      if (lastTsMs === null) {
        results.push({ ...w, eventType: 'throne_conquest', status: 'invalid_timestamp', elapsedMin });
        continue;
      }

      const idleMin = Math.floor((Date.now() - lastTsMs) / 60000);
      if (idleMin < INACTIVITY_MIN) {
        results.push({
          ...w,
          eventType: 'throne_conquest',
          status: 'still_active',
          idleMin,
          idleThreshold: INACTIVITY_MIN,
        });
        continue;
      }

      const triggerJson = await triggerAutoProcess(supabaseUrl, serviceKey, {
        trigger: 'throne_idle',
        attempt: 3,
        forceProcess: true,
        eventHour: w.hour,
        eventMinute: w.minute,
        eventEndHour: brt.getHours(),
        eventEndMinute: brt.getMinutes(),
        eventType: 'throne_conquest',
        eventDate: today,
      });

      results.push({
        ...w,
        eventType: 'throne_conquest',
        status: 'triggered',
        idleMin,
        trigger: triggerJson,
      });
    }

    // ---------- Square fallback: posta sessões JÁ ENCERRADAS (idle),
    // sem tocar na sessão atual ainda ativa (ex.: boss 22h rolando). ----------
    {
      const lookbackStart = new Date(brt.getTime() - SQUARE_LOOKBACK_MINUTES * 60_000);
      const startStr = `${ymd(lookbackStart)}T${String(lookbackStart.getHours()).padStart(2, '0')}:${String(lookbackStart.getMinutes()).padStart(2, '0')}`;
      const endStr = `${today}T${String(brt.getHours()).padStart(2, '0')}:${String(brt.getMinutes()).padStart(2, '0')}`;

      const { data: squareRows, error: squareErr } = await external
        .from('logs_pvp')
        .select('id, timestamp, content')
        .gte('timestamp', startStr)
        .lte('timestamp', endStr)
        .or('content.ilike.%PvP Square%Boss Event%,content.ilike.%PvP Square%Platinum%,content.ilike.%Silent Map%Boss Event%,content.ilike.%Silent Map%Platinum%')
        .order('timestamp', { ascending: false })
        .limit(300);

      if (squareErr) {
        results.push({ eventType: 'boss_event', error: squareErr.message });
      } else {
        const squareLogs = (squareRows ?? []).filter((log) => SQUARE_MAP_PATTERN.test(log.content ?? ''));
        const timed = squareLogs
          .map((log) => ({ log, ts: parseLogTimestampMs(log.timestamp, log.content) }))
          .filter((x): x is { log: (typeof squareLogs)[0]; ts: number } => x.ts !== null)
          .sort((a, b) => a.ts - b.ts);

        if (timed.length === 0) {
          results.push({ eventType: 'boss_event', status: 'no_square_kills' });
        } else {
          // Particionar em sessões por gap > 15 min
          const gapMs = SQUARE_SESSION_GAP_MINUTES * 60_000;
          const sessions: Array<typeof timed> = [];
          let cur: typeof timed = [timed[0]];
          for (let i = 1; i < timed.length; i++) {
            if (timed[i].ts - timed[i - 1].ts > gapMs) {
              sessions.push(cur);
              cur = [timed[i]];
            } else {
              cur.push(timed[i]);
            }
          }
          sessions.push(cur);

          for (let sIdx = 0; sIdx < sessions.length; sIdx++) {
            const session = sessions[sIdx];
            const isLastSession = sIdx === sessions.length - 1;
            const sessionKills = session.length;
            const sessionStartMs = session[0].ts;
            const sessionEndMs = session[session.length - 1].ts;

            // Idle: se não é a última, gap até a próxima sessão; se é a última, até agora
            const idleRefMs = isLastSession
              ? Date.now()
              : sessions[sIdx + 1][0].ts;
            const idleMin = Math.floor((idleRefMs - sessionEndMs) / 60000);

            const brtParts = msToBrtParts(sessionStartMs);
            const slot = snapToSquareMatchSlot(brtParts.hour, brtParts.minute);
            const sessionDateParts = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Sao_Paulo',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).formatToParts(new Date(sessionStartMs));
            const y = sessionDateParts.find((p) => p.type === 'year')?.value ?? today.slice(0, 4);
            const mo = sessionDateParts.find((p) => p.type === 'month')?.value ?? '01';
            const d = sessionDateParts.find((p) => p.type === 'day')?.value ?? '01';
            const sessionDate = `${y}-${mo}-${d}`;

            // Sessão atual: precisa de idle maior (evita postar no meio do 22h por lull de 5 min)
            const requiredIdle = isLastSession ? LAST_SESSION_IDLE_MIN : INACTIVITY_MIN;

            // Sessão atual ainda ativa → não processa (boss 22h rolando, etc.)
            if (isLastSession && idleMin < requiredIdle) {
              results.push({
                eventType: 'boss_event',
                status: 'still_active',
                slot,
                sessionDate,
                sessionKills,
                idleMin,
                idleThreshold: requiredIdle,
                lastKill: session[session.length - 1].log.content?.slice(0, 120),
              });
              continue;
            }

            if (sessionKills < SQUARE_MIN_SESSION_KILLS) {
              results.push({
                eventType: 'boss_event',
                status: 'session_too_small',
                slot,
                sessionDate,
                sessionKills,
                minSessionKills: SQUARE_MIN_SESSION_KILLS,
                idleMin,
              });
              continue;
            }

            if (idleMin < requiredIdle) {
              results.push({
                eventType: 'boss_event',
                status: 'session_not_idle_yet',
                slot,
                sessionDate,
                sessionKills,
                idleMin,
                idleThreshold: requiredIdle,
              });
              continue;
            }

            const { data: existing } = await internal
              .from('pvp_matches')
              .select('id')
              .eq('match_date', sessionDate)
              .eq('match_hour', slot.hour)
              .eq('match_minute', slot.minute)
              .eq('event_type', 'boss_event')
              .limit(1);

            if (existing && existing.length > 0) {
              results.push({
                eventType: 'boss_event',
                status: 'already_processed',
                slot,
                sessionDate,
                sessionKills,
              });
              continue;
            }

            // Pendência do detector só bloqueia a sessão "atual" (última idle) —
            // sessões anteriores (ex.: 20h enquanto 22h rola) podem postar via idle.
            if (isLastSession) {
              const { data: pendingBoss } = await internal
                .from('boss_kill_triggers')
                .select('id')
                .eq('match_date', sessionDate)
                .eq('event_type', 'boss_event')
                .is('posted_at', null)
                .limit(1);

              if (pendingBoss && pendingBoss.length > 0) {
                results.push({
                  eventType: 'boss_event',
                  status: 'waiting_boss_kill_pending',
                  slot,
                  sessionKills,
                });
                continue;
              }
            }

            // Fim da janela de logs = último kill da sessão (+1 min), não "agora"
            // (evita misturar com a sessão 22h ainda ativa)
            const endParts = msToBrtParts(sessionEndMs + 60_000);

            console.log(
              `[SquareWatchdog] Closed session ${sessionDate} ` +
                `${slot.hour}:${String(slot.minute).padStart(2, '0')} ` +
                `kills=${sessionKills} idle=${idleMin}min → posting ` +
                `(end=${String(endParts.hour).padStart(2, '0')}:${String(endParts.minute).padStart(2, '0')})`,
            );

            const triggerJson = await triggerAutoProcess(supabaseUrl, serviceKey, {
              trigger: 'square_idle',
              attempt: 3,
              forceProcess: true,
              eventHour: slot.hour,
              eventMinute: slot.minute,
              eventEndHour: endParts.hour,
              eventEndMinute: endParts.minute,
              eventType: 'boss_event',
              eventDate: sessionDate,
            });

            results.push({
              eventType: 'boss_event',
              status: 'triggered',
              slot,
              sessionDate,
              sessionKills,
              idleMin,
              endHour: endParts.hour,
              endMinute: endParts.minute,
              trigger: triggerJson,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'throne_and_square_idle',
        brt: brt.toISOString(),
        idleThreshold: INACTIVITY_MIN,
        lastSessionIdleMin: LAST_SESSION_IDLE_MIN,
        squareMinSessionKills: SQUARE_MIN_SESSION_KILLS,
        checked: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
