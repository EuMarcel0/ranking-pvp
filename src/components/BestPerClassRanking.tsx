import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from './ui/table';
import { Award, Calendar, X, Crosshair, Skull } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { EventTypeFilter } from './EventTypeFilter';

interface PlayerClassStats {
  player_name: string;
  className: string;
  totalKills: number;
  totalDeaths: number;
  totalKda: number;
  matchCount: number;
  eventScore: number;
}

type ViewMode = 'best' | 'worst';

export const BestPerClassRanking = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('best');
  const [eventType, setEventType] = useState<string>('boss_event');
  const { data: bestPerClass, isLoading } = useQuery({
    queryKey: ['best-per-class', startDate, endDate, eventType],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_ranking_best_per_class', {
        p_date_from: startDate || null,
        p_date_to: endDate || null,
        p_event_type: eventType,
      });
      if (error) throw error;
      const best: PlayerClassStats[] = [];
      const worst: PlayerClassStats[] = [];
      (data || []).forEach((r: any) => {
        const entry: PlayerClassStats = {
          player_name: r.player_name,
          className: r.class_name,
          totalKills: Number(r.total_kills),
          totalDeaths: Number(r.total_deaths),
          totalKda: Number(r.total_kda),
          matchCount: Number(r.match_count),
          eventScore: Number(r.event_score),
        };
        if (r.is_best) best.push(entry); else worst.push(entry);
      });
      return {
        best: best.sort((a, b) => b.eventScore - a.eventScore),
        worst: worst.sort((a, b) => a.eventScore - b.eventScore),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Crosshair className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayData = viewMode === 'best' ? bestPerClass?.best : bestPerClass?.worst;

  return (
    <div className="space-y-6">
      {/* View mode toggle */}
      <div className="flex justify-center gap-2">
        <Button
          variant={viewMode === 'best' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('best')}
          className="gap-2"
        >
          <Award className="w-4 h-4" />
          Melhor por Classe
        </Button>
        <Button
          variant={viewMode === 'worst' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('worst')}
          className="gap-2"
        >
          <Skull className="w-4 h-4" />
          Pior por Classe
        </Button>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <EventTypeFilter value={eventType} onChange={setEventType} />
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40 h-9 text-sm"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40 h-9 text-sm"
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

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          {viewMode === 'best' ? (
            <Award className="w-6 h-6 text-primary" />
          ) : (
            <Skull className="w-6 h-6 text-destructive" />
          )}
          <h2 className="text-2xl font-bold">
            {viewMode === 'best' ? 'Melhor' : 'Pior'} Jogador por Classe
          </h2>
        </div>

        {!displayData?.length ? (
          <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para o período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Jogador</TableHead>
                  <TableHead className="text-center">Kills</TableHead>
                  <TableHead className="text-center">Deaths</TableHead>
                  <TableHead className="text-center">KDA</TableHead>
                  <TableHead className="text-center">Partidas</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.map((entry, i) => (
                  <TableRow key={entry.className}>
                    <TableCell className={`font-bold ${viewMode === 'best' ? 'text-primary' : 'text-destructive'}`}>{i + 1}</TableCell>
                    <TableCell className="font-semibold">{entry.className}</TableCell>
                    <TableCell className="font-medium">{entry.player_name}</TableCell>
                    <TableCell className="text-center text-success">{entry.totalKills}</TableCell>
                    <TableCell className="text-center text-destructive">{entry.totalDeaths}</TableCell>
                    <TableCell className="text-center">{entry.totalKda.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{entry.matchCount}</TableCell>
                    <TableCell className={`text-center font-bold ${viewMode === 'best' ? 'text-primary' : 'text-destructive'}`}>{entry.eventScore.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};
