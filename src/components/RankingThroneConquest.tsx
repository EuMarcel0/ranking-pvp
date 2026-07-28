import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { debounce } from 'lodash';
import { useSearchParams } from 'react-router-dom';
import { Trophy, Skull, Crosshair, TrendingUp, Calendar as CalendarIcon, Download, FileImage, Send, Crown } from 'lucide-react';
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
import { WinnerGuildPicker } from '@/components/WinnerGuildPicker';

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

export const RankingThroneConquest = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sortBy, setSortBy] = useState<SortKey>('eventScore');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [winnerGuild, setWinnerGuild] = useState<string | null>(null);
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [classFilter, setClassFilter] = useState<string>('all');
  const [guildFilter, setGuildFilter] = useState<string>('all');
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');
  const tableRef = useRef<HTMLDivElement>(null);
  const specialCardsRef = useRef<HTMLDivElement>(null);
  const urlFiltersAppliedRef = useRef(false);

  // Apply URL parameters as initial filters
  useEffect(() => {
    if (urlFiltersAppliedRef.current) return;
    
    const dateParam = searchParams.get('date');
    
    if (dateParam) {
      const parsedDate = new Date(dateParam + 'T00:00:00');
      if (!isNaN(parsedDate.getTime())) {
        setDateFrom(parsedDate);
        setDateTo(parsedDate);
        setDebouncedDateFrom(parsedDate);
        setDebouncedDateTo(parsedDate);
      }
      urlFiltersAppliedRef.current = true;
    }
  }, [searchParams]);

  // Debounce filter updates
  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
    }, 500),
    []
  );

  // Update debounced values when filters change
  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo);
  }, [dateFrom, dateTo, debouncedSetFilters]);

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

  const normalizeClassKey = (s?: string) =>
    (s ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(.)\1+/g, '$1');

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
    queryKey: ['ranking-throne-conquest', debouncedDateFrom, debouncedDateTo],
    staleTime: 30000,
    queryFn: async () => {
      const normalize = (s?: string) =>
        (s ?? '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();

      const CHAR_PAGE = 1000;
      const characters: any[] = [];
      {
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('characters')
            .select('name, class, guild, banned, class_short')
            .eq('banned', false)
            .range(from, from + CHAR_PAGE - 1);
          if (error) break;
          if (!data || data.length === 0) break;
          characters.push(...data);
          if (data.length < CHAR_PAGE) break;
          from += CHAR_PAGE;
        }
      }

      const bannedChars: any[] = [];
      {
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('characters')
            .select('name')
            .eq('banned', true)
            .range(from, from + CHAR_PAGE - 1);
          if (error) break;
          if (!data || data.length === 0) break;
          bannedChars.push(...data);
          if (data.length < CHAR_PAGE) break;
          from += CHAR_PAGE;
        }
      }
      
      const bannedNames = new Set((bannedChars || []).map(c => normalize((c.name || '').trim())));

      const entries = (characters || []).map((c) => {
        const displayName = (c.name ?? '').trim();
        const norm = normalize(displayName);
        const clsStr = ((c.class ?? '') as string).replace(/\s+/g, ' ').trim();
        const guildStr = ((c.guild ?? '') as string).replace(/\s+/g, ' ').trim();
        const classShort = ((c.class_short ?? '') as string).trim();
        return { displayName, norm, cls: clsStr || null, guild: guildStr || null, class_short: classShort || null };
      });

      const characterMap = new Map<string, { class: string | null; guild: string | null; class_short: string | null }>();
      for (const e of entries) {
        const current = characterMap.get(e.norm);
        if (!current || e.cls) characterMap.set(e.norm, { class: e.cls, guild: e.guild, class_short: e.class_short });
      }

      const characterEntries = Array.from(characterMap.entries()).map(([norm, data]) => ({
        norm,
        class: (data.class || '').toString(),
        guild: (data.guild || '').toString(),
        class_short: (data.class_short || '').toString(),
      }));

      const levenshtein2 = (a: string, b: string) => {
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > 2) return 3;
        const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
        for (let i = 0; i <= a.length; i++) dp[i][0] = i;
        for (let j = 0; j <= b.length; j++) dp[0][j] = j;
        let minInRow = 0;
        for (let i = 1; i <= a.length; i++) {
          minInRow = Number.MAX_SAFE_INTEGER;
          for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
              dp[i - 1][j] + 1,
              dp[i][j - 1] + 1,
              dp[i - 1][j - 1] + cost
            );
            if (dp[i][j] < minInRow) minInRow = dp[i][j];
          }
          if (minInRow > 2) return 3;
        }
        return dp[a.length][b.length];
      };

      const findClosestCharacterData = (normName: string): { class: string | null; guild: string | null; class_short: string | null } => {
        let best: { dist: number; class: string | null; guild: string | null; class_short: string | null } = { dist: 3, class: null, guild: null, class_short: null };
        for (const entry of characterEntries) {
          const d = levenshtein2(normName, entry.norm);
          if (d < best.dist) best = { dist: d, class: entry.class, guild: entry.guild, class_short: entry.class_short };
          if (best.dist === 0) break;
        }
        return best.dist <= 1 ? { class: best.class, guild: best.guild, class_short: best.class_short } : { class: null, guild: null, class_short: null };
      };

      // Get only Throne Conquest matches (event_type = 'throne_conquest')
      const pageSize = 1000;
      let from = 0;
      let matchesAccum: any[] = [];
      while (true) {
        let mq = supabase
          .from('pvp_matches')
          .select('id, match_date, match_hour')
          .eq('event_type', 'throne_conquest');
        if (debouncedDateFrom) mq = mq.gte('match_date', format(debouncedDateFrom, 'yyyy-MM-dd'));
        if (debouncedDateTo) mq = mq.lte('match_date', format(debouncedDateTo, 'yyyy-MM-dd'));
        const { data: page, error } = await mq.range(from, from + pageSize - 1);
        if (error) throw error;
        if (page && page.length > 0) matchesAccum = matchesAccum.concat(page);
        if (!page || page.length < pageSize) break;
        from += pageSize;
      }
      
      const matchIds = (matchesAccum || []).map((m: any) => m.id);
      if (!matchIds.length) {
        return { aggregated: [], brabissimoRecord: undefined, coneMonodedoName: '', characters: [], matchIds: [] };
      }

      // Fetch logs for those matches
      const pageSizeLogs = 1000;
      let fromLogs = 0;
      let logs: any[] = [];
      while (true) {
        const { data: page, error } = await supabase
          .from('pvp_kill_logs')
          .select('killer_name, victim_name, match_id, created_at')
          .in('match_id', matchIds)
          .order('created_at', { ascending: false })
          .range(fromLogs, fromLogs + pageSizeLogs - 1);
        if (error) throw error;
        if (page && page.length > 0) logs = logs.concat(page as any[]);
        if (!page || page.length < pageSizeLogs) break;
        fromLogs += pageSizeLogs;
      }

      type Stat = { kills: number; deaths: number; displayName: string; matches: Set<string> };
      const playerMap = new Map<string, Stat>();
      const perMatchKills = new Map<string, number>();
      const uniqueMatches = new Set<string>();

      for (const log of logs) {
        const matchId = log.match_id as string;
        if (matchId) uniqueMatches.add(matchId);

        const killerDisplay = (log.killer_name || '').trim();
        const victimDisplay = (log.victim_name || '').trim();
        const killerKey = normalize(killerDisplay);
        const victimKey = normalize(victimDisplay);

        if (bannedNames.has(killerKey) || bannedNames.has(victimKey)) continue;

        // Throne Conquest não permite fogo amigo: ignorar kills entre membros da mesma guild
        const killerGuild = (characterMap.get(killerKey)?.guild || '').trim();
        const victimGuild = (characterMap.get(victimKey)?.guild || '').trim();
        if (killerGuild && victimGuild && killerGuild === victimGuild && killerKey !== victimKey) continue;

        if (killerKey) {
          const kstats = playerMap.get(killerKey) || { kills: 0, deaths: 0, displayName: killerDisplay, matches: new Set<string>() };
          kstats.kills += 1;
          if (matchId) kstats.matches.add(matchId);
          playerMap.set(killerKey, kstats);

          if (matchId) {
            const pmkKey = `${matchId}|${killerKey}`;
            perMatchKills.set(pmkKey, (perMatchKills.get(pmkKey) || 0) + 1);
          }
        }
        if (victimKey) {
          const vstats = playerMap.get(victimKey) || { kills: 0, deaths: 0, displayName: victimDisplay, matches: new Set<string>() };
          vstats.deaths += 1;
          if (matchId) vstats.matches.add(matchId);
          playerMap.set(victimKey, vstats);
        }
      }

      let coneMonodedoName = '';
      const totalEvents = uniqueMatches.size;

      let aggregated: AggregatedPlayer[] = Array.from(playerMap.entries()).map(([normKey, stats]) => {
        const kda = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
        const weightedKda = totalEvents > 0 ? kda * (stats.matches.size / totalEvents) : 0;
        const mvpScore = (stats.kills * 3) + (kda * 1) + (stats.matches.size * 1) - (stats.deaths * 3);
        const eventScore = (stats.kills * 3) + (kda * 1) + (stats.matches.size * 1) - (stats.deaths * 3);
        const charData = characterMap.get(normKey) || findClosestCharacterData(normKey);
        return {
          name: stats.displayName,
          class: charData.class,
          class_short: charData.class_short,
          guild: charData.guild,
          kills: stats.kills,
          deaths: stats.deaths,
          kda,
          weightedKda,
          matches: stats.matches.size,
          mvpScore,
          eventScore,
        };
      });

      aggregated = aggregated.filter(p => p.kills > 0 || p.deaths > 0);

      if (aggregated.length > 0) {
        const worstPlayer = [...aggregated].sort((a, b) => a.eventScore - b.eventScore)[0];
        coneMonodedoName = worstPlayer.name;
      }

      let brabissimoRecord: { name: string; kills: number } | undefined = undefined;
      for (const [key, count] of perMatchKills.entries()) {
        const [matchId, normKey] = key.split('|');
        const stats = playerMap.get(normKey);
        if (!stats) continue;
        if (stats.displayName === coneMonodedoName) continue;
        if (!brabissimoRecord || count > brabissimoRecord.kills) {
          brabissimoRecord = { name: stats.displayName, kills: count };
        }
      }

      const dedupCharacters = Array.from(characterMap.entries()).map(([norm, data]) => {
        const original = (entries.find(e => e.norm === norm)?.displayName) || '';
        return { name: original, class: data.class || null, guild: data.guild || null };
      });

      const matchesMeta = (matchesAccum || []).map((m: any) => ({ id: m.id, date: m.match_date, hour: m.match_hour }));
      return { aggregated, brabissimoRecord, coneMonodedoName, characters: dedupCharacters, matchIds, matchesMeta, killLogs: logs.map((l: any) => ({ killer_name: l.killer_name, victim_name: l.victim_name })) };
    }
  });

  const guildOptions = useMemo(() => {
    if (!aggregatedData?.aggregated) return [];
    const guilds = new Set<string>();
    for (const p of aggregatedData.aggregated) {
      if (p.guild && p.guild.trim()) guilds.add(p.guild.trim());
    }
    return Array.from(guilds).sort((a, b) => a.localeCompare(b));
  }, [aggregatedData]);

  const sortedPlayers = useMemo(() => {
    if (!aggregatedData?.aggregated) return [];
    
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
  }, [aggregatedData, sortBy, classFilter, guildFilter]);

  const topPlayer = sortedPlayers[0];

  const reiDoThrone = useMemo(() => {
    const coneMonodedoName = aggregatedData?.coneMonodedoName;
    const eligiblePlayers = sortedPlayers.filter(p => p.name !== coneMonodedoName);
    return [...eligiblePlayers].sort((a, b) => b.mvpScore - a.mvpScore)[0];
  }, [sortedPlayers, aggregatedData]);

  const brabissimo = useMemo(() => {
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

  const exportToExcel = () => {
    const worksheetData = [
      ['Ranking Throne Conquest'],
      [''],
      ['Rank', 'Jogador', 'Classe', 'Guild', 'Kills', 'Deaths', 'KDA', 'Pontuação', 'Eventos'],
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Throne Conquest');
    
    const fileName = `ranking-throne-conquest-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`;
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
      link.download = `ranking-throne-conquest-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.jpg`;
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
        eventType: 'throne_conquest',
        winnerGuild: winnerGuild || '',
        filters: {
          class: classFilter,
          dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
          dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
          sortBy
        },
        specialRankings: {
          reiDoPVP: {
            name: reiDoThrone?.name || '',
            kills: reiDoThrone?.kills || 0,
            deaths: reiDoThrone?.deaths || 0,
            matches: reiDoThrone?.matches || 0
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
        killLogs: aggregatedData?.killLogs || []
      };

      const { data, error } = await supabase.functions.invoke('discord-webhook', {
        body: payload
      });

      if (error) throw error;

      toast({
        title: 'Sucesso!',
        description: `Ranking Throne Conquest publicado no Discord.`,
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
      {/* Header */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-3 bg-primary/20 border-2 border-primary rounded-lg px-6 py-3">
          <Crown className="w-8 h-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold text-primary">Throne Conquest</h2>
            <p className="text-sm text-muted-foreground">Terça-feira 21:36 - 22:36 • Mapa: Devias</p>
          </div>
          <Crown className="w-8 h-8 text-primary" />
        </div>
      </div>

      {/* Filtros de Data */}
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
                {guildOptions.map((guild) => (
                  <SelectItem key={guild} value={guild}>
                    {guild}
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

          <Button
            variant="ghost"
            onClick={() => {
              setDateFrom(undefined);
              setDateTo(undefined);
              setClassFilter('all');
            }}
            className="text-sm"
          >
            Limpar Filtros
          </Button>
        </div>
      </div>

      {!isLoading && aggregatedData?.matchesMeta && aggregatedData.matchesMeta.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <WinnerGuildPicker
            matches={aggregatedData.matchesMeta}
            guilds={guildOptions}
            onWinnerChange={setWinnerGuild}
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Carregando dados do Throne Conquest...</p>
        </div>
      ) : hasNoData ? (
        <div className="text-center py-12 text-muted-foreground">
          <Crown className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Nenhum dado encontrado para o Throne Conquest com os filtros aplicados.</p>
          <p className="text-sm mt-2">Ajuste os filtros acima ou clique em "Limpar Filtros".</p>
        </div>
      ) : (
      <>
      {/* Classificações Especiais */}
      <div ref={specialCardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-success/10 border-2 border-success rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Crown className="w-10 h-10 text-success mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-success mb-2">👑 Rei do Throne</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{reiDoThrone?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-success font-bold">{reiDoThrone?.kills}</span> kills • <span className="text-destructive font-bold">{reiDoThrone?.deaths}</span> deaths
          </p>
          <p className="text-xs text-muted-foreground mt-1">{reiDoThrone?.matches} evento(s)</p>
        </div>

        <div className="bg-warning/10 border-2 border-warning rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-warning mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-warning mb-2">⚡ Brabissimo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{brabissimo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-warning font-bold">{brabissimo?.singleMatchKills}</span> kills em 1 evento
          </p>
          <p className="text-xs text-muted-foreground mt-1">{brabissimo?.matches} evento(s)</p>
        </div>

        <div data-hide-on-export="kda-medio-card" className="bg-accent/10 border-2 border-accent rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-accent mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-accent mb-2">📊 KDA/Médio</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{melhorPonderado?.name}</p>
          <p className="text-sm text-muted-foreground">
            KDA/Médio: <span className="text-accent font-bold">{melhorPonderado?.weightedKda.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{melhorPonderado?.matches} evento(s)</p>
        </div>

        <div className="bg-destructive/10 border-2 border-destructive rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Skull className="w-10 h-10 text-destructive mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-destructive mb-2">🎯 Alvo Prioritário</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{coneMonodedo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive font-bold">{coneMonodedo?.deaths}</span> deaths
          </p>
          <p className="text-xs text-muted-foreground mt-1">{coneMonodedo?.matches} evento(s)</p>
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
            <DialogTitle>Publicar Ranking Throne Conquest no Discord</DialogTitle>
            <DialogDescription>
              Confirme a publicação do ranking no canal do Discord.
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
              </ul>
            </div>

            <div className="bg-primary/10 p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold">Destaques:</p>
              <ul className="text-sm space-y-1">
                <li>👑 <strong>Rei do Throne:</strong> {reiDoThrone?.name} ({reiDoThrone?.kills} kills, {reiDoThrone?.deaths} deaths)</li>
                <li>⚡ <strong>Brabissimo:</strong> {brabissimo?.name} (KDA: {brabissimo?.kda?.toFixed(2)})</li>
                <li>🎯 <strong>Alvo Prioritário:</strong> {coneMonodedo?.name} ({coneMonodedo?.deaths} deaths)</li>
              </ul>
            </div>

            <div className="bg-card/50 p-4 rounded-lg border border-border space-y-3">
              <Label className="text-sm font-semibold">Ambiente de Publicação</Label>
              <RadioGroup value={environment} onValueChange={(value: 'homolog' | 'prod') => setEnvironment(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="homolog" id="homolog-throne" />
                  <Label htmlFor="homolog-throne" className="flex items-center gap-2 cursor-pointer font-normal">
                    🧪 Homologação (testes)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="prod" id="prod-throne" />
                  <Label htmlFor="prod-throne" className="flex items-center gap-2 cursor-pointer font-normal">
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
                  Eventos
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
                          <Crown className="w-5 h-5 text-warning animate-pulse" />
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
          <Crown className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Jogadores</p>
          <p className="text-3xl font-bold text-primary glow-primary">
            {sortedPlayers.length}
          </p>
        </div>
      </div>

      {/* Resumo por Guild */}
      <div className="bg-card/50 p-6 rounded-xl border border-border">
        <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Crown className="w-6 h-6 text-warning" />
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
