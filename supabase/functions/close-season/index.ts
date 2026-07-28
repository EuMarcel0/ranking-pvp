import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RANKING_LABELS: Record<string, string> = {
  geral: '👑 Ranking Geral',
  reis_pvp: '🤴 Reis do PVP',
  cones: '💩 Cones Monodedo',
  kill_streak: '🔥 Kill Streak',
  mural_vergonha: '☠️ Mural da Vergonha',
  fogo_amigo: '🤝 Fogo Amigo',
  putinha: '🍑 Minha Putinha',
};

function buildDiscordChunks(seasonName: string, grouped: Record<string, any[]>, prefix = '') {
  const sections: string[] = [];
  for (const [type, label] of Object.entries(RANKING_LABELS)) {
    const list = grouped[type];
    if (!list || list.length === 0) continue;
    const lines = list.slice(0, 10).map((s) => {
      const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : `#${s.position}`;
      return `${medal} ${s.player_name}${s.player_class ? ` (${s.player_class})` : ''} — ${Number(s.score).toFixed(2)}`;
    });
    sections.push(`**${label}**\n${lines.join('\n')}`);
  }
  const content = `${prefix}🏆 **HALL DA FAMA — ${seasonName}** 🏆\n\n${sections.join('\n\n')}`;
  const chunks: string[] = [];
  let buf = '';
  for (const part of content.split('\n')) {
    if ((buf + '\n' + part).length > 1900) {
      chunks.push(buf);
      buf = part;
    } else {
      buf = buf ? `${buf}\n${part}` : part;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function postChunks(webhook: string, chunks: string[]) {
  for (const c of chunks) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: c }),
    });
  }
}

function pickWebhook(target: 'prod' | 'homolog'): string | undefined {
  return target === 'prod'
    ? Deno.env.get('DISCORD_WEBHOOK_URL_PROD')
    : Deno.env.get('DISCORD_WEBHOOK_URL');
}

async function buildGroupedFromActiveSeason(supabase: any) {
  const { data: active, error: actErr } = await supabase
    .from('seasons')
    .select('id, name, started_at')
    .eq('status', 'active')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (actErr) throw actErr;
  if (!active) throw new Error('Nenhuma temporada ativa encontrada');

  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = active.started_at;

  const [geral, reis, killStreak, mural, fogo, putinha] = await Promise.all([
    supabase.rpc('get_ranking_geral', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null }),
    supabase.rpc('get_ranking_reis_pvp', { p_date_from: dateFrom, p_date_to: today, p_event_type: 'boss_event' }),
    supabase.rpc('get_ranking_kill_streak', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
    supabase.rpc('get_ranking_mural_vergonha', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
    supabase.rpc('get_ranking_fogo_amigo', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
    supabase.rpc('get_ranking_putinha', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
  ]);

  const grouped: Record<string, any[]> = {};

  grouped['geral'] = (geral.data || []).slice()
    .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.event_score }));

  grouped['reis_pvp'] = (reis.data || []).filter((r: any) => r.is_rei)
    .sort((a: any, b: any) => Number(b.vezes) - Number(a.vezes) || Number(b.melhor_score) - Number(a.melhor_score))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, score: r.melhor_score }));

  grouped['cones'] = (reis.data || []).filter((r: any) => !r.is_rei)
    .sort((a: any, b: any) => Number(b.vezes) - Number(a.vezes) || Number(a.pior_score) - Number(b.pior_score))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, score: r.pior_score }));

  grouped['kill_streak'] = (killStreak.data || []).slice()
    .sort((a: any, b: any) => Number(b.max_streak) - Number(a.max_streak))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.max_streak }));

  grouped['mural_vergonha'] = (mural.data || []).slice()
    .sort((a: any, b: any) => Number(b.total_deaths) - Number(a.total_deaths))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.total_deaths }));

  grouped['fogo_amigo'] = (fogo.data || []).slice()
    .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.event_score }));

  grouped['putinha'] = (putinha.data || []).slice()
    .sort((a: any, b: any) => Number(b.deaths) - Number(a.deaths))
    .slice(0, 10)
    .map((r: any, i: number) => ({ position: i + 1, player_name: `${r.killer_name} → ${r.victim_name}`, score: r.deaths }));

  return { season: active, grouped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const preview: boolean = body?.preview === true;
    const postOnly: boolean = body?.post_only === true;
    const skipDiscord: boolean = body?.skip_discord === true;
    const winnersMode: boolean = body?.winners === true;
    const target: 'prod' | 'homolog' = body?.target === 'prod' ? 'prod' : (body?.target === 'homolog' ? 'homolog' : 'prod');

    // ===== WINNERS OF THE MONTH MODE =====
    // Builds Top 5 PvP (Ranking Geral) + Best per Class for a season.
    // Defaults to the active season if no season_id is provided.
    if (winnersMode) {
      let seasonName: string;
      let dateFrom: string;
      let dateTo: string;

      // Helpers: first/last day of the season's month (YYYY-MM-DD)
      const firstDay = (y: number, m: number) =>
        `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = (y: number, m: number) => {
        const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of m
        return d.toISOString().slice(0, 10);
      };

      if (body?.season_id) {
        const { data: s } = await supabase
          .from('seasons')
          .select('name, year, month')
          .eq('id', body.season_id)
          .maybeSingle();
        if (!s) throw new Error('Temporada não encontrada');
        seasonName = s.name;
        dateFrom = firstDay(s.year, s.month);
        dateTo = lastDay(s.year, s.month);
      } else {
        const { data: active } = await supabase
          .from('seasons')
          .select('name, year, month')
          .eq('status', 'active')
          .order('year', { ascending: false })
          .order('month', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!active) throw new Error('Nenhuma temporada ativa');
        seasonName = active.name;
        dateFrom = firstDay(active.year, active.month);
        dateTo = lastDay(active.year, active.month);
      }

      const [geralRes, classRes] = await Promise.all([
        supabase.rpc('get_ranking_geral', { p_date_from: dateFrom, p_date_to: dateTo, p_hour_from: null, p_hour_to: null }),
        supabase.rpc('get_ranking_best_per_class', { p_date_from: dateFrom, p_date_to: dateTo, p_event_type: 'boss_event' }),
      ]);
      if (geralRes.error) throw geralRes.error;
      if (classRes.error) throw classRes.error;

      const top5 = (geralRes.data || [])
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
          matches: Number(r.matches_played),
          score: Number(r.event_score),
        }));

      const bestPerClass = (classRes.data || [])
        .filter((r: any) => r.is_best)
        .slice()
        .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
        .map((r: any) => ({
          class_name: r.class_name,
          player_name: r.player_name,
          kills: Number(r.total_kills),
          deaths: Number(r.total_deaths),
          kda: Number(r.total_kda),
          matches: Number(r.match_count),
          score: Number(r.event_score),
        }));

      const payload = { season: seasonName, top5, bestPerClass };

      let discordPosted = false;
      if (!skipDiscord) {
        const webhook = pickWebhook(target);
        const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';
        if (!webhook) throw new Error(`Webhook ${target} não configurado`);
        if (!paused) {
          const prefix = target === 'homolog' ? '🧪 **[HOMOLOG]**\n' : '';
          const discordHeader = `${prefix}🏆 **GANHADORES DO MÊS — ${seasonName}** 🏆`;

          const medal = (p: number) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `#${p}`);
          const top5Lines = top5.length === 0
            ? '_Sem dados de PvP no período._'
            : top5.map((t: any) => {
                const cls = t.player_class ? ` (${t.player_class})` : '';
                const guild = t.player_guild ? ` [${t.player_guild}]` : '';
                return `${medal(t.position)} **${t.player_name}**${cls}${guild} — \`${t.score.toFixed(2)}\` pts • ${t.kills}K/${t.deaths}D • KDA ${t.kda.toFixed(2)}`;
              }).join('\n');

          const padR = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + '…' : s + ' '.repeat(n - s.length));
          const padL = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s);
          const SEP = '  ';
          const W = { cls: 20, ply: 16, k: 5, d: 5, kda: 6, score: 9 };
          const totalW = W.cls + W.ply + W.k + W.d + W.kda + W.score + SEP.length * 5;
          const tableHeader =
            padR('Classe', W.cls) + SEP +
            padR('Jogador', W.ply) + SEP +
            padL('K', W.k) + SEP +
            padL('D', W.d) + SEP +
            padL('KDA', W.kda) + SEP +
            padL('Score', W.score);
          const classLines = bestPerClass.length === 0
            ? '_Sem dados por classe no período._'
            : '```\n' +
              tableHeader + '\n' +
              '-'.repeat(totalW) + '\n' +
              bestPerClass.map((b: any) =>
                padR(String(b.class_name), W.cls) + SEP +
                padR(String(b.player_name), W.ply) + SEP +
                padL(String(b.kills), W.k) + SEP +
                padL(String(b.deaths), W.d) + SEP +
                padL(b.kda.toFixed(2), W.kda) + SEP +
                padL(b.score.toFixed(2), W.score)
              ).join('\n') +
              '\n```';

          const content =
            discordHeader + '\n\n' +
            '🏅 **Top 5 PvP — Ranking Geral**\n' + top5Lines + '\n\n' +
            '⚔️ **Melhor por Classe**\n' + classLines;

          // Chunk respecting Discord 2000 char limit
          const chunks: string[] = [];
          let buf = '';
          for (const part of content.split('\n')) {
            if ((buf + '\n' + part).length > 1900) {
              chunks.push(buf);
              buf = part;
            } else {
              buf = buf ? `${buf}\n${part}` : part;
            }
          }
          if (buf) chunks.push(buf);
          await postChunks(webhook, chunks);
          discordPosted = true;
        }
      }

      return new Response(
        JSON.stringify({ success: true, mode: 'winners', target, discord_posted: discordPosted, ...payload }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== POST ONLY MODE: post an already-closed season to Discord =====
    if (postOnly) {
      const seasonId: string | undefined = body?.season_id;
      if (!seasonId) throw new Error('season_id é obrigatório no modo post_only');

      const [{ data: season }, { data: snaps }] = await Promise.all([
        supabase.from('seasons').select('name').eq('id', seasonId).maybeSingle(),
        supabase.from('season_snapshots').select('*').eq('season_id', seasonId).order('ranking_type').order('position'),
      ]);
      if (!season) throw new Error('Temporada não encontrada');
      if (!snaps || snaps.length === 0) throw new Error('Sem snapshots para postar');

      const webhook = pickWebhook(target);
      if (!webhook) throw new Error(`Webhook ${target} não configurado`);

      const grouped: Record<string, any[]> = {};
      for (const s of snaps) (grouped[s.ranking_type] ||= []).push(s);

      const prefix = target === 'homolog' ? '🧪 **[HOMOLOG]**\n' : '';
      const chunks = buildDiscordChunks(season.name, grouped, prefix);
      await postChunks(webhook, chunks);

      return new Response(
        JSON.stringify({ success: true, post_only: true, target, season: season.name, discord_posted: true, snapshots: snaps.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== PREVIEW MODE =====
    if (preview) {
      const { season, grouped } = await buildGroupedFromActiveSeason(supabase);
      const totalRows = Object.values(grouped).reduce((acc, l) => acc + l.length, 0);

      let discordPosted = false;
      if (!skipDiscord) {
        const webhook = pickWebhook(target);
        if (!webhook) throw new Error(`Webhook ${target} não configurado`);
        const prefix = target === 'homolog' ? '🧪 **[PREVIEW / HOMOLOG]**\n' : '🧪 **[PREVIEW]**\n';
        const chunks = buildDiscordChunks(season.name + ' (preview)', grouped, prefix);
        await postChunks(webhook, chunks);
        discordPosted = true;
      }

      return new Response(
        JSON.stringify({ success: true, preview: true, target, season: season.name, snapshots: totalRows, discord_posted: discordPosted, grouped }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Normal flow: close season =====
    const { data: closeData, error: closeErr } = await supabase.rpc('close_current_season');
    if (closeErr) throw closeErr;

    const result = Array.isArray(closeData) ? closeData[0] : closeData;
    const closedId: string | null = result?.closed_season_id ?? null;
    const newId: string | null = result?.new_season_id ?? null;

    let discordPosted = false;

    // Auto post only if explicitly requested (skip_discord defaults to true now — manual post)
    if (closedId && !skipDiscord && body?.auto_post === true) {
      const [{ data: season }, { data: snaps }] = await Promise.all([
        supabase.from('seasons').select('name').eq('id', closedId).maybeSingle(),
        supabase.from('season_snapshots').select('*').eq('season_id', closedId).order('ranking_type').order('position'),
      ]);

      const webhook = pickWebhook(target);
      const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';

      if (webhook && !paused && snaps && snaps.length > 0) {
        const grouped: Record<string, any[]> = {};
        for (const s of snaps) (grouped[s.ranking_type] ||= []).push(s);
        const prefix = target === 'homolog' ? '🧪 **[HOMOLOG]**\n' : '';
        const chunks = buildDiscordChunks(season?.name ?? 'Temporada', grouped, prefix);
        await postChunks(webhook, chunks);
        discordPosted = true;
      }
    }

    return new Response(
      JSON.stringify({ success: true, closed_season_id: closedId, new_season_id: newId, snapshots: result?.snapshots_created ?? 0, discord_posted: discordPosted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
