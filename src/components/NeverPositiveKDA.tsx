import { useState, useRef, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, Download, Image as ImageIcon, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { EventTypeFilter } from './EventTypeFilter';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface NeverPositivePlayer {
  playerName: string;
  matchesPlayed: number;
  bestKda: number;
  totalKills: number;
  totalDeaths: number;
  guild?: string;
  class?: string;
  negativeCount: number;
  bestScore: number;
}

export const NeverPositiveKDA = () => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [eventType, setEventType] = useState<string>('boss_event');
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const [viewMode, setViewMode] = useState<'never-positive' | 'negative-count'>('never-positive');
  const tableRef = useRef<HTMLDivElement>(null);

  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined, hFrom: number | undefined, hTo: number | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
      setDebouncedHourFrom(hFrom);
      setDebouncedHourTo(hTo);
    }, 500),
    []
  );

  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo, hourFrom, hourTo);
  }, [dateFrom, dateTo, hourFrom, hourTo, debouncedSetFilters]);

  const { data: allPlayers = [], isLoading: loading } = useQuery({
    queryKey: ['never-positive-kda', debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo, eventType],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_ranking_nunca_positivo', {
        p_date_from: debouncedDateFrom ? format(debouncedDateFrom, 'yyyy-MM-dd') : null,
        p_date_to: debouncedDateTo ? format(debouncedDateTo, 'yyyy-MM-dd') : null,
        p_hour_from: debouncedHourFrom ?? null,
        p_hour_to: debouncedHourTo ?? null,
        p_event_type: eventType,
      });
      if (error) throw error;
      const result: NeverPositivePlayer[] = (data || []).map((r: any) => ({
        playerName: r.player_name,
        matchesPlayed: Number(r.matches_played),
        bestKda: Number(r.best_kda),
        totalKills: Number(r.total_kills),
        totalDeaths: Number(r.total_deaths),
        guild: r.player_guild || undefined,
        class: r.player_class || undefined,
        negativeCount: Number(r.negative_count),
        bestScore: Number(r.best_score),
      }));
      return result;
    },
  });

  // Filter for "never positive" tab: players whose best KDA across ALL matches is < 1
  const neverPositivePlayers = useMemo(() => {
    return allPlayers
      .filter(p => p.bestKda > 0 && p.bestKda <= 0.99)
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
  }, [allPlayers]);

  // Sort by negative count for the "negative count" tab
  const negativeCountPlayers = useMemo(() => {
    return [...allPlayers].sort((a, b) => b.negativeCount - a.negativeCount);
  }, [allPlayers]);

  const currentPlayers = viewMode === 'never-positive' ? neverPositivePlayers : negativeCountPlayers;

  const exportToExcel = () => {
    const data = currentPlayers.map((p, index) => ({
      'Posição': index + 1,
      'Jogador': p.playerName,
      'Classe': p.class || 'Sem Classe',
      'Guild': p.guild || 'Sem Guild',
      'Partidas': p.matchesPlayed,
      'Vezes Negativo': p.negativeCount,
      'Melhor KDA': p.bestKda,
      'Melhor Pontuação': p.bestScore,
      'Total Kills': p.totalKills,
      'Total Deaths': p.totalDeaths,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Nunca Positivo');
    XLSX.writeFile(workbook, 'nunca-positivo-kda.xlsx');
    toast.success('Arquivo Excel exportado com sucesso!');
  };

  const exportToImage = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current);
      const link = document.createElement('a');
      link.download = 'nunca-positivo-kda.png';
      link.href = canvas.toDataURL();
      link.click();
      toast.success('Imagem exportada com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
      toast.error('Erro ao exportar imagem');
    }
  };

  const getPersistenceLevel = (count: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } => {
    if (count >= 10) return { label: 'Imbatível no Negativo', variant: 'destructive' };
    if (count >= 5) return { label: 'Persistente', variant: 'destructive' };
    if (count >= 3) return { label: 'Dedicado', variant: 'secondary' };
    return { label: 'Iniciante', variant: 'default' };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Carregando dados...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={tableRef}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-destructive" />
            <div>
              <CardTitle className="text-3xl">KDA Negativo</CardTitle>
              <CardDescription className="text-base mt-1">
                Jogadores com KDA negativo (abaixo de 1.0) em Boss Events
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToExcel} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Excel
            </Button>
            <Button onClick={exportToImage} variant="outline" size="sm">
              <ImageIcon className="w-4 h-4 mr-2" />
              Imagem
            </Button>
          </div>
        </div>

        {/* Date and Hour Filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          <EventTypeFilter value={eventType} onChange={setEventType} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: ptBR }) : 'Data Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: ptBR }) : 'Data Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
            </PopoverContent>
          </Popover>

          <Select value={hourFrom?.toString() || "all"} onValueChange={(v) => setHourFrom(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hora Início" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>{i}:00</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={hourTo?.toString() || "all"} onValueChange={(v) => setHourTo(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hora Fim" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>{i}:00</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setHourFrom(undefined); setHourTo(undefined); }}>
              Limpar Filtros
            </Button>
          )}
        </div>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'never-positive' | 'negative-count')} className="mt-4">
          <TabsList>
            <TabsTrigger value="never-positive">Nunca Positivo</TabsTrigger>
            <TabsTrigger value="negative-count">Vezes Negativo</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {currentPlayers.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {viewMode === 'never-positive' 
              ? 'Nenhum jogador encontrado que nunca teve KDA positivo. Parabéns a todos! 🎉'
              : 'Nenhum jogador com KDA negativo encontrado.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Rank</TableHead>
                <TableHead>Jogador</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Guild</TableHead>
                <TableHead className="text-right">Partidas</TableHead>
                <TableHead className="text-right">Vezes Negativo</TableHead>
                <TableHead className="text-right">
                  {viewMode === 'never-positive' ? 'Melhor KDA' : 'Melhor Pontuação'}
                </TableHead>
                <TableHead className="text-right">Total Kills</TableHead>
                <TableHead className="text-right">Total Deaths</TableHead>
                <TableHead className="text-center">Nível</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentPlayers.map((player, index) => {
                const level = getPersistenceLevel(viewMode === 'never-positive' ? player.matchesPlayed : player.negativeCount);
                return (
                  <TableRow key={player.playerName}>
                    <TableCell className="font-bold text-lg">
                      {index === 0 && '📉'}
                      {index === 1 && '👎'}
                      {index === 2 && '🥀'}
                      {index > 2 && `#${index + 1}`}
                    </TableCell>
                    <TableCell className="font-semibold">{player.playerName}</TableCell>
                    <TableCell className="text-muted-foreground">{player.class || 'Sem Classe'}</TableCell>
                    <TableCell className="text-muted-foreground">{player.guild || 'Sem Guild'}</TableCell>
                    <TableCell className="text-right font-bold">{player.matchesPlayed}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{player.negativeCount}</TableCell>
                    <TableCell className="text-right font-bold">
                      {viewMode === 'never-positive' ? player.bestKda : player.bestScore}
                    </TableCell>
                    <TableCell className="text-right">{player.totalKills}</TableCell>
                    <TableCell className="text-right">{player.totalDeaths}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={level.variant}>{level.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
