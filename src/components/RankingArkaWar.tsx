import { useMemo, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
import { Trophy, Skull, Crosshair, TrendingUp, Calendar as CalendarIcon, Download, FileImage } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WinnerGuildPicker } from '@/components/WinnerGuildPicker';


interface AggregatedPlayer {
  name: string;
  class: string | null;
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

interface ParsedKill {
  killer: string;
  victim: string;
  time: string | null;
}

export const RankingArkaWar = () => {
  const [sortBy, setSortBy] = useState<SortKey>('eventScore');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [classFilter, setClassFilter] = useState<string>('all');
  const [guildFilter, setGuildFilter] = useState<string>('all');
  const tableRef = useRef<HTMLDivElement>(null);
  const specialCardsRef = useRef<HTMLDivElement>(null);

  // Import state

  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
    }, 500),
    []
  );

  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo);
  }, [dateFrom, dateTo, debouncedSetFilters]);

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('characters').select('class').not('class', 'is', null);
      if (error) throw error;
      return [...new Set(data?.map(c => (c.class || '').replace(/\s+/g, ' ').trim()).filter(Boolean))].sort();
    }
  });

  const normalizeClassKey = (s?: string) =>
    (s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(.)\1+/g, '$1');

  const classOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    (classes || []).forEach((cls) => {
      const key = normalizeClassKey(cls);
      if (!map.has(key)) map.set(key, { key, label: (cls || '').replace(/\s+/g, ' ').trim() });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [classes]);


  // Ranking query (same logic as RankingThroneConquest)
  const { data: aggregatedData, isLoading } = useQuery({
    queryKey: ['ranking-arka-war', debouncedDateFrom, debouncedDateTo],
    staleTime: 30000,
    queryFn: async () => {
      const normalize = (s?: string) => (s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      const CHAR_PAGE = 1000;
      const characters: any[] = [];
      {
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('characters')
            .select('name, class, guild, banned')
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

      const entries = (characters || []).map(c => {
        const displayName = (c.name ?? '').trim();
        const norm = normalize(displayName);
        return { displayName, norm, cls: ((c.class ?? '') as string).replace(/\s+/g, ' ').trim() || null, guild: ((c.guild ?? '') as string).replace(/\s+/g, ' ').trim() || null };
      });

      const characterMap = new Map<string, { class: string | null; guild: string | null }>();
      for (const e of entries) {
        const current = characterMap.get(e.norm);
        if (!current || e.cls) characterMap.set(e.norm, { class: e.cls, guild: e.guild });
      }

      // Fetch Arka War matches
      const pageSize = 1000;
      let from = 0;
      let matchesAccum: any[] = [];
      while (true) {
        let mq = supabase.from('pvp_matches').select('id, match_date, match_hour').eq('event_type', 'arka_war');
        if (debouncedDateFrom) mq = mq.gte('match_date', format(debouncedDateFrom, 'yyyy-MM-dd'));
        if (debouncedDateTo) mq = mq.lte('match_date', format(debouncedDateTo, 'yyyy-MM-dd'));
        const { data: page, error } = await mq.range(from, from + pageSize - 1);
        if (error) throw error;
        if (page && page.length > 0) matchesAccum = matchesAccum.concat(page);
        if (!page || page.length < pageSize) break;
        from += pageSize;
      }

      const matchIds = matchesAccum.map((m: any) => m.id);
      if (!matchIds.length) return { aggregated: [], brabissimoRecord: undefined, coneMonodedoName: '', characters: [], matchIds: [] };

      // Fetch logs
      let fromLogs = 0;
      let logs: any[] = [];
      while (true) {
        const { data: page, error } = await supabase
          .from('pvp_kill_logs')
          .select('killer_name, victim_name, match_id, created_at')
          .in('match_id', matchIds)
          .order('created_at', { ascending: false })
          .range(fromLogs, fromLogs + pageSize - 1);
        if (error) throw error;
        if (page && page.length > 0) logs = logs.concat(page);
        if (!page || page.length < pageSize) break;
        fromLogs += pageSize;
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
        const eventScore = (stats.kills * 3) + (kda * 1) + (stats.matches.size * 1) - (stats.deaths * 3);
        const charData = characterMap.get(normKey) || { class: null, guild: null };
        return { name: stats.displayName, class: charData.class, guild: charData.guild, kills: stats.kills, deaths: stats.deaths, kda, weightedKda, matches: stats.matches.size, mvpScore: eventScore, eventScore };
      });

      aggregated = aggregated.filter(p => p.kills > 0 || p.deaths > 0);

      if (aggregated.length > 0) {
        const worstPlayer = [...aggregated].sort((a, b) => a.eventScore - b.eventScore)[0];
        coneMonodedoName = worstPlayer.name;
      }

      let brabissimoRecord: { name: string; kills: number } | undefined = undefined;
      for (const [key, count] of perMatchKills.entries()) {
        const [, normKey] = key.split('|');
        const stats = playerMap.get(normKey);
        if (!stats || stats.displayName === coneMonodedoName) continue;
        if (!brabissimoRecord || count > brabissimoRecord.kills) {
          brabissimoRecord = { name: stats.displayName, kills: count };
        }
      }

      const matchesMeta = matchesAccum.map((m: any) => ({ id: m.id, date: m.match_date, hour: m.match_hour }));
      return { aggregated, brabissimoRecord, coneMonodedoName, characters: [], matchIds, matchesMeta };
    }
  });

  const guildOptions = useMemo(() => {
    if (!aggregatedData?.aggregated) return [];
    const guilds = new Set<string>();
    for (const p of aggregatedData.aggregated) {
      if (p.guild && p.guild.trim()) guilds.add(p.guild.trim());
    }
    return Array.from(guilds).sort();
  }, [aggregatedData]);

  const sortedPlayers = useMemo(() => {
    if (!aggregatedData?.aggregated) return [];
    let filtered = aggregatedData.aggregated;
    if (classFilter !== 'all') filtered = filtered.filter(p => normalizeClassKey(p.class || '') === classFilter);
    if (guildFilter !== 'all') filtered = filtered.filter(p => (p.guild || '').trim() === guildFilter);
    return [...filtered].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [aggregatedData, sortBy, classFilter, guildFilter]);

  const topPlayer = sortedPlayers[0];

  const reiDoArka = useMemo(() => {
    const cone = aggregatedData?.coneMonodedoName;
    return [...sortedPlayers].filter(p => p.name !== cone).sort((a, b) => b.mvpScore - a.mvpScore)[0];
  }, [sortedPlayers, aggregatedData]);

  const brabissimo = useMemo(() => {
    if (!aggregatedData?.brabissimoRecord) return undefined;
    const p = sortedPlayers.find(p => p.name === aggregatedData.brabissimoRecord!.name);
    return p ? { ...p, singleMatchKills: aggregatedData.brabissimoRecord.kills } : undefined;
  }, [aggregatedData, sortedPlayers]);

  const coneMonodedo = useMemo(() => {
    return sortedPlayers.find(p => p.name === aggregatedData?.coneMonodedoName);
  }, [sortedPlayers, aggregatedData]);

  const melhorPonderado = useMemo(() => {
    return [...sortedPlayers].sort((a, b) => b.weightedKda - a.weightedKda)[0];
  }, [sortedPlayers]);

  // Agente Duplo: jogador que mais matou amigos (Arka War)
  const { data: agenteDuploData } = useQuery({
    queryKey: ['agente-duplo-arka', debouncedDateFrom, debouncedDateTo],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ranking_fogo_amigo', {
        p_date_from: debouncedDateFrom ? format(debouncedDateFrom, 'yyyy-MM-dd') : null,
        p_date_to: debouncedDateTo ? format(debouncedDateTo, 'yyyy-MM-dd') : null,
        p_event_type: 'arka_war',
      });
      if (error) throw error;
      const list = (data as any[]) || [];
      const sorted = [...list].sort((a, b) => Number(b.friendly_kills) - Number(a.friendly_kills));
      return sorted[0] ? {
        name: sorted[0].player_name as string,
        guild: (sorted[0].player_guild as string) || '',
        friendlyKills: Number(sorted[0].friendly_kills),
      } : null;
    },
  });

  // Putinha da Noite: par dominador → vítima com mais mortes (Arka War)
  const { data: putinhaNoiteData } = useQuery({
    queryKey: ['putinha-noite-arka', debouncedDateFrom, debouncedDateTo],
    staleTime: 30000,
    queryFn: async () => {
      let mq = supabase.from('pvp_matches').select('id').eq('event_type', 'arka_war');
      if (debouncedDateFrom) mq = mq.gte('match_date', format(debouncedDateFrom, 'yyyy-MM-dd'));
      if (debouncedDateTo) mq = mq.lte('match_date', format(debouncedDateTo, 'yyyy-MM-dd'));
      const { data: matches, error: me } = await mq;
      if (me) throw me;
      const matchIds = (matches || []).map((m: any) => m.id);
      if (matchIds.length === 0) return null;
      const counts = new Map<string, { killer: string; victim: string; n: number }>();
      const PAGE = 1000;
      for (let i = 0; i < matchIds.length; i += 200) {
        const slice = matchIds.slice(i, i + 200);
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('pvp_kill_logs')
            .select('killer_name,victim_name')
            .in('match_id', slice)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const r of data as any[]) {
            if (r.killer_name === r.victim_name) continue;
            const k = `${r.killer_name}→${r.victim_name}`;
            const ex = counts.get(k);
            if (ex) ex.n++;
            else counts.set(k, { killer: r.killer_name, victim: r.victim_name, n: 1 });
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
      const arr = Array.from(counts.values()).sort((a, b) => b.n - a.n);
      return arr[0] ? { dominador: arr[0].killer, putinha: arr[0].victim, kills: arr[0].n } : null;
    },
  });

  const exportToExcel = () => {
    const worksheetData = [
      ['Ranking Arka War'],
      [''],
      ['Rank', 'Jogador', 'Classe', 'Guild', 'Kills', 'Deaths', 'KDA', 'Pontuação', 'Eventos'],
      ...sortedPlayers.map((player, index) => [index + 1, player.name, player.class || '-', player.guild || '-', player.kills, player.deaths, player.kda.toFixed(2), player.eventScore.toFixed(2), player.matches]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Arka War');
    XLSX.writeFile(workbook, `ranking-arka-war-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`);
  };

  const exportToImage = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current, { backgroundColor: '#1a1a1a', scale: 2, logging: false });
      const link = document.createElement('a');
      link.download = `ranking-arka-war-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
    }
  };

  const SortButton = ({ label, sortKey, icon: Icon }: { label: string; sortKey: SortKey; icon: any }) => (
    <button
      onClick={() => setSortBy(sortKey)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300",
        sortBy === sortKey ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-3 bg-orange-500/20 border-2 border-orange-500 rounded-lg px-6 py-3">
          <Crosshair className="w-8 h-8 text-orange-500" />
          <div>
            <h2 className="text-2xl font-bold text-orange-500">Arka War</h2>
            <p className="text-sm text-muted-foreground">Ranking de Guerra de Arka</p>
          </div>
          <Crosshair className="w-8 h-8 text-orange-500" />
        </div>
      </div>


      {/* Filters - always visible */}
      <div className="bg-card/50 p-6 rounded-xl border border-border space-y-4">
        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Classe:</span>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todas as classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {classOptions?.map(opt => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Guild:</span>
            <Select value={guildFilter} onValueChange={setGuildFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todas as guilds" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {guildOptions.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">De:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Até:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <Button variant="ghost" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setClassFilter('all'); setGuildFilter('all'); }} className="text-sm">
            Limpar Filtros
          </Button>
        </div>
      </div>

      {!isLoading && aggregatedData?.matchesMeta && aggregatedData.matchesMeta.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <WinnerGuildPicker matches={aggregatedData.matchesMeta} guilds={guildOptions} />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground"><p>Carregando dados do Arka War...</p></div>
      ) : !sortedPlayers || sortedPlayers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Crosshair className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Nenhum dado encontrado para o Arka War com os filtros aplicados.</p>
          <p className="text-sm mt-2">Ajuste os filtros acima ou clique em "Limpar Filtros".</p>
        </div>
      ) : (
        <>
          <div ref={specialCardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-success/10 border-2 border-success rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
              <Trophy className="w-10 h-10 text-success mx-auto mb-3 animate-pulse" />
              <h3 className="text-lg font-bold text-success mb-2">👑 Rei do Arka</h3>
              <p className="text-2xl font-bold text-foreground text-glow mb-1">{reiDoArka?.name}</p>
              <p className="text-sm text-muted-foreground">
                <span className="text-success font-bold">{reiDoArka?.kills}</span> kills • <span className="text-destructive font-bold">{reiDoArka?.deaths}</span> deaths
              </p>
              <p className="text-xs text-muted-foreground mt-1">{reiDoArka?.matches} evento(s)</p>
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

            <div className="bg-accent/10 border-2 border-accent rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
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
              <h3 className="text-lg font-bold text-destructive mb-2">🍦 Cone monodedo</h3>
              <p className="text-2xl font-bold text-foreground text-glow mb-1">{coneMonodedo?.name}</p>
              <p className="text-sm text-muted-foreground">
                <span className="text-destructive font-bold">{coneMonodedo?.deaths}</span> deaths
              </p>
              <p className="text-xs text-muted-foreground mt-1">{coneMonodedo?.matches} evento(s)</p>
            </div>

            {agenteDuploData && (
              <div className="bg-purple-500/10 border-2 border-purple-500 rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
                <Skull className="w-10 h-10 text-purple-500 mx-auto mb-3 animate-pulse" />
                <h3 className="text-lg font-bold text-purple-500 mb-2">🕵️ Agente Duplo</h3>
                <p className="text-2xl font-bold text-foreground text-glow mb-1">{agenteDuploData.name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-purple-500 font-bold">{agenteDuploData.friendlyKills}</span> kills em aliados
                </p>
                {agenteDuploData.guild && <p className="text-xs text-muted-foreground mt-1">{agenteDuploData.guild}</p>}
              </div>
            )}

            {putinhaNoiteData && (
              <div className="bg-pink-500/10 border-2 border-pink-500 rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
                <Skull className="w-10 h-10 text-pink-500 mx-auto mb-3 animate-pulse" />
                <h3 className="text-lg font-bold text-pink-500 mb-2">💔 Putinha da Noite</h3>
                <p className="text-lg font-bold text-foreground text-glow mb-1">
                  {putinhaNoiteData.dominador} → {putinhaNoiteData.putinha}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-pink-500 font-bold">{putinhaNoiteData.kills}</span> mortes
                </p>
              </div>
            )}
          </div>

          {/* Sort & Export */}
          <div className="flex flex-wrap gap-3 justify-center items-center">
            <SortButton label="Kills" sortKey="kills" icon={Crosshair} />
            <SortButton label="Deaths" sortKey="deaths" icon={Skull} />
            <SortButton label="KDA" sortKey="kda" icon={TrendingUp} />
            <SortButton label="Pontuação" sortKey="eventScore" icon={Trophy} />
            <SortButton label="KDA/Médio" sortKey="weightedKda" icon={TrendingUp} />
            <div className="w-px h-8 bg-border mx-2" />
            <Button onClick={exportToExcel} variant="secondary" className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button onClick={exportToImage} variant="secondary" className="flex items-center gap-2">
              <FileImage className="w-4 h-4" /> JPG
            </Button>
          </div>

          {/* Table */}
          <div ref={tableRef} className="overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">Jogador</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">Classe</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">Guild</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-success uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-2"><Crosshair className="w-4 h-4" />Kills</div>
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-destructive uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-2"><Skull className="w-4 h-4" />Deaths</div>
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-warning uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-2"><TrendingUp className="w-4 h-4" />KDA</div>
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-accent uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-2"><Trophy className="w-4 h-4" />Pontuação</div>
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-primary uppercase tracking-wider">Eventos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedPlayers.map((player, index) => {
                    const isTopPlayer = player.name === topPlayer?.name;
                    return (
                      <tr key={player.name} className={cn("transition-all duration-300 hover:bg-secondary/30", isTopPlayer && "bg-primary/5")}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {index === 0 && <Trophy className="w-5 h-5 text-warning animate-pulse" />}
                            <span className={cn("font-bold text-lg", index === 0 && "text-warning text-glow")}>#{index + 1}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className={cn("font-semibold text-base", isTopPlayer && "text-primary text-glow")}>{player.name}</span></td>
                        <td className="px-6 py-4"><span className="text-sm text-muted-foreground">{player.class || '-'}</span></td>
                        <td className="px-6 py-4"><span className="text-sm text-muted-foreground">{player.guild || '-'}</span></td>
                        <td className="px-6 py-4 text-center"><span className="font-bold text-success text-lg glow-success">{player.kills}</span></td>
                        <td className="px-6 py-4 text-center"><span className="font-bold text-destructive text-lg glow-destructive">{player.deaths}</span></td>
                        <td className="px-6 py-4 text-center"><span className="font-bold text-warning text-lg">{player.kda.toFixed(2)}</span></td>
                        <td className="px-6 py-4 text-center"><span className="font-bold text-accent text-lg">{player.eventScore.toFixed(2)}</span></td>
                        <td className="px-6 py-4 text-center"><span className="font-semibold text-muted-foreground">{player.matches}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-success/10 border border-success/30 rounded-lg p-6 text-center">
              <Crosshair className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Total de Kills</p>
              <p className="text-3xl font-bold text-success glow-success">{sortedPlayers.reduce((sum, p) => sum + p.kills, 0)}</p>
            </div>
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
              <Skull className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Total de Deaths</p>
              <p className="text-3xl font-bold text-destructive glow-destructive">{sortedPlayers.reduce((sum, p) => sum + p.deaths, 0)}</p>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
              <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Jogadores</p>
              <p className="text-3xl font-bold text-primary glow-primary">{sortedPlayers.length}</p>
            </div>
          </div>

          {/* Guild Summary */}
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
                return (Object.entries(guildCounts) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([guild, count]) => (
                  <div key={guild} className="bg-secondary/30 border border-border/50 rounded-lg p-4 text-center hover:bg-secondary/50 transition-colors">
                    <p className="text-sm font-semibold text-muted-foreground mb-1">{guild}</p>
                    <p className="text-2xl font-bold text-primary">{count}</p>
                    <p className="text-xs text-muted-foreground">{count === 1 ? 'jogador' : 'jogadores'}</p>
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
