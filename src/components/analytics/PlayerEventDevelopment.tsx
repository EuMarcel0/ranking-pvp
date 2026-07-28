import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, Minus, User, Activity, Calendar } from 'lucide-react';
import {
  AnalyticsFilters, fetchMatchesWithType, fetchKillLogsForMatches,
  fetchAllCharacters, buildCharacterMap, filterBanned, MatchWithType
} from '@/hooks/useAnalyticsData';

interface Props {
  filters: AnalyticsFilters;
}

interface MatchStat {
  matchId: string;
  matchDate: string;
  eventType: string;
  kills: number;
  deaths: number;
  kda: number;
}

function eventLabel(type: string) {
  switch (type) {
    case 'boss_event': return 'Boss Event';
    case 'throne_conquest': return 'Throne';
    case 'arka_war': return 'Arka War';
    default: return type;
  }
}

function eventBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (type) {
    case 'boss_event': return 'default';
    case 'throne_conquest': return 'secondary';
    case 'arka_war': return 'destructive';
    default: return 'outline';
  }
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export const PlayerEventDevelopment = ({ filters }: Props) => {
  const playerName = filters.playerName;

  const { data, isLoading } = useQuery({
    queryKey: ['player-event-dev', filters],
    queryFn: async () => {
      if (!playerName) return null;

      const [matches, characters] = await Promise.all([
        fetchMatchesWithType(filters),
        fetchAllCharacters(),
      ]);
      const charMap = buildCharacterMap(characters);
      const matchIds = matches.map(m => m.id);
      let logs = await fetchKillLogsForMatches(matchIds);
      logs = filterBanned(logs, charMap);

      // Filter logs involving this player
      const playerLogs = logs.filter(
        l => l.killer_name === playerName || l.victim_name === playerName
      );

      const matchMap = new Map<string, MatchWithType>();
      for (const m of matches) matchMap.set(m.id, m);

      // Per-match stats
      const perMatch = new Map<string, { kills: number; deaths: number }>();
      for (const l of playerLogs) {
        const s = perMatch.get(l.match_id) || { kills: 0, deaths: 0 };
        if (l.killer_name === playerName) s.kills++;
        if (l.victim_name === playerName) s.deaths++;
        perMatch.set(l.match_id, s);
      }

      const matchStats: MatchStat[] = [];
      for (const [mid, s] of perMatch) {
        const m = matchMap.get(mid);
        if (!m) continue;
        matchStats.push({
          matchId: mid,
          matchDate: m.match_date,
          eventType: m.event_type,
          kills: s.kills,
          deaths: s.deaths,
          kda: s.deaths === 0 ? s.kills : Math.round((s.kills / s.deaths) * 100) / 100,
        });
      }

      matchStats.sort((a, b) => a.matchDate.localeCompare(b.matchDate));

      // Compute insights
      const totalKills = matchStats.reduce((a, m) => a + m.kills, 0);
      const totalDeaths = matchStats.reduce((a, m) => a + m.deaths, 0);
      const avgKills = matchStats.length ? Math.round((totalKills / matchStats.length) * 100) / 100 : 0;
      const avgDeaths = matchStats.length ? Math.round((totalDeaths / matchStats.length) * 100) / 100 : 0;
      const overallKda = totalDeaths === 0 ? totalKills : Math.round((totalKills / totalDeaths) * 100) / 100;

      // Trend: compare first half vs second half
      const half = Math.ceil(matchStats.length / 2);
      const firstHalf = matchStats.slice(0, half);
      const secondHalf = matchStats.slice(half);

      const avgKdaFirst = firstHalf.length
        ? firstHalf.reduce((a, m) => a + m.kda, 0) / firstHalf.length : 0;
      const avgKdaSecond = secondHalf.length
        ? secondHalf.reduce((a, m) => a + m.kda, 0) / secondHalf.length : 0;

      const trend = avgKdaSecond > avgKdaFirst * 1.1
        ? 'improving'
        : avgKdaSecond < avgKdaFirst * 0.9
          ? 'declining'
          : 'stable';

      // Best and worst match
      const bestMatch = matchStats.length ? matchStats.reduce((a, b) => a.kda > b.kda ? a : b) : null;
      const worstMatch = matchStats.length ? matchStats.reduce((a, b) => a.kda < b.kda ? a : b) : null;

      // Per event type breakdown
      const byEventType = new Map<string, { kills: number; deaths: number; count: number }>();
      for (const m of matchStats) {
        const e = byEventType.get(m.eventType) || { kills: 0, deaths: 0, count: 0 };
        e.kills += m.kills;
        e.deaths += m.deaths;
        e.count++;
        byEventType.set(m.eventType, e);
      }

      const charInfo = charMap.get(playerName);

      return {
        matchStats,
        totalKills,
        totalDeaths,
        avgKills,
        avgDeaths,
        overallKda,
        trend,
        bestMatch,
        worstMatch,
        byEventType: Array.from(byEventType.entries()).map(([type, stats]) => ({
          type,
          ...stats,
          kda: stats.deaths === 0 ? stats.kills : Math.round((stats.kills / stats.deaths) * 100) / 100,
        })),
        charInfo,
        matchCount: matchStats.length,
      };
    },
    enabled: !!playerName,
    staleTime: 60000,
  });

  if (!playerName) {
    return null;
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando desenvolvimento do jogador...</div>;
  }

  if (!data || data.matchCount === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhum dado encontrado para <strong>{playerName}</strong> com os filtros selecionados.
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = data.trend === 'improving' ? TrendingUp : data.trend === 'declining' ? TrendingDown : Minus;
  const trendColor = data.trend === 'improving' ? 'text-green-500' : data.trend === 'declining' ? 'text-destructive' : 'text-muted-foreground';
  const trendText = data.trend === 'improving' ? 'Em evolução' : data.trend === 'declining' ? 'Em queda' : 'Estável';

  return (
    <div className="space-y-6">
      {/* Player Header & Insights */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Desenvolvimento: {playerName}
            {data.charInfo?.class && <Badge variant="outline">{data.charInfo.class}</Badge>}
            {data.charInfo?.guild && <Badge variant="secondary">{data.charInfo.guild}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground">Eventos</p>
              <p className="text-xl font-bold text-foreground">{data.matchCount}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground">Kills Totais</p>
              <p className="text-xl font-bold text-destructive">{data.totalKills}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground">Mortes Totais</p>
              <p className="text-xl font-bold text-muted-foreground">{data.totalDeaths}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground">KDA Geral</p>
              <p className="text-xl font-bold text-primary">{data.overallKda}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border text-center">
              <p className="text-xs text-muted-foreground">Tendência</p>
              <div className={`flex items-center justify-center gap-1 ${trendColor}`}>
                <TrendIcon className="w-5 h-5" />
                <span className="text-sm font-bold">{trendText}</span>
              </div>
            </div>
          </div>

          {/* Insight text */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-foreground">
            <p className="font-semibold mb-1">📊 Insight</p>
            <p>
              <strong>{playerName}</strong> participou de <strong>{data.matchCount}</strong> eventos com média de{' '}
              <strong>{data.avgKills}</strong> kills e <strong>{data.avgDeaths}</strong> mortes por evento.
              {data.bestMatch && (
                <> Melhor desempenho em <strong>{formatDate(data.bestMatch.matchDate)}</strong> ({eventLabel(data.bestMatch.eventType)}) com KDA <strong>{data.bestMatch.kda}</strong>.</>
              )}
              {data.worstMatch && data.worstMatch.matchId !== data.bestMatch?.matchId && (
                <> Pior desempenho em <strong>{formatDate(data.worstMatch.matchDate)}</strong> ({eventLabel(data.worstMatch.eventType)}) com KDA <strong>{data.worstMatch.kda}</strong>.</>
              )}
              {' '}Tendência geral: <strong className={trendColor}>{trendText.toLowerCase()}</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Per event type breakdown */}
      {data.byEventType.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Desempenho por Tipo de Evento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead className="text-right">Participações</TableHead>
                  <TableHead className="text-right">Kills</TableHead>
                  <TableHead className="text-right">Deaths</TableHead>
                  <TableHead className="text-right">KDA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byEventType.map(e => (
                  <TableRow key={e.type}>
                    <TableCell><Badge variant={eventBadgeVariant(e.type)}>{eventLabel(e.type)}</Badge></TableCell>
                    <TableCell className="text-right">{e.count}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{e.kills}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{e.deaths}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{e.kda}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Per match timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Histórico por Evento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Kills</TableHead>
                <TableHead className="text-right">Deaths</TableHead>
                <TableHead className="text-right">KDA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.matchStats.map((m, i) => (
                <TableRow key={m.matchId}>
                  <TableCell className="text-sm">{formatDate(m.matchDate)}</TableCell>
                  <TableCell><Badge variant={eventBadgeVariant(m.eventType)} className="text-xs">{eventLabel(m.eventType)}</Badge></TableCell>
                  <TableCell className="text-right font-bold text-destructive">{m.kills}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{m.deaths}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{m.kda}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
