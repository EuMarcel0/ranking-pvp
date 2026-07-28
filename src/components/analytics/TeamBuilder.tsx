import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Brain, Loader2, Shield, TrendingUp, TrendingDown, Minus, Star, Users, Target, AlertTriangle, ArrowUpRight, Upload, ClipboardList, CheckCircle2, XCircle, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsFilters, CharacterInfo } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface Props {
  filters: AnalyticsFilters;
}

type PilotStatus = 'available' | 'no_pilot' | 'unavailable' | 'none';

interface MemberStats {
  name: string;
  className: string;
  kills: number;
  deaths: number;
  kda: number;
  participation: number;
  consistency: number; // std dev of per-match KDA
  bestEvent: string;
  worstEvent: string;
  trend: 'up' | 'down' | 'stable';
  classification: string;
  perMatchKDAs: number[];
  recentKDA: number;
  pilotName?: string;
  pilotStatus: PilotStatus;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(sq);
}

function classify(member: MemberStats, guildAvgKDA: number): string {
  // MVP: top KDA + high participation
  if (member.kda >= guildAvgKDA * 1.3 && member.participation >= 60) return 'MVP';
  // Em Evolução: trending up
  if (member.trend === 'up' && member.kda < guildAvgKDA) return 'Em Evolução';
  // Constante: low std dev + decent participation
  if (member.consistency < 0.5 && member.participation >= 40) return 'Constante';
  // Oscilante: high std dev
  if (member.consistency > 1.5) return 'Oscilante';
  // Destaque: above average KDA
  if (member.kda > guildAvgKDA) return 'Destaque';
  // Reserva: low participation
  if (member.participation < 30) return 'Reserva';
  return 'Regular';
}

function classificationBadge(c: string) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    'MVP': { variant: 'default', icon: <Star className="w-3 h-3" /> },
    'Constante': { variant: 'secondary', icon: <Shield className="w-3 h-3" /> },
    'Oscilante': { variant: 'destructive', icon: <AlertTriangle className="w-3 h-3" /> },
    'Destaque': { variant: 'default', icon: <Target className="w-3 h-3" /> },
    'Em Evolução': { variant: 'secondary', icon: <ArrowUpRight className="w-3 h-3" /> },
    'Reserva': { variant: 'outline', icon: <Users className="w-3 h-3" /> },
    'Regular': { variant: 'outline', icon: null },
  };
  const cfg = map[c] || map['Regular'];
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {cfg.icon} {c}
    </Badge>
  );
}

function trendIcon(t: 'up' | 'down' | 'stable') {
  if (t === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (t === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

const eventLabel = (e: string) => e === 'boss_event' ? 'Boss' : e === 'throne_conquest' ? 'Throne' : e;

const EVENT_OPTIONS = [
  { value: 'all', label: 'Todos os Eventos' },
  { value: 'boss_event', label: 'Boss Event' },
  { value: 'throne_conquest', label: 'Throne Conquest' },
];

const TEAM_SIZE: Record<string, number> = {
  all: 25,
  boss_event: 25,
  throne_conquest: 25,
};

export const TeamBuilder = ({ filters }: Props) => {
  const [members, setMembers] = useState<MemberStats[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState('');

  // Pilot list import state
  const [pilotListText, setPilotListText] = useState('');
  const [importedPilots, setImportedPilots] = useState<string[]>([]);
  const [pilotFilterActive, setPilotFilterActive] = useState(false);

  // Use filters from parent
  const eventType = filters.eventType === 'all' ? 'all' : filters.eventType;
  const guild = filters.guild || '';

  // Shared analytics dataset (cached across all tabs)
  const { data: dataset, isLoading: datasetLoading } = useAnalyticsDataset(filters);
  const loading = datasetLoading;
  const allCharacters: CharacterInfo[] = dataset?.characters || [];

  // Recompute members whenever the cached dataset, guild, or eventType changes.
  useEffect(() => {
    if (!guild || !dataset) {
      setMembers([]);
      return;
    }

    const { logs, charMap, matchTypeMap, matchDateMap, matches } = dataset;
    const characters = dataset.characters;

      // Get guild members (unique names from characters table)
      const guildMembers = new Set(
        characters.filter(c => c.guild === guild && !c.banned).map(c => c.name)
      );

      // Per-member, per-match stats
      const memberMatchKills = new Map<string, Map<string, number>>();
      const memberMatchDeaths = new Map<string, Map<string, number>>();
      const totalMatches = matches.length;

      // Also per-event-type stats
      const memberEventKills = new Map<string, Map<string, number>>();
      const memberEventDeaths = new Map<string, Map<string, number>>();

      for (const l of logs) {
        const eventType = matchTypeMap.get(l.match_id) || 'unknown';

        for (const [name, isKiller] of [[l.killer_name, true], [l.victim_name, false]] as [string, boolean][]) {
          if (!guildMembers.has(name)) continue;

          // Per match
          const matchMap = isKiller ? memberMatchKills : memberMatchDeaths;
          if (!matchMap.has(name)) matchMap.set(name, new Map());
          const mm = matchMap.get(name)!;
          mm.set(l.match_id, (mm.get(l.match_id) || 0) + 1);

          // Per event type
          const eventMap = isKiller ? memberEventKills : memberEventDeaths;
          if (!eventMap.has(name)) eventMap.set(name, new Map());
          const em = eventMap.get(name)!;
          em.set(eventType, (em.get(eventType) || 0) + 1);
        }
      }

      // Build stats for each member
      const stats: MemberStats[] = [];

      for (const name of guildMembers) {
        const killsByMatch = memberMatchKills.get(name) || new Map<string, number>();
        const deathsByMatch = memberMatchDeaths.get(name) || new Map<string, number>();
        const allMatchIds = new Set([...killsByMatch.keys(), ...deathsByMatch.keys()]);

        const totalKills = [...killsByMatch.values()].reduce((a, b) => a + b, 0);
        const totalDeaths = [...deathsByMatch.values()].reduce((a, b) => a + b, 0);
        const kda = totalDeaths === 0 ? totalKills : +(totalKills / totalDeaths).toFixed(2);
        const participation = totalMatches > 0 ? +((allMatchIds.size / totalMatches) * 100).toFixed(1) : 0;

        // Per-match KDAs for consistency
        const perMatchKDAs: number[] = [];
        for (const mid of allMatchIds) {
          const k = killsByMatch.get(mid) || 0;
          const d = deathsByMatch.get(mid) || 0;
          perMatchKDAs.push(d === 0 ? k : k / d);
        }
        const consistency = +stdDev(perMatchKDAs).toFixed(2);

        // Trend: last 5 matches vs overall
        // Order matches by date
        const orderedMatchIds = [...allMatchIds].sort((a, b) => {
          const da = matchDateMap.get(a) || '';
          const db = matchDateMap.get(b) || '';
          return da.localeCompare(db);
        });
        const last5 = orderedMatchIds.slice(-5);
        const recentKDAs = last5.map(mid => {
          const k = killsByMatch.get(mid) || 0;
          const d = deathsByMatch.get(mid) || 0;
          return d === 0 ? k : k / d;
        });
        const recentKDA = recentKDAs.length > 0 ? +(recentKDAs.reduce((a, b) => a + b, 0) / recentKDAs.length).toFixed(2) : kda;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (recentKDA > kda * 1.1) trend = 'up';
        else if (recentKDA < kda * 0.9) trend = 'down';

        // Best/worst event
        const eventKills = memberEventKills.get(name) || new Map<string, number>();
        const eventDeaths = memberEventDeaths.get(name) || new Map<string, number>();
        const eventTypes = new Set([...eventKills.keys(), ...eventDeaths.keys()]);
        let bestEvent = '-';
        let worstEvent = '-';
        let bestKDA = -1;
        let worstKDA = Infinity;

        for (const et of eventTypes) {
          const ek = eventKills.get(et) || 0;
          const ed = eventDeaths.get(et) || 0;
          const ekda = ed === 0 ? ek : ek / ed;
          if (ekda > bestKDA) { bestKDA = ekda; bestEvent = et; }
          if (ekda < worstKDA) { worstKDA = ekda; worstEvent = et; }
        }

        const charInfo = charMap.get(name);
        const pilotName = charInfo?.pilot_name || '';

        if (allMatchIds.size > 0) {
          stats.push({
            name,
            className: charInfo?.class || 'Unknown',
            kills: totalKills,
            deaths: totalDeaths,
            kda,
            participation,
            consistency,
            bestEvent,
            worstEvent,
            trend,
            classification: '', // filled after avg calc
            perMatchKDAs,
            recentKDA,
            pilotName,
            pilotStatus: 'none', // will be updated when pilot list is active
          });
        }
      }

      // Classify
      const guildAvgKDA = stats.length > 0 ? stats.reduce((s, m) => s + m.kda, 0) / stats.length : 1;
      for (const m of stats) {
        m.classification = classify(m, guildAvgKDA);
      }

    // Sort by KDA desc
    stats.sort((a, b) => b.kda - a.kda);
    setMembers(stats);
  }, [dataset, guild, eventType]);

  // Pilot import helpers
  const normalizePilotName = (name: string) => name.trim().toLowerCase();

  const handleImportPilotList = () => {
    const lines = pilotListText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Cole ao menos um nome de piloto'); return; }
    setImportedPilots(lines);
    setPilotFilterActive(true);
    toast.success(`${lines.length} pilotos importados`);
  };

  const handlePilotFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
        const names = rows.map(r => {
          const normRow: Record<string, any> = {};
          for (const k of Object.keys(r)) normRow[k.toLowerCase().trim()] = r[k];
          return String(normRow['piloto'] || normRow['pilot'] || normRow['nome'] || normRow['name'] || Object.values(r)[0] || '').trim();
        }).filter(Boolean);
        setImportedPilots(names);
        setPilotFilterActive(true);
        setPilotListText(names.join('\n'));
        toast.success(`${names.length} pilotos importados do arquivo`);
      };
      reader.readAsBinaryString(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const names = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        setImportedPilots(names);
        setPilotFilterActive(true);
        setPilotListText(names.join('\n'));
        toast.success(`${names.length} pilotos importados do arquivo`);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const clearPilotFilter = () => {
    setImportedPilots([]);
    setPilotFilterActive(false);
    setPilotListText('');
  };

  // Build pilot availability map
  const pilotAvailability = useMemo(() => {
    if (!pilotFilterActive || importedPilots.length === 0) return null;
    const guildChars = allCharacters.filter(c => c.guild === guild && !c.banned);
    const pilotSet = new Set(importedPilots.map(normalizePilotName));
    const availableChars = guildChars.filter(c => c.pilot_name && pilotSet.has(normalizePilotName(c.pilot_name)));
    const availableCharNames = new Set(availableChars.map(c => c.name));
    const noPilotChars = guildChars.filter(c => !c.pilot_name);
    const assignedPilots = new Set(guildChars.filter(c => c.pilot_name).map(c => normalizePilotName(c.pilot_name)));
    const orphanPilots = importedPilots.filter(p => !assignedPilots.has(normalizePilotName(p)));
    return { availableCharNames, noPilotChars, orphanPilots, availableChars };
  }, [pilotFilterActive, importedPilots, allCharacters, guild]);

  // Score helper
  const scorePlayer = (m: MemberStats) => ({
    ...m,
    score: m.kda * 0.4 + (1 / (1 + m.consistency)) * 3 * 0.3 + (m.participation / 100) * 3 * 0.3,
  });

  type ScoredMember = MemberStats & { score: number };

  // Enrich members with pilot status
  const enrichedMembers = useMemo(() => {
    if (!pilotFilterActive || !pilotAvailability) {
      return members.map(m => ({ ...m, pilotStatus: 'none' as PilotStatus }));
    }
    return members.map(m => {
      let status: PilotStatus;
      if (pilotAvailability.availableCharNames.has(m.name)) {
        status = 'available';
      } else if (!m.pilotName) {
        status = 'no_pilot';
      } else {
        status = 'unavailable';
      }
      return { ...m, pilotStatus: status };
    });
  }, [members, pilotFilterActive, pilotAvailability]);

  // Performance-first team selection with pilot availability as tiebreaker
  const selectTeamByPools = useCallback((pool: MemberStats[], maxSize: number): { team: ScoredMember[]; reserves: ScoredMember[] } => {
    const scored = pool.map(scorePlayer);

    if (!pilotFilterActive) {
      scored.sort((a, b) => b.score - a.score);
      const team = scored.filter(m => m.classification !== 'Reserva').slice(0, maxSize);
      const reserves = scored.filter(s => !team.find(t => t.name === s.name));
      return { team, reserves };
    }

    // Sort by score DESC, using pilot availability as tiebreaker when scores are within 5%
    const pilotPriority: Record<string, number> = { available: 0, no_pilot: 1, unavailable: 2 };
    scored.sort((a, b) => {
      const diff = Math.abs(a.score - b.score);
      const threshold = Math.max(a.score, b.score) * 0.05;
      if (diff <= threshold) {
        const pA = pilotPriority[a.pilotStatus ?? 'no_pilot'] ?? 1;
        const pB = pilotPriority[b.pilotStatus ?? 'no_pilot'] ?? 1;
        if (pA !== pB) return pA - pB;
      }
      return b.score - a.score;
    });

    const team = scored.slice(0, maxSize);
    const reserves = scored.slice(maxSize);
    return { team, reserves };
  }, [pilotFilterActive]);

  // Suggested composition
  const { suggestedTeam, suggestedReserves } = useMemo(() => {
    if (enrichedMembers.length === 0) return { suggestedTeam: [] as ScoredMember[], suggestedReserves: [] as ScoredMember[] };
    const maxSize = TEAM_SIZE[eventType] || 25;
    const { team, reserves } = selectTeamByPools(enrichedMembers, maxSize);
    return { suggestedTeam: team, suggestedReserves: reserves };
  }, [enrichedMembers, eventType, selectTeamByPools]);

  // Arka War composition: 4 parties of 5, each must have 1 Darkness Wizard
  const arkaWarParties = useMemo(() => {
    if (enrichedMembers.length === 0 || eventType !== 'arka_war') return null;

    const pilotPriority: Record<string, number> = { available: 0, no_pilot: 1, unavailable: 2 };
    const scored = enrichedMembers.map(scorePlayer).sort((a, b) => {
      if (pilotFilterActive) {
        const diff = Math.abs(a.score - b.score);
        const threshold = Math.max(a.score, b.score) * 0.05;
        if (diff <= threshold) {
          const pA = pilotPriority[a.pilotStatus ?? 'no_pilot'] ?? 1;
          const pB = pilotPriority[b.pilotStatus ?? 'no_pilot'] ?? 1;
          if (pA !== pB) return pA - pB;
        }
      }
      return b.score - a.score;
    });

    const prioritized = scored.filter(m => pilotFilterActive || m.classification !== 'Reserva');

    const DW_CLASS = 'Darkness Wizard';
    const EE_CLASS = 'Elf Elder';

    const dwPlayers = prioritized.filter(s => s.className === DW_CLASS);
    const eePlayers = prioritized.filter(s => s.className === EE_CLASS);

    if (dwPlayers.length < 4) {
      return { error: `Necessário pelo menos 4 ${DW_CLASS}, encontrados: ${dwPlayers.length}`, parties: [], reserve: [], eeReserve: null as ScoredMember | null };
    }

    const parties: ScoredMember[][] = [[], [], [], []];
    const used = new Set<string>();

    for (let i = 0; i < 4; i++) {
      parties[i].push(dwPlayers[i]);
      used.add(dwPlayers[i].name);
    }

    let eeReserve: ScoredMember | null = null;
    if (eePlayers.length >= 2) {
      parties[0].push(eePlayers[0]);
      used.add(eePlayers[0].name);
      eeReserve = eePlayers[1];
      used.add(eePlayers[1].name);
    } else if (eePlayers.length === 1) {
      parties[0].push(eePlayers[0]);
      used.add(eePlayers[0].name);
    }

    const fillPool = prioritized.filter(s => !used.has(s.name));
    for (let i = 0; i < 4; i++) {
      while (parties[i].length < 5 && fillPool.length > 0) {
        const next = fillPool.shift()!;
        parties[i].push(next);
        used.add(next.name);
      }
    }

    const reserve = scored.filter(s => !used.has(s.name) && s.name !== eeReserve?.name);
    return { error: null, parties, reserve, eeReserve };
  }, [enrichedMembers, eventType, pilotFilterActive]);

  const generateAIInsights = async () => {
    if (members.length === 0) return;
    setAiLoading(true);
    setAiInsights('');

    try {
      const summary = {
        guild,
        totalMembers: members.length,
        guildAvgKDA: +(members.reduce((s, m) => s + m.kda, 0) / members.length).toFixed(2),
        members: members.map(m => ({
          name: m.name,
          class: m.className,
          kills: m.kills,
          deaths: m.deaths,
          kda: m.kda,
          participation: m.participation + '%',
          consistency: m.consistency,
          classification: m.classification,
          trend: m.trend,
          bestEvent: eventLabel(m.bestEvent),
          worstEvent: eventLabel(m.worstEvent),
          recentKDA: m.recentKDA,
        })),
        suggestedTeam: suggestedTeam.map(s => ({ name: s.name, class: s.className, score: +s.score.toFixed(2) })),
        classDistribution: Object.fromEntries(
          [...new Set(members.map(m => m.className))].map(c => [c, members.filter(m => m.className === c).length])
        ),
        analysisType: 'team_building',
      };

      const resp = await supabase.functions.invoke('pvp-ai-insights', { body: { summary } });
      if (resp.error) throw resp.error;
      if (resp.data?.error) {
        if (resp.data.status === 429) toast.error('Rate limit atingido. Tente novamente em alguns segundos.');
        else if (resp.data.status === 402) toast.error('Créditos insuficientes para IA.');
        else toast.error(resp.data.error);
        return;
      }
      setAiInsights(resp.data?.insights || 'Nenhum insight gerado.');
    } catch (err: any) {
      toast.error('Erro ao gerar insights: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {!guild && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Selecione uma guild no filtro superior para analisar o desempenho dos membros e montar a melhor formação.
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Analisando membros...</span>
        </div>
      )}

      {!loading && guild && members.length > 0 && (
        <>
          {/* Pilot Import Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Lista de Pilotos Disponíveis
                {pilotFilterActive && (
                  <Badge variant="default" className="ml-2 gap-1">
                    <UserCheck className="w-3 h-3" />
                    {importedPilots.length} pilotos
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Importe a lista de pilotos disponíveis. O sistema priorizará personagens com piloto na lista, complementará com personagens sem piloto definido, e rebaixará para reserva quem tiver desempenho inferior — mesmo com piloto disponível.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Textarea
                    placeholder="Cole os nomes dos pilotos (um por linha)..."
                    value={pilotListText}
                    onChange={(e) => setPilotListText(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleImportPilotList} size="sm" className="gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Aplicar Lista
                    </Button>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" asChild className="gap-1">
                        <span>
                          <Upload className="w-4 h-4" />
                          Importar Arquivo
                        </span>
                      </Button>
                      <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handlePilotFileUpload} className="hidden" />
                    </label>
                    {pilotFilterActive && (
                      <Button variant="ghost" size="sm" onClick={clearPilotFilter} className="gap-1 text-destructive">
                        <XCircle className="w-4 h-4" />
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>

                {/* Pilot cross-reference results */}
                {pilotFilterActive && pilotAvailability && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-primary">{pilotAvailability.availableChars.length}</p>
                        <p className="text-xs text-muted-foreground">Disponíveis</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-destructive">{pilotAvailability.orphanPilots.length}</p>
                        <p className="text-xs text-muted-foreground">Sem personagem</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-muted-foreground">{pilotAvailability.noPilotChars.length}</p>
                        <p className="text-xs text-muted-foreground">Sem piloto</p>
                      </div>
                    </div>

                    {pilotAvailability.orphanPilots.length > 0 && (
                      <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5">
                        <p className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                          <UserX className="w-3 h-3" /> Pilotos sem personagem cadastrado:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {pilotAvailability.orphanPilots.map(p => (
                            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {pilotAvailability.noPilotChars.length > 0 && (
                      <div className="border border-border rounded-lg p-3 bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Personagens sem piloto definido:</p>
                        <div className="flex flex-wrap gap-1">
                          {pilotAvailability.noPilotChars.slice(0, 20).map(c => (
                            <Badge key={c.name} variant="outline" className="text-xs">{c.name}</Badge>
                          ))}
                          {pilotAvailability.noPilotChars.length > 20 && (
                            <Badge variant="outline" className="text-xs">+{pilotAvailability.noPilotChars.length - 20} mais</Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Members Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {pilotFilterActive ? `Membros de ${guild} (${enrichedMembers.length})` : `Membros de ${guild} (${members.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Jogador</TableHead>
                      {pilotFilterActive && <TableHead>Piloto</TableHead>}
                      <TableHead>Classe</TableHead>
                      <TableHead>Kills</TableHead>
                      <TableHead>Deaths</TableHead>
                      <TableHead>KDA</TableHead>
                      <TableHead>Participação</TableHead>
                      <TableHead>Consistência</TableHead>
                      <TableHead>Tendência</TableHead>
                      <TableHead>Classificação</TableHead>
                      {pilotFilterActive && <TableHead>Status</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrichedMembers.map((m, i) => (
                      <TableRow key={m.name} className={m.pilotStatus === 'unavailable' ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">{i + 1}</TableCell>
                        <TableCell className="font-semibold">{m.name}</TableCell>
                        {pilotFilterActive && <TableCell className="text-xs">{m.pilotName || '—'}</TableCell>}
                        <TableCell>{m.className}</TableCell>
                        <TableCell className="text-green-500">{m.kills}</TableCell>
                        <TableCell className="text-red-500">{m.deaths}</TableCell>
                        <TableCell className="font-bold">{m.kda}</TableCell>
                        <TableCell>{m.participation}%</TableCell>
                        <TableCell>
                          <span className={m.consistency < 0.5 ? 'text-green-500' : m.consistency > 1.5 ? 'text-red-500' : 'text-yellow-500'}>
                            {m.consistency}
                          </span>
                        </TableCell>
                        <TableCell>{trendIcon(m.trend)}</TableCell>
                        <TableCell>{classificationBadge(m.classification)}</TableCell>
                        {pilotFilterActive && (
                          <TableCell>
                            {m.pilotStatus === 'available' && <Badge variant="default" className="text-xs gap-1"><UserCheck className="w-3 h-3" />Disponível</Badge>}
                            {m.pilotStatus === 'no_pilot' && <Badge variant="secondary" className="text-xs">Sem piloto</Badge>}
                            {m.pilotStatus === 'unavailable' && <Badge variant="destructive" className="text-xs gap-1"><UserX className="w-3 h-3" />Indisponível</Badge>}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Arka War Party Composition */}
          {eventType === 'arka_war' && arkaWarParties && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Composição Arka War — 4 PTs de 5
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Cada PT possui obrigatoriamente 1 Darkness Wizard. 2 Elf Elder no total: 1 escalado, 1 reserva.
                </p>

                {arkaWarParties.error && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {arkaWarParties.error}
                  </div>
                )}

                {!arkaWarParties.error && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {arkaWarParties.parties.map((party, pi) => (
                      <div key={pi} className="border border-border rounded-lg p-4 bg-card space-y-3">
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          PT {pi + 1}
                        </h4>
                        <div className="space-y-2">
                          {party.map(p => (
                            <div key={p.name} className="flex items-center justify-between gap-2 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold truncate">{p.name}</span>
                                <Badge variant={p.className === 'Darkness Wizard' ? 'default' : p.className === 'Elf Elder' ? 'secondary' : 'outline'} className="text-xs shrink-0">
                                  {p.className}
                                </Badge>
                                {pilotFilterActive && p.pilotStatus === 'available' && (
                                  <Badge variant="default" className="text-xs shrink-0 gap-1"><UserCheck className="w-3 h-3" />{p.pilotName}</Badge>
                                )}
                                {pilotFilterActive && p.pilotStatus === 'no_pilot' && (
                                  <Badge variant="outline" className="text-xs shrink-0">Sem piloto</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                                <span>KDA: {p.kda}</span>
                                <span>Score: {p.score.toFixed(1)}</span>
                                {trendIcon(p.trend)}
                              </div>
                            </div>
                          ))}
                          {party.length < 5 && (
                            <p className="text-xs text-destructive italic">⚠ Vaga não preenchida ({5 - party.length} restante)</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* EE Reserve */}
                {arkaWarParties.eeReserve && (
                  <div className="border border-dashed border-border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      Elf Elder Reserva (fora da composição)
                    </h4>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{arkaWarParties.eeReserve.name}</span>
                      <Badge variant="secondary" className="text-xs">Elf Elder</Badge>
                      <span className="text-xs text-muted-foreground">KDA: {arkaWarParties.eeReserve.kda} | Score: {arkaWarParties.eeReserve.score.toFixed(1)}</span>
                    </div>
                  </div>
                )}

                {/* Other reserves */}
                {arkaWarParties.reserve && arkaWarParties.reserve.length > 0 && (
                  <div className="border border-dashed border-border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      Reservas ({arkaWarParties.reserve.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {arkaWarParties.reserve.map(r => (
                        <Badge key={r.name} variant="outline" className="text-xs gap-1">
                          {r.name} ({r.className})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generic Suggested Composition (non-arka_war) */}
          {eventType !== 'arka_war' && suggestedTeam.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Composição Sugerida ({suggestedTeam.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {pilotFilterActive
                    ? 'Formação prioriza pilotos disponíveis, complementada por personagens sem piloto e por desempenho.'
                    : 'Melhor formação baseada em KDA, consistência e participação.'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {suggestedTeam.map(s => (
                    <div key={s.name} className={`border rounded-lg p-3 text-center space-y-1 bg-card ${
                      s.pilotStatus === 'available' ? 'border-primary/50' :
                      s.pilotStatus === 'no_pilot' ? 'border-border' : 'border-destructive/30'
                    }`}>
                      <p className="font-semibold text-sm truncate">{s.name}</p>
                      <Badge variant="secondary" className="text-xs">{s.className}</Badge>
                      <p className="text-xs text-muted-foreground">KDA: {s.kda} | Score: {s.score.toFixed(1)}</p>
                      {classificationBadge(s.classification)}
                      {pilotFilterActive && s.pilotStatus === 'available' && (
                        <Badge variant="default" className="text-xs gap-1 mt-1"><UserCheck className="w-3 h-3" />{s.pilotName}</Badge>
                      )}
                      {pilotFilterActive && s.pilotStatus === 'no_pilot' && (
                        <Badge variant="outline" className="text-xs mt-1">Sem piloto</Badge>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground">Composição por classe:</span>
                  {Object.entries(
                    suggestedTeam.reduce<Record<string, number>>((acc, s) => {
                      acc[s.className] = (acc[s.className] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([cls, count]) => (
                    <Badge key={cls} variant="outline" className="text-xs">{count}x {cls}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reserves Section */}
          {pilotFilterActive && suggestedReserves.length > 0 && eventType !== 'arka_war' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  Reservas ({suggestedReserves.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Reserves with available pilot (benched by performance) */}
                {(() => {
                  const benchedWithPilot = suggestedReserves.filter(r => r.pilotStatus === 'available');
                  if (benchedWithPilot.length === 0) return null;
                  return (
                    <div className="border border-yellow-500/30 rounded-lg p-4 bg-yellow-500/5">
                      <h4 className="font-bold text-sm mb-3 flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        Piloto disponível — reserva por desempenho
                      </h4>
                      <div className="space-y-2">
                        {benchedWithPilot.map(r => (
                          <div key={r.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{r.name}</span>
                              <Badge variant="secondary" className="text-xs">{r.className}</Badge>
                              <Badge variant="outline" className="text-xs">Piloto: {r.pilotName}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">KDA: {r.kda} | Score: {r.score.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Reserves with unavailable pilot */}
                {(() => {
                  const unavailablePilot = suggestedReserves.filter(r => r.pilotStatus === 'unavailable');
                  if (unavailablePilot.length === 0) return null;
                  return (
                    <div className="border border-border rounded-lg p-4 bg-muted/30">
                      <h4 className="font-bold text-sm mb-2 flex items-center gap-2 text-muted-foreground">
                        <UserX className="w-4 h-4" />
                        Piloto indisponível
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {unavailablePilot.map(r => (
                          <Badge key={r.name} variant="outline" className="text-xs gap-1">
                            {r.name} ({r.className}) — {r.pilotName}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* AI Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="w-5 h-5 text-primary" />
                Análise Tática IA — {guild}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A IA analisa os dados dos membros e sugere escalação, pontos a melhorar e composição ideal.
              </p>
              <Button onClick={generateAIInsights} disabled={aiLoading} className="gap-2">
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {aiLoading ? 'Analisando...' : 'Gerar Análise de Escalação'}
              </Button>
              {aiInsights && (
                <div className="bg-card border border-border rounded-lg p-4 whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                  {aiInsights}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!loading && guild && members.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum membro encontrado com dados PvP para esta guild no período selecionado.
          </CardContent>
        </Card>
      )}
    </div>
  );
};
