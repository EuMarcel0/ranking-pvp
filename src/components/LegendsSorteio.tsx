import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Gift, Search, Shuffle, Users, Trophy, Send } from 'lucide-react';
import { toast } from 'sonner';

interface Participant {
  name: string;
  guild: string;
  matchCount: number;
}

export const LegendsSorteio = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hourFrom, setHourFrom] = useState('');
  const [hourTo, setHourTo] = useState('');
  const [prizeCount, setPrizeCount] = useState(1);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winners, setWinners] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [shuffleIndex, setShuffleIndex] = useState<number | null>(null);
  const [posted, setPosted] = useState(false);

  const fetchParticipants = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Informe o período (data de/até)');
      return;
    }
    setLoading(true);
    setWinners([]);
    setPosted(false);

    try {
      // 1. Get matches in range
      let matchQuery = supabase
        .from('pvp_matches')
        .select('id')
        .gte('match_date', dateFrom)
        .lte('match_date', dateTo);

      if (hourFrom) matchQuery = matchQuery.gte('match_hour', parseInt(hourFrom));
      if (hourTo) matchQuery = matchQuery.lte('match_hour', parseInt(hourTo));

      const { data: matches, error: matchErr } = await matchQuery;
      if (matchErr) throw matchErr;
      if (!matches || matches.length === 0) {
        toast.info('Nenhum evento encontrado no período');
        setParticipants([]);
        setLoading(false);
        return;
      }

      const matchIds = matches.map(m => m.id);

      // 2. Get all kill logs for those matches
      const allLogs: { killer_name: string; victim_name: string; match_id: string }[] = [];
      const batchSize = 50;
      for (let i = 0; i < matchIds.length; i += batchSize) {
        const batch = matchIds.slice(i, i + batchSize);
        const { data: logs } = await supabase
          .from('pvp_kill_logs')
          .select('killer_name, victim_name, match_id')
          .in('match_id', batch);
        if (logs) allLogs.push(...logs);
      }

      // 3. Get all LEGENDS/iLEGENDS characters
      const { data: chars } = await supabase
        .from('characters')
        .select('name, guild')
        .in('guild', ['LEGENDS', 'iLEGENDS']);

      const legendsNames = new Map((chars || []).map(c => [c.name, c.guild]));

      // 4. Count unique participants per match
      const playerMatches = new Map<string, Set<string>>();
      for (const log of allLogs) {
        for (const name of [log.killer_name, log.victim_name]) {
          if (legendsNames.has(name)) {
            if (!playerMatches.has(name)) playerMatches.set(name, new Set());
            playerMatches.get(name)!.add(log.match_id);
          }
        }
      }

      const result: Participant[] = Array.from(playerMatches.entries())
        .map(([name, matchSet]) => ({
          name,
          guild: legendsNames.get(name) || '',
          matchCount: matchSet.size,
        }))
        .sort((a, b) => b.matchCount - a.matchCount);

      setParticipants(result);
      if (result.length === 0) {
        toast.info('Nenhum jogador LEGENDS/iLEGENDS encontrado no período');
      } else {
        toast.success(`${result.length} participantes encontrados`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao buscar participantes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const runDraw = async () => {
    if (participants.length === 0) {
      toast.error('Busque os participantes primeiro');
      return;
    }
    if (prizeCount < 1 || prizeCount > participants.length) {
      toast.error(`Quantidade de prêmios deve ser entre 1 e ${participants.length}`);
      return;
    }

    setDrawing(true);
    setWinners([]);
    setPosted(false);

    // Shuffle animation
    const shuffled = [...participants];
    const totalAnimSteps = 20;
    for (let step = 0; step < totalAnimSteps; step++) {
      // Fisher-Yates shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setShuffleIndex(Math.floor(Math.random() * shuffled.length));
      await new Promise(r => setTimeout(r, 100));
    }

    setShuffleIndex(null);
    const selected = shuffled.slice(0, prizeCount);
    setWinners(selected);
    setDrawing(false);
    toast.success(`${selected.length} ganhador(es) sorteado(s)!`);
  };

  const postToDiscord = async () => {
    if (winners.length === 0) return;

    try {
      const { data, error } = await supabase.functions.invoke('discord-webhook', {
        body: {
          type: 'sorteio',
          environment: 'prod',
          participants: participants.map(p => ({ name: p.name, guild: p.guild, matchCount: p.matchCount })),
          winners: winners.map(p => ({ name: p.name, guild: p.guild })),
          filters: { dateFrom, dateTo, hourFrom: hourFrom ? parseInt(hourFrom) : undefined, hourTo: hourTo ? parseInt(hourTo) : undefined },
          totals: { participantCount: participants.length, prizeCount: winners.length },
        },
      });

      if (error) throw error;
      setPosted(true);
      toast.success('Resultado postado no Discord!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao postar no Discord: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Gift className="w-6 h-6" />
            Sorteio LEGENDS & iLEGENDS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Data De</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data Até</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora Inicial</label>
              <select
                value={hourFrom}
                onChange={e => setHourFrom(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todas</option>
                {[20, 21, 22].map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora Final</label>
              <select
                value={hourTo}
                onChange={e => setHourTo(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todas</option>
                {[20, 21, 22].map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={fetchParticipants} disabled={loading} className="gap-2">
            <Search className="w-4 h-4" />
            {loading ? 'Buscando...' : 'Buscar Participantes'}
          </Button>
        </CardContent>
      </Card>

      {/* Participants */}
      {participants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-5 h-5" />
              Participantes ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
              {participants.map((p, i) => (
                <div
                  key={p.name}
                  className={`flex items-center gap-2 p-2 rounded-md border text-sm transition-colors ${
                    shuffleIndex === i ? 'bg-primary/20 border-primary' : 'border-border'
                  } ${winners.some(w => w.name === p.name) ? 'bg-yellow-500/20 border-yellow-500 ring-1 ring-yellow-500' : ''}`}
                >
                  <span className="font-medium truncate">{p.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.guild}</Badge>
                  <span className="text-muted-foreground text-xs ml-auto">{p.matchCount}x</span>
                </div>
              ))}
            </div>

            {/* Draw controls */}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Qtd. Prêmios:</label>
                <Input
                  type="number"
                  min={1}
                  max={participants.length}
                  value={prizeCount}
                  onChange={e => setPrizeCount(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              </div>
              <Button onClick={runDraw} disabled={drawing} variant="default" className="gap-2">
                <Shuffle className="w-4 h-4" />
                {drawing ? 'Sorteando...' : 'Sortear'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Winners */}
      {winners.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Trophy className="w-6 h-6" />
              Ganhadores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {winners.map((w, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                return (
                  <div key={w.name} className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <span className="text-xl">{medal}</span>
                    <span className="font-bold text-lg">{w.name}</span>
                    <Badge variant="outline">{w.guild}</Badge>
                  </div>
                );
              })}
            </div>

            <Button onClick={postToDiscord} disabled={posted} variant="outline" className="gap-2">
              <Send className="w-4 h-4" />
              {posted ? 'Postado ✓' : 'Postar no Discord'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
