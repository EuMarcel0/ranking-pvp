import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Crown, Trophy, Target, TrendingUp, TrendingDown, Skull, Calendar, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventTypeFilter } from './EventTypeFilter';

interface PlayerStats {
  player_name: string;
  vezes: number;
  melhor_score: number;
  pior_score: number;
  media_score: number;
}

interface HighlightData {
  maisVezes: PlayerStats | null;
  extremeScore: { player_name: string; score: number; date: string; hour: number } | null;
  extremeMedia: PlayerStats | null;
}

type ViewMode = 'rei' | 'cone';

export const ReisDoPVP = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('rei');
  const [eventType, setEventType] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: rankingData, isLoading } = useQuery({
    queryKey: ['reis-cone-pvp', startDate, endDate, eventType],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_ranking_reis_pvp', {
        p_date_from: startDate || null,
        p_date_to: endDate || null,
        p_event_type: eventType,
      });
      if (error) throw error;

      const reisAgg: PlayerStats[] = [];
      const conesAgg: PlayerStats[] = [];
      let reiBest: { player_name: string; score: number; date: string; hour: number } | null = null;
      let coneWorst: { player_name: string; score: number; date: string; hour: number } | null = null;

      (data || []).forEach((r: any) => {
        const stats: PlayerStats = {
          player_name: r.player_name,
          vezes: Number(r.vezes),
          melhor_score: Number(r.melhor_score),
          pior_score: Number(r.pior_score),
          media_score: Number(r.media_score),
        };
        if (r.is_rei) {
          reisAgg.push(stats);
          const reiScore = Number(r.melhor_score);
          if (!reiBest || reiScore > reiBest.score) {
            reiBest = { player_name: r.player_name, score: reiScore, date: r.extreme_match_date, hour: Number(r.extreme_match_hour) };
          }
        } else {
          conesAgg.push(stats);
          const coneScore = Number(r.pior_score);
          if (!coneWorst || coneScore < coneWorst.score) {
            coneWorst = { player_name: r.player_name, score: coneScore, date: r.extreme_match_date, hour: Number(r.extreme_match_hour) };
          }
        }
      });

      const reiRanking = reisAgg.sort((a, b) => b.vezes - a.vezes || b.melhor_score - a.melhor_score);
      const coneRanking = conesAgg.sort((a, b) => b.vezes - a.vezes || a.pior_score - b.pior_score);

      const reiMaisVezes = reiRanking[0] || null;
      const reiMelhorMedia = reiRanking.reduce((best, current) =>
        current.media_score > (best?.media_score || 0) ? current : best
      , null as PlayerStats | null);

      const coneMaisVezes = coneRanking[0] || null;
      const conePiorMedia = coneRanking.reduce((worst, current) =>
        current.media_score < (worst?.media_score ?? Infinity) ? current : worst
      , null as PlayerStats | null);

      return {
        rei: {
          ranking: reiRanking,
          highlights: {
            maisVezes: reiMaisVezes,
            extremeScore: reiBest,
            extremeMedia: reiMelhorMedia,
          },
        },
        cone: {
          ranking: coneRanking,
          highlights: {
            maisVezes: coneMaisVezes,
            extremeScore: coneWorst,
            extremeMedia: conePiorMedia,
          },
        },
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center gap-2 mb-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="gaming-card">
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="gaming-card">
          <CardContent className="p-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const isRei = viewMode === 'rei';
  const currentData = isRei ? rankingData?.rei : rankingData?.cone;
  const { ranking, highlights } = currentData || { ranking: [], highlights: {} as HighlightData };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex justify-center gap-2 p-1 bg-muted/50 rounded-lg w-fit mx-auto">
        <Button
          variant={viewMode === 'rei' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('rei')}
          className="gap-2"
        >
          <Crown className="w-4 h-4" />
          Reis do PVP
        </Button>
        <Button
          variant={viewMode === 'cone' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('cone')}
          className="gap-2"
        >
          <Skull className="w-4 h-4" />
          Cones Monodedo
        </Button>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <EventTypeFilter value={eventType} onChange={setEventType} />
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40 h-9 text-sm"
            placeholder="Data início"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40 h-9 text-sm"
            placeholder="Data fim"
          />
        </div>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="gap-1 text-muted-foreground"
          >
            <X className="w-3 h-3" />
            Limpar
          </Button>
        )}
      </div>

      {/* Highlights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mais Vezes */}
        <Card className={`gaming-card ${isRei 
          ? 'bg-gradient-to-br from-yellow-500/20 to-amber-600/20 border-yellow-500/50' 
          : 'bg-gradient-to-br from-gray-500/20 to-slate-600/20 border-gray-500/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 ${isRei ? 'text-yellow-400' : 'text-gray-400'}`}>
              {isRei ? <Crown className="w-5 h-5" /> : <Skull className="w-5 h-5" />}
              {isRei ? 'Mais Vitórias' : 'Mais Derrotas'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className={`text-3xl font-bold ${isRei ? 'text-yellow-300' : 'text-gray-300'}`}>
                {highlights.maisVezes?.player_name || '-'}
              </p>
              <p className={`text-lg mt-1 ${isRei ? 'text-yellow-400/80' : 'text-gray-400/80'}`}>
                {highlights.maisVezes?.vezes || 0}x {isRei ? 'Rei' : 'Cone'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isRei ? 'Melhor' : 'Pior'} score: {isRei 
                  ? highlights.maisVezes?.melhor_score?.toFixed(2) 
                  : highlights.maisVezes?.pior_score?.toFixed(2) || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Extreme Score */}
        <Card className={`gaming-card ${isRei 
          ? 'bg-gradient-to-br from-red-500/20 to-orange-600/20 border-red-500/50' 
          : 'bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border-blue-500/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 ${isRei ? 'text-red-400' : 'text-blue-400'}`}>
              <Target className="w-5 h-5" />
              {isRei ? 'Maior Score' : 'Menor Score'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className={`text-3xl font-bold ${isRei ? 'text-red-300' : 'text-blue-300'}`}>
                {highlights.extremeScore?.player_name || '-'}
              </p>
              <p className={`text-lg mt-1 ${isRei ? 'text-red-400/80' : 'text-blue-400/80'}`}>
                Score: {highlights.extremeScore?.score?.toFixed(2) || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {highlights.extremeScore?.date 
                  ? new Date(highlights.extremeScore.date + 'T12:00:00').toLocaleDateString('pt-BR') 
                  : '-'} às {highlights.extremeScore?.hour || 0}h
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Extreme Média */}
        <Card className={`gaming-card ${isRei 
          ? 'bg-gradient-to-br from-purple-500/20 to-violet-600/20 border-purple-500/50' 
          : 'bg-gradient-to-br from-rose-500/20 to-pink-600/20 border-rose-500/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 ${isRei ? 'text-purple-400' : 'text-rose-400'}`}>
              {isRei ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {isRei ? 'Melhor Média' : 'Pior Média'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className={`text-3xl font-bold ${isRei ? 'text-purple-300' : 'text-rose-300'}`}>
                {highlights.extremeMedia?.player_name || '-'}
              </p>
              <p className={`text-lg mt-1 ${isRei ? 'text-purple-400/80' : 'text-rose-400/80'}`}>
                Média: {highlights.extremeMedia?.media_score?.toFixed(2) || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {highlights.extremeMedia?.vezes || 0}x {isRei ? 'Rei' : 'Cone'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking Table */}
      <Card className="gaming-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isRei ? <Trophy className="w-6 h-6 text-primary" /> : <Skull className="w-6 h-6 text-muted-foreground" />}
            {isRei ? 'Ranking de Reis do PVP' : 'Ranking de Cones Monodedo'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Jogador</TableHead>
                <TableHead className="text-center">{isRei ? 'Vitórias' : 'Derrotas'}</TableHead>
                <TableHead className="text-center">{isRei ? 'Melhor Score' : 'Pior Score'}</TableHead>
                <TableHead className="text-center">Média Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((player, index) => (
                <TableRow key={player.player_name} className={index < 3 ? (isRei ? 'bg-primary/5' : 'bg-muted/20') : ''}>
                  <TableCell className="font-bold">
                    {index === 0 && <span>{isRei ? '🥇' : '💩'}</span>}
                    {index === 1 && <span>{isRei ? '🥈' : '🤡'}</span>}
                    {index === 2 && <span>{isRei ? '🥉' : '😭'}</span>}
                    {index > 2 && `#${index + 1}`}
                  </TableCell>
                  <TableCell className="font-semibold">{player.player_name}</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${isRei ? 'text-primary' : 'text-muted-foreground'}`}>
                      {player.vezes}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {isRei ? player.melhor_score.toFixed(2) : player.pior_score.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">{player.media_score.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {ranking.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum dado encontrado.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
