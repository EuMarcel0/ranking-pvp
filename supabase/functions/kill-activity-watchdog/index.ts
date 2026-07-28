// Watchdog: a cada minuto verifica eventos em andamento e detecta encerramento
// (3+ min sem kills no banco externo). Se detectado e ainda não processado,
// dispara auto-process-ranking com forceProcess=true para postar no Discord.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INACTIVITY_MIN = 7;       // minutos sem kill = evento encerrado
const MIN_ELAPSED_MIN = 25;     // só verifica após ~25 min do início do evento
const MAX_WINDOW_MIN = 120;     // hard fallback: força considerar até 2h depois do início

interface EventWindow {
  eventType: 'boss_event' | 'throne_conquest';
  hour: number;
  minute: number;
}

// BRT day-of-week → janelas válidas (espelho do cronograma do projeto)
function getValidWindows(brtNow: Date): EventWindow[] {
  const dow = brtNow.getDay(); // 0=Dom..6=Sáb
  const list: EventWindow[] = [];

  // Boss
  if (dow === 1) {
    list.push({ eventType: 'boss_event', hour: 21, minute: 0 });
    list.push({ eventType: 'boss_event', hour: 22, minute: 0 });
  } else {
    list.push({ eventType: 'boss_event', hour: 20, minute: 0 });
    // Tue/Thu: boss da noite começa às 22:30 (não há 22:00)
    if (dow === 2 || dow === 4) {
      list.push({ eventType: 'boss_event', hour: 22, minute: 30 });
    } else {
      list.push({ eventType: 'boss_event', hour: 22, minute: 0 });
    }
  }

  // Throne Conquest (terça 21:36)
  if (dow === 2) list.push({ eventType: 'throne_conquest', hour: 21, minute: 36 });

  return list;
}

function brtNow(): Date {
  return new Date(Date.now() - 3 * 3600000);
}

function brtNowMs(): number {
  return Date.now();
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const internal = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');
    if (!externalUrl || !externalKey) {
      return new Response(JSON.stringify({ error: 'External DB not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const external = createClient(externalUrl, externalKey);

    const brt = brtNow();
    const today = ymd(brt);
    const windows = getValidWindows(brt);
    const results: any[] = [];

    for (const w of windows) {
      const startBRT = new Date(brt);
      startBRT.setHours(w.hour, w.minute, 0, 0);
      const elapsedMin = Math.floor((brt.getTime() - startBRT.getTime()) / 60000);

      // Janela inválida: ainda não começou ou já passou demais
      if (elapsedMin < MIN_ELAPSED_MIN || elapsedMin > MAX_WINDOW_MIN) {
        results.push({ ...w, skipped: 'out_of_window', elapsedMin });
        continue;
      }

      // Já foi processada hoje? (inclui match_minute para distinguir 22:00 vs 22:30)
      const { data: existingRows } = await internal
        .from('pvp_matches')
        .select('id')
        .eq('match_date', today)
        .eq('match_hour', w.hour)
        .eq('match_minute', w.minute)
        .eq('event_type', w.eventType)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        results.push({ ...w, skipped: 'already_processed' });
        continue;
      }

      // Consulta o último kill no banco externo dentro da janela do evento
      // O external DB armazena timestamp em local time (BRT)
      const startStr = `${today}T${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
      const endHour = Math.min(23, w.hour + 2);
      const endStr = `${today}T${String(endHour).padStart(2, '0')}:59`;

      const mapFilter = w.eventType === 'throne_conquest' ? 'Devias' : 'PvP Square';

      const { data: lastLog, error: logErr } = await external
        .from('logs_pvp')
        .select('id, timestamp, content')
        .gte('timestamp', startStr)
        .lte('timestamp', endStr)
        .ilike('content', `%${mapFilter}%`)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (logErr) {
        results.push({ ...w, error: logErr.message });
        continue;
      }

      if (!lastLog || lastLog.length === 0) {
        results.push({ ...w, status: 'no_kills_yet', elapsedMin });
        continue;
      }

      const lastTsMs = (() => {
        const raw = lastLog[0].timestamp?.trim();
        if (!raw) return null;
        const match = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
        if (!match) return null;
        const [, year, month, day, hour, minute, second] = match;
        return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + 3 * 3600000;
      })();

      if (lastTsMs === null) {
        results.push({ ...w, status: 'invalid_timestamp', elapsedMin });
        continue;
      }

      const idleMin = Math.floor((brtNowMs() - lastTsMs) / 60000);

      if (idleMin < INACTIVITY_MIN) {
        results.push({ ...w, status: 'still_active', idleMin, elapsedMin });
        continue;
      }

      // ENCERRADO: dispara processamento + post no Discord
      console.log(`[Watchdog] Event ended detected: ${w.eventType} ${w.hour}:${w.minute} (idle=${idleMin}min, elapsed=${elapsedMin}min). Triggering auto-process-ranking...`);

      const triggerRes = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-process-ranking`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            trigger: 'watchdog',
            attempt: 3,
            forceProcess: true,
            eventHour: w.hour,
            eventMinute: w.minute,
            eventType: w.eventType,
          }),
        }
      );
      const triggerJson = await triggerRes.json().catch(() => ({}));
      results.push({ ...w, status: 'triggered', idleMin, elapsedMin, trigger: triggerJson });
    }

    return new Response(
      JSON.stringify({ success: true, brt: brt.toISOString(), checked: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
