import { useState, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { EventTypeFilter } from '@/components/EventTypeFilter';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Swords, Search, X, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface KillLog {
  id: string;
  killer_name: string;
  victim_name: string;
  match_id: string;
  created_at: string;
}

interface PlayerStats {
  playerName: string;
  totalKills: number;
  totalDeaths: number;
  victims: Map<string, number>;
  killers: Map<string, number>;
}

export const ConfrontosDiretos = () => {
  const [filterName, setFilterName] = useState('');
  const [sortBy, setSortBy] = useState<'killer' | 'victim'>('killer');
  const [eventType, setEventType] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const [debouncedEventType, setDebouncedEventType] = useState('all');

  // Debounce filter updates
  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined, hFrom: number | undefined, hTo: number | undefined, evType: string) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
      setDebouncedHourFrom(hFrom);
      setDebouncedHourTo(hTo);
      setDebouncedEventType(evType);
    }, 500),
    []
  );

  // Update debounced values when filters change
  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo, hourFrom, hourTo, eventType);
  }, [dateFrom, dateTo, hourFrom, hourTo, eventType, debouncedSetFilters]);

  const hasDateFilter = !!(debouncedDateFrom || debouncedDateTo);

  const { data: killLogs = [], isLoading: loading } = useQuery({
    queryKey: ['confrontos-diretos', debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo, debouncedEventType],
    staleTime: 30000,
    enabled: hasDateFilter,
    queryFn: async () => {
      // Buscar lista de personagens banidos
      const { data: bannedChars } = await supabase
        .from('characters')
        .select('name')
        .eq('banned', true);
      
      const normalize = (s?: string) =>
        (s ?? '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();
      
      const bannedNames = new Set((bannedChars || []).map(c => normalize((c.name || '').trim())));

      // Filtramos pelos match_ids de pvp_matches
      const matchFilterActive = !!(debouncedDateFrom || debouncedDateTo || debouncedHourFrom !== undefined || debouncedHourTo !== undefined);
      let matchIds: string[] | undefined = undefined;

      if (matchFilterActive) {
        const pageSize = 1000;
        let from = 0;
        let matchesAccum: any[] = [];
        
        while (true) {
          let mq = supabase
            .from('pvp_matches')
            .select('id, match_date, match_hour');
          
          if (debouncedDateFrom) mq = mq.gte('match_date', format(debouncedDateFrom, 'yyyy-MM-dd'));
          if (debouncedDateTo) mq = mq.lte('match_date', format(debouncedDateTo, 'yyyy-MM-dd'));
          if (debouncedHourFrom !== undefined) mq = mq.gte('match_hour', debouncedHourFrom);
          if (debouncedHourTo !== undefined) mq = mq.lte('match_hour', debouncedHourTo);
          if (debouncedEventType && debouncedEventType !== 'all') mq = mq.eq('event_type', debouncedEventType);
          
          const { data: page, error } = await mq.range(from, from + pageSize - 1);
          if (error) throw error;
          if (page && page.length > 0) matchesAccum = matchesAccum.concat(page);
          if (!page || page.length < pageSize) break;
          from += pageSize;
        }
        
        matchIds = (matchesAccum || []).map((m: any) => m.id);
        if (!matchIds.length) {
          return [];
        }
      }

      const pageSize = 1000;
      let from = 0;
      let accumulated: KillLog[] = [];

      while (true) {
        let query = supabase
          .from('pvp_kill_logs')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (matchIds) {
          query = query.in('match_id', matchIds);
        }
        
        const { data, error } = await query.range(from, from + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          // Filtrar logs de jogadores banidos
          const filtered = data.filter(log => {
            const killerKey = normalize((log.killer_name || '').trim());
            const victimKey = normalize((log.victim_name || '').trim());
            return !bannedNames.has(killerKey) && !bannedNames.has(victimKey);
          });
          accumulated = accumulated.concat(filtered);
        }
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      return accumulated;
    }
  });

  const getPlayerStats = (): PlayerStats[] => {
    const statsMap = new Map<string, PlayerStats>();

    killLogs.forEach(log => {
      // Processar killer
      if (!statsMap.has(log.killer_name)) {
        statsMap.set(log.killer_name, {
          playerName: log.killer_name,
          totalKills: 0,
          totalDeaths: 0,
          victims: new Map(),
          killers: new Map(),
        });
      }
      const killerStats = statsMap.get(log.killer_name)!;
      killerStats.totalKills++;
      killerStats.victims.set(
        log.victim_name,
        (killerStats.victims.get(log.victim_name) || 0) + 1
      );

      // Processar victim
      if (!statsMap.has(log.victim_name)) {
        statsMap.set(log.victim_name, {
          playerName: log.victim_name,
          totalKills: 0,
          totalDeaths: 0,
          victims: new Map(),
          killers: new Map(),
        });
      }
      const victimStats = statsMap.get(log.victim_name)!;
      victimStats.totalDeaths++;
      victimStats.killers.set(
        log.killer_name,
        (victimStats.killers.get(log.killer_name) || 0) + 1
      );
    });

    return Array.from(statsMap.values()).sort((a, b) => {
      if (sortBy === 'killer') {
        return a.playerName.localeCompare(b.playerName);
      }
      return b.totalKills - a.totalKills;
    });
  };

  const getFilteredStats = () => {
    const allStats = getPlayerStats();
    
    if (!filterName.trim()) {
      return allStats;
    }

    return allStats.filter(stat =>
      stat.playerName.toLowerCase().includes(filterName.toLowerCase())
    );
  };

  const filteredStats = getFilteredStats();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords className="w-8 h-8 text-primary" />
            <div>
              <CardTitle className="text-3xl">Confrontos Diretos</CardTitle>
              <CardDescription className="text-base mt-1">
                Detalhes de quem matou quem nas disputas
              </CardDescription>
            </div>
          </div>
        </div>
        <div className="space-y-4 mt-4">
          {/* Filtros de Data e Hora */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Data inicial"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Data final"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Select
              value={hourFrom?.toString() || "all"}
              onValueChange={(value) => setHourFrom(value === "all" ? undefined : parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Hora inicial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i.toString().padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={hourTo?.toString() || "all"}
              onValueChange={(value) => setHourTo(value === "all" ? undefined : parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Hora final" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i.toString().padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <EventTypeFilter value={eventType} onChange={setEventType} />
          </div>

          {/* Botão para limpar filtros */}
          {(dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined || eventType !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom(undefined);
                setDateTo(undefined);
                setHourFrom(undefined);
                setHourTo(undefined);
                setEventType('all');
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Limpar filtros
            </Button>
          )}

          {/* Filtro de nome e ordenação */}
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Filtrar por nome do jogador..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className="pl-10 pr-10"
              />
              {filterName && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setFilterName('')}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant={sortBy === 'killer' ? 'default' : 'outline'}
                onClick={() => setSortBy('killer')}
              >
                Ordenar por Nome
              </Button>
              <Button
                variant={sortBy === 'victim' ? 'default' : 'outline'}
                onClick={() => setSortBy('victim')}
              >
                Ordenar por Kills
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasDateFilter ? (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-semibold mb-2">Selecione um período</p>
            <p className="text-sm">Aplique um filtro de data acima para carregar os confrontos diretos.</p>
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando dados...</div>
        ) : killLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum confronto encontrado para o período selecionado.
          </div>
        ) : filterName && filteredStats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum jogador encontrado com o nome "{filterName}"
          </div>
        ) : (
          <div className="space-y-6">
            {filteredStats.map((stat) => (
              <div key={stat.playerName} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">{stat.playerName}</h3>
                  <div className="flex gap-4 text-sm">
                    <span className="text-success font-semibold">
                      {stat.totalKills} Kills
                    </span>
                    <span className="text-destructive font-semibold">
                      {stat.totalDeaths} Mortes
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2 text-sm text-muted-foreground">Matou:</h4>
                    {stat.victims.size > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jogador</TableHead>
                            <TableHead className="text-right">Vezes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(stat.victims.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([victim, count]) => (
                              <TableRow key={victim}>
                                <TableCell>{victim}</TableCell>
                                <TableCell className="text-right font-semibold">{count}x</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum kill registrado</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 text-sm text-muted-foreground">Morreu para:</h4>
                    {stat.killers.size > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jogador</TableHead>
                            <TableHead className="text-right">Vezes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(stat.killers.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([killer, count]) => (
                              <TableRow key={killer}>
                                <TableCell>{killer}</TableCell>
                                <TableCell className="text-right font-semibold">{count}x</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma morte registrada</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
