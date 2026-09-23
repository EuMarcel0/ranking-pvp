/**
 * Detecta fim do Throne Conquest via idle em logs_pvp (Devias + Boss Event PvP).
 * Boss Square / World Boss ficam a cargo do detect-boss-kill.
 *
 * Regra: após o início do evento (21:36 BRT terça), se passaram 5+ min
 * sem kill válido em Devias e ainda não há pvp_matches, dispara auto-process-ranking.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INACTIVITY_MIN = 5;
const MIN_ELAPSED_MIN = 25;
const MAX_WINDOW_MIN = 150; // até ~00:06 no dia seguinte em BRT wall-clock do início

const THRONE_MAP_PATTERNS = [
  /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i,
  /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i,
  /Devias\s*-\s*\[Server: Boss Event PvP\]/i,
];

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
  const dow = brt.getDay(); // 0=Dom .. 6=Sáb
  // Só terça às 21:36
  if (dow === 2) {
    return [{ hour: 21, minute: 36 }];
  }
  return [];
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
    const windows = getThroneWindows(brt);
    const results: Array<Record<string, unknown>> = [];

    if (windows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'no_throne_today',
          brt: brt.toISOString(),
          idleThreshold: INACTIVITY_MIN,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    for (const w of windows) {
      const startBRT = new Date(brt);
      startBRT.setHours(w.hour, w.minute, 0, 0);
      const elapsedMin = Math.floor((brt.getTime() - startBRT.getTime()) / 60000);

      if (elapsedMin < MIN_ELAPSED_MIN || elapsedMin > MAX_WINDOW_MIN) {
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
      const endHour = Math.min(23, w.hour + 2);
      const endStr = `${today}T${String(endHour).padStart(2, '0')}:59`;

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
        results.push({
          ...w,
          eventType: 'throne_conquest',
          status: 'no_kills_yet',
          elapsedMin,
          scanned: candidates?.length ?? 0,
        });
        continue;
      }

      const lastTsMs = parseLogTimestampMs(lastLog.timestamp, lastLog.content);
      if (lastTsMs === null) {
        results.push({
          ...w,
          eventType: 'throne_conquest',
          status: 'invalid_timestamp',
          elapsedMin,
          sample: lastLog.content?.slice(0, 120),
        });
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
          elapsedMin,
          lastContent: lastLog.content?.slice(0, 160),
        });
        continue;
      }

      const endHourNow = brt.getHours();
      const endMinuteNow = brt.getMinutes();

      console.log(
        `[ThroneWatchdog] Event ended: ${today} 21:36 idle=${idleMin}min → posting ` +
          `(end=${String(endHourNow).padStart(2, '0')}:${String(endMinuteNow).padStart(2, '0')})`,
      );

      const triggerRes = await fetch(`${supabaseUrl}/functions/v1/auto-process-ranking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          trigger: 'throne_idle',
          attempt: 3,
          forceProcess: true,
          eventHour: w.hour,
          eventMinute: w.minute,
          eventEndHour: endHourNow,
          eventEndMinute: endMinuteNow,
          eventType: 'throne_conquest',
          eventDate: today,
        }),
      });

      const triggerJson = await triggerRes.json().catch(() => ({}));
      results.push({
        ...w,
        eventType: 'throne_conquest',
        status: 'triggered',
        idleMin,
        elapsedMin,
        endHour: endHourNow,
        endMinute: endMinuteNow,
        trigger: triggerJson,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'throne_only',
        brt: brt.toISOString(),
        idleThreshold: INACTIVITY_MIN,
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
