import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { debounce } from 'lodash';
import { useSearchParams } from 'react-router-dom';
import { Trophy, Skull, Crosshair, TrendingUp, Calendar as CalendarIcon, Download, FileImage, Send } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface AggregatedPlayer {
  name: string;
  class: string | null;
  class_short: string | null;
  guild: string | null;
  kills: number;
  deaths: number;
  kda: number;
  weightedKda: number;
  matches: number;
  mvpScore: number;
  eventScore: number;
}

type SortKey = 'kills' | 'deaths' | 'kda' | 'weightedKda' | 'eventScore';

export const RankingGeral = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sortBy, setSortBy] = useState<SortKey>('eventScore');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const [classFilter, setClassFilter] = useState<string>('all');
  const [guildFilter, setGuildFilter] = useState<string>('all');
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');
  const tableRef = useRef<HTMLDivElement>(null);
  const specialCardsRef = useRef<HTMLDivElement>(null);
  const urlFiltersAppliedRef = useRef(false);

  // Apply URL parameters as initial filters (from Discord links) - runs once
  useEffect(() => {
    if (urlFiltersAppliedRef.current) return;
    
    const dateParam = searchParams.get('date');
    const hourParam = searchParams.get('hour');
    
    if (dateParam || hourParam) {
      if (dateParam) {
        const parsedDate = new Date(dateParam + 'T00:00:00');
        if (!isNaN(parsedDate.getTime())) {
          setDateFrom(parsedDate);
          setDateTo(parsedDate);
          setDebouncedDateFrom(parsedDate);
          setDebouncedDateTo(parsedDate);
        }
      }
      
      if (hourParam) {
        const parsedHour = parseInt(hourParam, 10);
        if (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
          setHourFrom(parsedHour);
          setHourTo(parsedHour);
          setDebouncedHourFrom(parsedHour);
          setDebouncedHourTo(parsedHour);
        }
      }
      
      urlFiltersAppliedRef.current = true;
    }
  }, [searchParams]);

  // Debounce filter updates
  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined, hFrom: number | undefined, hTo: number | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
      setDebouncedHourFrom(hFrom);
      setDebouncedHourTo(hTo);
    }, 500),
    []
  );

  // Update debounced values when filters change
  useEffect(() => {
    debouncedSetFilters(dateFrom, dateTo, hourFrom, hourTo);
  }, [dateFrom, dateTo, hourFrom, hourTo, debouncedSetFilters]);

  // Strings estáveis para evitar refetch infinito quando "Até" fica vazio.
  // Se "Até" estiver vazio, usa hoje como limite final do período.
  const effectiveDateFromParam = useMemo(
    () => (debouncedDateFrom ? format(debouncedDateFrom, 'yyyy-MM-dd') : null),
    [debouncedDateFrom]
  );
  const effectiveDateToParam = useMemo(
    () => (debouncedDateTo ? format(debouncedDateTo, 'yyyy-MM-dd') : debouncedDateFrom ? format(new Date(), 'yyyy-MM-dd') : null),
    [debouncedDateFrom, debouncedDateTo]
  );

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('characters')
        .select('class')
        .not('class', 'is', null);
      
      if (error) throw error;
      
      const uniqueClasses = [...new Set(data?.map(c => (c.class || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
      return uniqueClasses.sort();
    }
  });

  const { data: guilds } = useQuery({
    queryKey: ['guilds-ranking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('characters')
        .select('guild')
        .not('guild', 'is', null);
      
      if (error) throw error;
      
      const uniqueGuilds = [...new Set(data?.map(c => (c.guild || '').trim()).filter(Boolean))];
      return uniqueGuilds.sort();
    }
  });

  // Normalização de classe e opções deduplicadas por chave canônica
  const normalizeClassKey = (s?: string) =>
    (s ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(.)\1+/g, '$1'); // comprime letras repetidas (ex: wizzard -> wizard)

  const classOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    (classes || []).forEach((cls) => {
      const key = normalizeClassKey(cls);
      if (!map.has(key)) {
        map.set(key, { key, label: (cls || '').replace(/\s+/g, ' ').trim() });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [classes]);

  const { data: aggregatedData, isLoading } = useQuery({
    queryKey: ['ranking-geral', effectiveDateFromParam, effectiveDateToParam, debouncedHourFrom, debouncedHourTo],
    staleTime: 30000,
    queryFn: async () => {
      // Chamar a função RPC que faz toda a agregação no banco
      const { data: rpcData, error } = await supabase.rpc('get_ranking_geral', {
        p_date_from: effectiveDateFromParam,
        p_date_to: effectiveDateToParam,
        p_hour_from: debouncedHourFrom ?? null,
        p_hour_to: debouncedHourTo ?? null,
      });

      if (error) throw error;

      if (!rpcData || rpcData.length === 0) {
        return { aggregated: [], brabissimoRecord: undefined, coneMonodedoName: '', characters: [] };
      }

      // Mapear resultado da RPC para o formato AggregatedPlayer
      const aggregated: AggregatedPlayer[] = (rpcData as any[]).map((row: any) => ({
        name: row.player_name,
        class: row.player_class || null,
        class_short: row.player_class_short || null,
        guild: row.player_guild || null,
        kills: Number(row.total_kills),
        deaths: Number(row.total_deaths),
        kda: Number(row.kda),
        weightedKda: Number(row.weighted_kda),
        matches: Number(row.matches_played),
        mvpScore: Number(row.event_score),
        eventScore: Number(row.event_score),
      }));

      // Cone Monodedo = jogador com menor pontuação
      let coneMonodedoName = '';
      if (aggregated.length > 0) {
        const worstPlayer = [...aggregated].sort((a, b) => a.eventScore - b.eventScore)[0];
        coneMonodedoName = worstPlayer.name;
      }

      // Brabíssimo = maior nº de kills em uma única partida (exclui cone monodedo)
      let brabissimoRecord: { name: string; kills: number } | undefined = undefined;
      for (const row of rpcData as any[]) {
        const maxKills = Number(row.single_match_max_kills);
        if (maxKills > 0 && row.player_name !== coneMonodedoName) {
          if (!brabissimoRecord || maxKills > brabissimoRecord.kills) {
            brabissimoRecord = { name: row.player_name, kills: maxKills };
          }
        }
      }

      return { aggregated, brabissimoRecord, coneMonodedoName, characters: [] };
    }
  });

  const sortedPlayers = useMemo(() => {
    if (!aggregatedData?.aggregated) return [];
    
    // Normalizador local para nomes (consistente com o usado no fetch)
    const normalizeNameKey = (s?: string) =>
      (s ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const base = aggregatedData.aggregated;
    let filtered = base;

    if (classFilter !== 'all') {
      filtered = filtered.filter(p => 
        normalizeClassKey(p.class || '') === classFilter && 
        (p.kills > 0 || p.deaths > 0)
      );
    }

    if (guildFilter !== 'all') {
      filtered = filtered.filter(p => 
        (p.guild || '').trim() === guildFilter &&
        (p.kills > 0 || p.deaths > 0)
      );
    }
    
    return [...filtered].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [aggregatedData, sortBy, classFilter, guildFilter, effectiveDateFromParam, effectiveDateToParam, debouncedHourFrom, debouncedHourTo]);

  const topPlayer = sortedPlayers[0];

  const reiDoPVP = useMemo(() => {
    // Rei do PVP usa MVP score: (kills*3) + (kda*1) + (participação*1) - (deaths*3)
    // Exclui o cone monodedo do cálculo
    const coneMonodedoName = aggregatedData?.coneMonodedoName;
    const eligiblePlayers = sortedPlayers.filter(p => p.name !== coneMonodedoName);
    return [...eligiblePlayers].sort((a, b) => b.mvpScore - a.mvpScore)[0];
  }, [sortedPlayers, aggregatedData]);

  const brabissimo = useMemo(() => {
    // Brabissimo é o player que mais matou em uma única partida
    if (!aggregatedData?.brabissimoRecord) return undefined;
    const playerData = sortedPlayers.find(p => p.name === aggregatedData.brabissimoRecord.name);
    return playerData ? { ...playerData, singleMatchKills: aggregatedData.brabissimoRecord.kills } : undefined;
  }, [aggregatedData, sortedPlayers]);

  const coneMonodedo = useMemo(() => {
    const coneMonodedoName = aggregatedData?.coneMonodedoName;
    return sortedPlayers.find(p => p.name === coneMonodedoName);
  }, [sortedPlayers, aggregatedData]);

  const melhorPonderado = useMemo(() => {
    return [...sortedPlayers].sort((a, b) => b.weightedKda - a.weightedKda)[0];
  }, [sortedPlayers]);

  // Agente Duplo: jogador que mais matou amigos (fogo amigo)
  const { data: agenteDuploData } = useQuery({
    queryKey: ['agente-duplo', effectiveDateFromParam, effectiveDateToParam, debouncedHourFrom, debouncedHourTo],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ranking_fogo_amigo', {
        p_date_from: effectiveDateFromParam,
        p_date_to: effectiveDateToParam,
        p_hour_from: debouncedHourFrom ?? null,
        p_hour_to: debouncedHourTo ?? null,
        p_event_type: 'boss_event',
      });
      if (error) throw error;
      const list = (data as any[]) || [];
      const sorted = [...list].sort((a, b) => Number(b.friendly_kills) - Number(a.friendly_kills));
      return sorted[0] ? {
        name: sorted[0].player_name as string,
        guild: (sorted[0].player_guild as string) || '',
        friendlyKills: Number(sorted[0].friendly_kills),
        friendlyDeaths: Number(sorted[0].friendly_deaths),
      } : null;
    },
  });

  // Putinha da Noite: par dominador → vítima com mais mortes no período
  const { data: putinhaNoiteData } = useQuery({
    queryKey: ['putinha-noite', effectiveDateFromParam, effectiveDateToParam, debouncedHourFrom, debouncedHourTo],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ranking_putinha', {
        p_date_from: effectiveDateFromParam,
        p_date_to: effectiveDateToParam,
        p_hour_from: debouncedHourFrom ?? null,
        p_hour_to: debouncedHourTo ?? null,
        p_event_type: 'boss_event',
      });
      if (error) throw error;
      const top = (data as any[])?.[0];
      return top ? { dominador: top.killer_name, putinha: top.victim_name, kills: Number(top.deaths) } : null;
    },
  });

  const exportToExcel = () => {
    const worksheetData = [
      ['Ranking Geral - PVP'],
      [''],
      ['Rank', 'Jogador', 'Classe', 'Guild', 'Kills', 'Deaths', 'KDA', 'Pontuação', 'Boss'],
      ...sortedPlayers.map((player, index) => [
        index + 1,
        player.name,
        player.class || '-',
        player.guild || '-',
        player.kills,
        player.deaths,
        player.kda.toFixed(2),
        player.eventScore.toFixed(2),
        player.matches
      ]),
      [''],
      ['Totais'],
      ['Total Kills', sortedPlayers.reduce((sum, p) => sum + p.kills, 0)],
      ['Total Deaths', sortedPlayers.reduce((sum, p) => sum + p.deaths, 0)],
      ['Total Jogadores', sortedPlayers.length]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ranking Geral');
    
    const fileName = `ranking-geral-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportToImage = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 2,
        logging: false
      });

      const link = document.createElement('a');
      link.download = `ranking-geral-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
    }
  };

  const publishToDiscord = async () => {
    setIsPublishing(true);
    try {
      const payload = {
        environment,
        eventType: 'boss_event',
        filters: {
          class: classFilter,
          dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
          dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
          hourFrom,
          hourTo,
          sortBy
        },
        specialRankings: {
          reiDoPVP: {
            name: reiDoPVP?.name || '',
            kills: reiDoPVP?.kills || 0,
            deaths: reiDoPVP?.deaths || 0,
            matches: reiDoPVP?.matches || 0
          },
          brabissimo: {
            name: brabissimo?.name || '',
            singleMatchKills: brabissimo?.singleMatchKills || 0,
            matches: brabissimo?.matches || 0
          },
          coneMonodedo: {
            name: coneMonodedo?.name || '',
            deaths: coneMonodedo?.deaths || 0,
            matches: coneMonodedo?.matches || 0
          },
          agenteDuplo: {
            name: agenteDuploData?.name || '',
            friendlyKills: agenteDuploData?.friendlyKills || 0,
            guild: agenteDuploData?.guild || ''
          },
          putinhaNoite: {
            dominador: putinhaNoiteData?.dominador || '',
            putinha: putinhaNoiteData?.putinha || '',
            kills: putinhaNoiteData?.kills || 0
          }
        },
        totals: {
          kills: sortedPlayers.reduce((sum, p) => sum + p.kills, 0),
          deaths: sortedPlayers.reduce((sum, p) => sum + p.deaths, 0),
          playerCount: sortedPlayers.length
        },
        guildSummary: (() => {
          const guildCounts = sortedPlayers.reduce((acc, player) => {
            const guild = player.guild || 'Sem Guild';
            acc[guild] = (acc[guild] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          return guildCounts;
        })(),
        guildRanking: (() => {
          // Calculate full guild stats with kills, deaths, and score
          const guildStats: Record<string, { playerCount: number; kills: number; deaths: number }> = {};
          for (const player of sortedPlayers) {
            const guild = player.guild || 'Sem Guild';
            if (!guildStats[guild]) {
              guildStats[guild] = { playerCount: 0, kills: 0, deaths: 0 };
            }
            guildStats[guild].playerCount++;
            guildStats[guild].kills += player.kills;
            guildStats[guild].deaths += player.deaths;
          }
          
          // Calculate scores and create sorted array
          return Object.entries(guildStats)
            .map(([guild, stats]) => {
              const guildKDA = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
              const score = (stats.kills * 3) + (guildKDA * 1) + (stats.playerCount * 1) - (stats.deaths * 3);
              return { guild, ...stats, score };
            })
            .sort((a, b) => b.score - a.score);
        })(),
        playerRanking: sortedPlayers.map(p => ({
          name: p.name,
          kills: p.kills,
          deaths: p.deaths,
          kda: p.kda,
          eventScore: p.eventScore,
          class_short: p.class_short || ''
        })),
        killLogs: []
      };

      const { data, error } = await supabase.functions.invoke('discord-webhook', {
        body: payload
      });

      if (error) throw error;

      toast({
        title: 'Sucesso!',
        description: `Ranking publicado no Discord.`,
      });
      
      setShowDiscordModal(false);
    } catch (error: any) {
      console.error('Erro ao publicar no Discord:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao publicar no Discord',
        variant: 'destructive'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const SortButton = ({ label, sortKey, icon: Icon }: { label: string; sortKey: SortKey; icon: any }) => (
    <button
      onClick={() => setSortBy(sortKey)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300",
        sortBy === sortKey
          ? "bg-primary text-primary-foreground glow-primary"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  const hasNoData = !isLoading && (!sortedPlayers || sortedPlayers.length === 0);

  return (
    <div className="space-y-6">
      {/* Filtros de Data e Hora */}
      <div className="bg-card/50 p-6 rounded-xl border border-border space-y-4">
        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Classe:</span>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas as classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {classOptions?.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Guild:</span>
            <Select value={guildFilter} onValueChange={setGuildFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas as guilds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {guilds?.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">De:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Até:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Hora Inicial:</span>
            <select
              value={hourFrom ?? ''}
              onChange={(e) => setHourFrom(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {[20, 21, 22].map((hour) => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Hora Final:</span>
            <select
              value={hourTo ?? ''}
              onChange={(e) => setHourTo(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {[20, 21, 22].map((hour) => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setDateFrom(undefined);
              setDateTo(undefined);
              setHourFrom(undefined);
              setHourTo(undefined);
              setClassFilter('all');
              setGuildFilter('all');
            }}
            className="text-sm"
          >
            Limpar Filtros
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Carregando dados...</p>
        </div>
      ) : hasNoData ? (
        <div className="text-center py-12 text-muted-foreground">
          <Crosshair className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Nenhum dado encontrado para o período selecionado.</p>
          <p className="text-sm mt-2">Ajuste os filtros acima para ver outros resultados.</p>
        </div>
      ) : (
      <>
      {/* Classificações Especiais */}
      <div ref={specialCardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-success/10 border-2 border-success rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Trophy className="w-10 h-10 text-success mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-success mb-2">👑 Rei do PVP</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{reiDoPVP?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-success font-bold">{reiDoPVP?.kills}</span> kills • <span className="text-destructive font-bold">{reiDoPVP?.deaths}</span> deaths
          </p>
          <p className="text-xs text-muted-foreground mt-1">{reiDoPVP?.matches} boss(es)</p>
        </div>

        <div className="bg-warning/10 border-2 border-warning rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-warning mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-warning mb-2">⚡ Brabissimo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{brabissimo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-warning font-bold">{brabissimo?.singleMatchKills}</span> kills em 1 partida
          </p>
          <p className="text-xs text-muted-foreground mt-1">{brabissimo?.matches} boss(es)</p>
        </div>

        <div data-hide-on-export="kda-medio-card" className="bg-accent/10 border-2 border-accent rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-accent mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-accent mb-2">📊 KDA/Médio</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{melhorPonderado?.name}</p>
          <p className="text-sm text-muted-foreground">
            KDA/Médio: <span className="text-accent font-bold">{melhorPonderado?.weightedKda.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{melhorPonderado?.matches} boss(es)</p>
        </div>

        <div className="bg-destructive/10 border-2 border-destructive rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Skull className="w-10 h-10 text-destructive mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-destructive mb-2">🍦 Cone monodedo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{coneMonodedo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive font-bold">{coneMonodedo?.deaths}</span> deaths
          </p>
          <p className="text-xs text-muted-foreground mt-1">{coneMonodedo?.matches} boss(es)</p>
        </div>

        <div className="bg-orange-500/10 border-2 border-orange-500 rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Skull className="w-10 h-10 text-orange-500 mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-orange-500 mb-2">🕵️ Agente Duplo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{agenteDuploData?.name || '—'}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-orange-500 font-bold">{agenteDuploData?.friendlyKills ?? 0}</span> kills em aliados
          </p>
          <p className="text-xs text-muted-foreground mt-1">{agenteDuploData?.guild || '—'}</p>
        </div>

        <div className="bg-pink-500/10 border-2 border-pink-500 rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Skull className="w-10 h-10 text-pink-500 mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-pink-500 mb-2">💔 Putinha da Noite</h3>
          <p className="text-base font-bold text-foreground text-glow mb-1">
            {putinhaNoiteData?.dominador || '—'} → {putinhaNoiteData?.putinha || '—'}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="text-pink-500 font-bold">{putinhaNoiteData?.kills ?? 0}</span> mortes
          </p>
        </div>
      </div>

      {/* Botões de ordenação e exportação */}
      <div className="flex flex-wrap gap-3 justify-center items-center">
        <SortButton label="Kills" sortKey="kills" icon={Crosshair} />
        <SortButton label="Deaths" sortKey="deaths" icon={Skull} />
        <SortButton label="KDA" sortKey="kda" icon={TrendingUp} />
        <SortButton label="Pontuação" sortKey="eventScore" icon={Trophy} />
        <SortButton label="KDA/Médio" sortKey="weightedKda" icon={TrendingUp} />
        
        <div className="w-px h-8 bg-border mx-2" />
        
        <Button
          onClick={exportToExcel}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Excel
        </Button>
        
        <Button
          onClick={exportToImage}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <FileImage className="w-4 h-4" />
          JPG
        </Button>

        {user && (
          <>
            <div className="w-px h-8 bg-border mx-2" />

            <Button
              onClick={() => setShowDiscordModal(true)}
              variant="default"
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Publicar no Discord
            </Button>
          </>
        )}
      </div>

      {/* Modal de Confirmação do Discord */}
      <Dialog open={showDiscordModal} onOpenChange={setShowDiscordModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar Ranking no Discord</DialogTitle>
            <DialogDescription>
              Confirme a publicação do ranking completo no canal do Discord.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold">Resumo:</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• <strong>{sortedPlayers.length}</strong> jogadores serão enviados</li>
                <li>• Ordenação: <strong>{
                  sortBy === 'kills' ? 'Kills' :
                  sortBy === 'deaths' ? 'Deaths' :
                  sortBy === 'kda' ? 'KDA' :
                  sortBy === 'eventScore' ? 'Pontuação' :
                  'KDA/Médio'
                }</strong></li>
                {classFilter !== 'all' && <li>• Classe: <strong>{classFilter}</strong></li>}
                {(dateFrom || dateTo) && (
                  <li>• Período: {dateFrom && format(dateFrom, 'dd/MM/yyyy', { locale: ptBR })} 
                    {dateFrom && dateTo && ' - '} 
                    {dateTo && format(dateTo, 'dd/MM/yyyy', { locale: ptBR })}</li>
                )}
                {(hourFrom !== undefined || hourTo !== undefined) && (
                  <li>• Horário: {hourFrom !== undefined ? `${hourFrom}:00` : 'Início'} - {hourTo !== undefined ? `${hourTo}:00` : 'Fim'}</li>
                )}
              </ul>
            </div>

            <div className="bg-primary/10 p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold">Destaques:</p>
              <ul className="text-sm space-y-1">
                <li>👑 <strong>Rei do PVP:</strong> {reiDoPVP?.name} ({reiDoPVP?.kills} kills, {reiDoPVP?.deaths} deaths)</li>
                <li>⚡ <strong>Brabissimo:</strong> {brabissimo?.name} (KDA: {brabissimo?.kda.toFixed(2)})</li>
                <li>🍦 <strong>Cone Monodedo:</strong> {coneMonodedo?.name} ({coneMonodedo?.deaths} deaths)</li>
              </ul>
            </div>

            <div className="bg-card/50 p-4 rounded-lg border border-border space-y-3">
              <Label className="text-sm font-semibold">Ambiente de Publicação</Label>
              <RadioGroup value={environment} onValueChange={(value: 'homolog' | 'prod') => setEnvironment(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="homolog" id="homolog" />
                  <Label htmlFor="homolog" className="flex items-center gap-2 cursor-pointer font-normal">
                    🧪 Homologação (testes)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="prod" id="prod" />
                  <Label htmlFor="prod" className="flex items-center gap-2 cursor-pointer font-normal">
                    🚀 Produção (oficial)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDiscordModal(false)}
              disabled={isPublishing}
            >
              Cancelar
            </Button>
            <Button
              onClick={publishToDiscord}
              disabled={isPublishing}
            >
              {isPublishing ? 'Publicando...' : 'Confirmar Publicação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabela de Rankings */}
      <div ref={tableRef} className="overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Jogador
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Classe
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Guild
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-success uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Crosshair className="w-4 h-4" />
                    Kills
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-destructive uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Skull className="w-4 h-4" />
                    Deaths
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-warning uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    KDA
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-accent uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Pontuação
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-primary uppercase tracking-wider">
                  Boss
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedPlayers.map((player, index) => {
                const isTopPlayer = player.name === topPlayer.name;
                return (
                  <tr
                    key={player.name}
                    className={cn(
                      "transition-all duration-300 hover:bg-secondary/30",
                      isTopPlayer && "bg-primary/5"
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <Trophy className="w-5 h-5 text-warning animate-pulse" />
                        )}
                        <span className={cn(
                          "font-bold text-lg",
                          index === 0 && "text-warning text-glow"
                        )}>
                          #{index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "font-semibold text-base",
                        isTopPlayer && "text-primary text-glow"
                      )}>
                        {player.name}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">
                        {player.class || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">
                        {player.guild || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-success text-lg glow-success">
                        {player.kills}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-destructive text-lg glow-destructive">
                        {player.deaths}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-warning text-lg">
                        {player.kda.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-accent text-lg">
                        {player.eventScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-semibold text-muted-foreground">
                        {player.matches}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-success/10 border border-success/30 rounded-lg p-6 text-center">
          <Crosshair className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Total de Kills</p>
          <p className="text-3xl font-bold text-success glow-success">
            {sortedPlayers.reduce((sum, p) => sum + p.kills, 0)}
          </p>
        </div>
        
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <Skull className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Total de Deaths</p>
          <p className="text-3xl font-bold text-destructive glow-destructive">
            {sortedPlayers.reduce((sum, p) => sum + p.deaths, 0)}
          </p>
        </div>
        
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
          <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Jogadores</p>
          <p className="text-3xl font-bold text-primary glow-primary">
            {sortedPlayers.length}
          </p>
        </div>
      </div>

      {/* Resumo por Guild */}
      <div className="bg-card/50 p-6 rounded-xl border border-border">
        <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Trophy className="w-6 h-6 text-warning" />
          Resumo por Guild
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(() => {
            const guildCounts = sortedPlayers.reduce((acc, player) => {
              const guild = player.guild || 'Sem Guild';
              acc[guild] = (acc[guild] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            return (Object.entries(guildCounts) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([guild, count]) => (
                <div
                  key={guild}
                  className="bg-secondary/30 border border-border/50 rounded-lg p-4 text-center hover:bg-secondary/50 transition-colors"
                >
                  <p className="text-sm font-semibold text-muted-foreground mb-1">{guild}</p>
                  <p className="text-2xl font-bold text-primary">{count}</p>
                  <p className="text-xs text-muted-foreground">
                    {count === 1 ? 'jogador' : 'jogadores'}
                  </p>
                </div>
              ));
          })()}
        </div>
      </div>
      </>
      )}
    </div>
  );
};
