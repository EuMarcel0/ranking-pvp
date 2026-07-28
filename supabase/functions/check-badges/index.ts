import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Comum',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Lendária',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: newOnes, error } = await supabase.rpc('check_player_badges');
    if (error) throw error;

    const allList = (newOnes || []) as Array<{ p_name: string; p_badge_code: string; p_label: string; p_emoji: string; p_rarity: string }>;

    // Tenta ler match_id do body para restringir aos participantes desta partida
    let matchId: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      matchId = body?.match_id ?? null;
    } catch (_) {}

    let participants = new Set<string>();
    if (matchId) {
      const { data: mps } = await supabase
        .from('pvp_match_players')
        .select('player_name')
        .eq('match_id', matchId);
      participants = new Set((mps || []).map((p: any) => (p.player_name || '').toLowerCase()));
    } else {
      const brt = new Date(Date.now() - 3 * 3600000);
      const today = `${brt.getFullYear()}-${String(brt.getMonth() + 1).padStart(2, '0')}-${String(brt.getDate()).padStart(2, '0')}`;
      const { data: todayMatches } = await supabase
        .from('pvp_matches')
        .select('id')
        .eq('match_date', today);
      const todayMatchIds = (todayMatches || []).map((m: any) => m.id);
      if (todayMatchIds.length > 0) {
        const { data: tps } = await supabase
          .from('pvp_match_players')
          .select('player_name')
          .in('match_id', todayMatchIds);
        participants = new Set((tps || []).map((p: any) => (p.player_name || '').toLowerCase()));
      }
    }
    const list = allList.filter((b) => participants.has((b.p_name || '').toLowerCase()));
    let posted = 0;

    if (list.length > 0) {
      const webhook = Deno.env.get('DISCORD_WEBHOOK_URL_PROD');
      const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';

      if (webhook && !paused) {
        const lines = list.map((b) => `${b.p_emoji} **${b.p_name}** desbloqueou **${b.p_label}** _(${RARITY_LABEL[b.p_rarity] ?? b.p_rarity})_`);
        const header = `🏅 **NOVAS CONQUISTAS DESBLOQUEADAS** 🏅\n\n`;

        const chunks: string[] = [];
        let buf = header;
        for (const line of lines) {
          if ((buf + '\n' + line).length > 1900) {
            chunks.push(buf);
            buf = line;
          } else {
            buf = buf === header ? buf + line : buf + '\n' + line;
          }
        }
        if (buf.trim()) chunks.push(buf);

        for (const c of chunks) {
          const r = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: c }),
          });
          if (r.ok) posted++;
        }

        for (const b of list) {
          await supabase
            .from('player_badges')
            .update({ notified: true })
            .eq('player_name', b.p_name)
            .eq('badge_code', b.p_badge_code);
        }
      }
    }

    // Marca como notificadas conquistas antigas (jogadores que não participaram hoje) para evitar reposts
    const skipped = allList.filter((b) => !participants.has((b.p_name || '').toLowerCase()));
    for (const b of skipped) {
      await supabase
        .from('player_badges')
        .update({ notified: true })
        .eq('player_name', b.p_name)
        .eq('badge_code', b.p_badge_code);
    }

    return new Response(
      JSON.stringify({ success: true, new_badges: list.length, discord_chunks_posted: posted, badges: list }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
