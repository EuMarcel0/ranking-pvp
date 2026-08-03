/**
 * Todo dia 1 do mês (BRT): fecha a temporada do mês anterior e posta a imagem
 * (Ganhadores do Mês + Melhor por Classe + Hall da Fama) no Discord.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildHallFameSections,
  pngToBase64,
  renderMonthlyHallPng,
  type BestPerClassEntry,
  type WinnersTopEntry,
} from '../_shared/hallFameSvg.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SECTION_ORDER = [
  'geral',
  'reis_pvp',
  'cones',
  'kill_streak',
  'mural_vergonha',
  'fogo_amigo',
  'putinha',
];

function brtNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function firstDay(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function lastDay(y: number, m: number) {
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function isPreviousSeason(active: { year: number; month: number }, brt: Date) {
  const y = brt.getFullYear();
  const m = brt.getMonth() + 1;
  if (active.year < y) return true;
  if (active.year === y && active.month < m) return true;
  return false;
}

async function postImageToDiscord(
  webhook: string,
  opts: { png: Uint8Array; filename: string; content: string },
) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: opts.content }));
  form.append('files[0]', new Blob([opts.png], { type: 'image/png' }), opts.filename);

  const res = await fetch(webhook, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }

    const force = body?.force === true;
    const target: 'prod' | 'homolog' = body?.target === 'homolog' ? 'homolog' : 'prod';
    const dryRun = body?.dry_run === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const brt = brtNow();
    if (!force && brt.getDate() !== 1) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: 'not_day_1',
          brt: brt.toISOString(),
          message: 'Só executa no dia 1 (BRT), use force=true para testar.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: active, error: actErr } = await supabase
      .from('seasons')
      .select('id, name, year, month, status')
      .eq('status', 'active')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (actErr) throw actErr;
    if (!active) throw new Error('Nenhuma temporada ativa');

    if (!force && !isPreviousSeason(active, brt)) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: 'active_is_current_month',
          season: active.name,
          message: 'Temporada ativa já é o mês corrente — nada a fechar.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1) Ganhadores do mês que será fechado (antes do close)
    const dateFrom = firstDay(active.year, active.month);
    const dateTo = lastDay(active.year, active.month);

    const [geralRes, classRes] = await Promise.all([
      supabase.rpc('get_ranking_geral', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_hour_from: null,
        p_hour_to: null,
      }),
      supabase.rpc('get_ranking_best_per_class', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_event_type: 'boss_event',
      }),
    ]);
    if (geralRes.error) throw geralRes.error;
    if (classRes.error) throw classRes.error;

    const top5: WinnersTopEntry[] = (geralRes.data || [])
      .slice()
      .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
      .slice(0, 5)
      .map((r: any, i: number) => ({
        position: i + 1,
        player_name: r.player_name,
        player_class: r.player_class,
        player_guild: r.player_guild,
        kills: Number(r.total_kills),
        deaths: Number(r.total_deaths),
        kda: Number(r.kda),
        score: Number(r.event_score),
      }));

    const bestPerClass: BestPerClassEntry[] = (classRes.data || [])
      .filter((r: any) => r.is_best)
      .slice()
      .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
      .map((r: any) => ({
        class_name: r.class_name,
        player_name: r.player_name,
        kills: Number(r.total_kills),
        deaths: Number(r.total_deaths),
        kda: Number(r.total_kda),
        score: Number(r.event_score),
      }));

    // 2) Fecha temporada (gera snapshots do Hall da Fama)
    const { data: closeData, error: closeErr } = await supabase.rpc('close_current_season');
    if (closeErr) throw closeErr;
    const result = Array.isArray(closeData) ? closeData[0] : closeData;
    const closedId: string | null = result?.closed_season_id ?? null;
    const newId: string | null = result?.new_season_id ?? null;
    if (!closedId) throw new Error('Falha ao fechar temporada (sem closed_season_id)');

    const [{ data: season }, { data: snaps }] = await Promise.all([
      supabase.from('seasons').select('name, year, month').eq('id', closedId).maybeSingle(),
      supabase
        .from('season_snapshots')
        .select('*')
        .eq('season_id', closedId)
        .order('ranking_type')
        .order('position'),
    ]);

    const seasonName = season?.name ?? active.name;
    const grouped: Record<string, any[]> = {};
    for (const s of snaps || []) (grouped[s.ranking_type] ||= []).push(s);

    // Garante ordem estável
    for (const key of SECTION_ORDER) {
      if (grouped[key]) grouped[key].sort((a, b) => Number(a.position) - Number(b.position));
    }

    const hallSections = buildHallFameSections(grouped);

    // 3) Gera PNG
    const png = await renderMonthlyHallPng({
      seasonName,
      top5,
      bestPerClass,
      hallSections,
    });

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          closed_season_id: closedId,
          new_season_id: newId,
          season: seasonName,
          top5: top5.length,
          bestPerClass: bestPerClass.length,
          hallSections: hallSections.length,
          snapshots: snaps?.length ?? 0,
          png_bytes: png.length,
          image_base64_prefix: `data:image/png;base64,${pngToBase64(png).slice(0, 80)}...`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4) Posta no Discord
    const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';
    if (paused && target === 'prod') {
      return new Response(
        JSON.stringify({
          success: true,
          closed_season_id: closedId,
          new_season_id: newId,
          season: seasonName,
          discord_posted: false,
          skipped: 'AUTO_POST_PAUSED',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const webhook =
      target === 'homolog'
        ? Deno.env.get('DISCORD_WEBHOOK_URL')
        : Deno.env.get('DISCORD_WEBHOOK_URL_PROD') || Deno.env.get('DISCORD_WEBHOOK_URL');

    if (!webhook) throw new Error(`Webhook ${target} não configurado`);

    const prefix = target === 'homolog' ? '🧪 **[HOMOLOG]** ' : '';
    await postImageToDiscord(webhook, {
      png,
      filename: `hall-da-fama-${seasonName.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.png`,
      content: `${prefix}🏆 **HALL DA FAMA / GANHADORES — ${seasonName}**`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        closed_season_id: closedId,
        new_season_id: newId,
        season: seasonName,
        snapshots: snaps?.length ?? 0,
        top5: top5.length,
        bestPerClass: bestPerClass.length,
        discord_posted: true,
        target,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[monthly-close-season]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
