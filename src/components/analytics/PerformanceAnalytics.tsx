import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trophy, Users, User, Search } from 'lucide-react';
import { AnalyticsFilters } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';

interface Props {
  filters: AnalyticsFilters;
}

const EVENT_LABELS: Record<string, string> = {
  boss_event: 'Boss Event',
  throne_conquest: 'Throne Conquest',
  arka_war: 'Arka War',
};

interface PerfRow {
  key: string;
  label: string;
  subLabel?: string;
  eventType: string;
  kills: number;
  deaths: number;
  kda: number;
  matches: number;
  score: number; // performance score per event participation
}

// Performance score: (kills*3) + (kda*1) + (matches*1) - (deaths*3), normalized per match count
function scoreOf(k: number, d: number, m: number): number {
  const kda = d === 0 ? k : k / d;
  const raw = (k * 3) + (kda * 1) + (m * 1) - (d * 3);
  return m === 0 ? raw : raw / m;
}

export const PerformanceAnalytics = ({ filters }: Props) => {
  const { data: dataset, isLoading } = useAnalyticsDataset(filters);
  const [eventFocus, setEventFocus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    if (!dataset) return null;
    const { logs, charMap, matchTypeMap } = dataset;

    const guildFilter = filters.guild;
    const inGuild = (n: string) => !guildFilter || guildFilter === 'all' || charMap.get(n)?.guild === guildFilter;

    // Group kills by (event_type, player) — respecting guild filter on the player itself.
    // For each kill, count for killer (kill) and victim (death) only if that player belongs to filtered guild.
    type Agg = { k: number; d: number; matches: Set<string> };
    const playerByEvent = new Map<string, Map<string, Agg>>(); // event -> player -> agg
    const classByEvent = new Map<string, Map<string, Agg>>(); // event -> class -> agg

    const ensure = (map: Map<string, Map<string, Agg>>, ev: string, key: string) => {
      if (!map.has(ev)) map.set(ev, new Map());
      const inner = map.get(ev)!;
      if (!inner.has(key)) inner.set(key, { k: 0, d: 0, matches: new Set() });
      return inner.get(key)!;
    };

    for (const l of logs) {
      const ev = matchTypeMap.get(l.match_id) || 'unknown';
      const killerInfo = charMap.get(l.killer_name);
      const victimInfo = charMap.get(l.victim_name);

      if (inGuild(l.killer_name)) {
        const a = ensure(playerByEvent, ev, l.killer_name);
        a.k++;
        a.matches.add(l.match_id);
        const cls = killerInfo?.class || 'Desconhecido';
        const ca = ensure(classByEvent, ev, cls);
        ca.k++;
        ca.matches.add(l.match_id + '|' + l.killer_name);
      }
      if (inGuild(l.victim_name)) {
        const a = ensure(playerByEvent, ev, l.victim_name);
        a.d++;
        a.matches.add(l.match_id);
        const cls = victimInfo?.class || 'Desconhecido';
        const ca = ensure(classByEvent, ev, cls);
        ca.d++;
        ca.matches.add(l.match_id + '|' + l.victim_name);
      }
    }

    const classRows: PerfRow[] = [];
    for (const [ev, inner] of classByEvent) {
      for (const [cls, a] of inner) {
        if (cls === 'Desconhecido') continue;
        const m = a.matches.size; // unique (match,player) participations
        classRows.push({
          key: `${ev}|${cls}`,
          label: cls,
          eventType: ev,
          kills: a.k,
          deaths: a.d,
          kda: a.d === 0 ? a.k : Math.round((a.k / a.d) * 100) / 100,
          matches: m,
          score: Math.round(scoreOf(a.k, a.d, m) * 100) / 100,
        });
      }
    }

    const playerRows: PerfRow[] = [];
    for (const [ev, inner] of playerByEvent) {
      for (const [name, a] of inner) {
        const info = charMap.get(name);
        playerRows.push({
          key: `${ev}|${name}`,
          label: name,
          subLabel: `${info?.class || '—'} • ${info?.guild || '—'}`,
          eventType: ev,
          kills: a.k,
          deaths: a.d,
          kda: a.d === 0 ? a.k : Math.round((a.k / a.d) * 100) / 100,
          matches: a.matches.size,
          score: Math.round(scoreOf(a.k, a.d, a.matches.size) * 100) / 100,
        });
      }
    }

    // Event types present
    const eventTypes = Array.from(new Set([...classRows, ...playerRows].map(r => r.eventType)));

    return { classRows, playerRows, eventTypes };
  }, [dataset, filters.guild]);

  if (isLoading || !data) {
    return <div className="text-center py-8 text-muted-foreground">Carregando indicador de desempenho...</div>;
  }

  const filterByEvent = <T extends PerfRow>(rows: T[]) =>
    eventFocus === 'all' ? rows : rows.filter(r => r.eventType === eventFocus);

  const filteredClasses = filterByEvent(data.classRows).sort((a, b) => b.score - a.score);
  const filteredPlayers = filterByEvent(data.playerRows)
    .filter(r => !search || r.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.score - a.score);

  // Group classes by event for the "por evento" overview
  const classesByEvent = new Map<string, PerfRow[]>();
  for (const r of data.classRows) {
    if (!classesByEvent.has(r.eventType)) classesByEvent.set(r.eventType, []);
    classesByEvent.get(r.eventType)!.push(r);
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-5 h-5 text-warning" />
            Indicador de Desempenho por Evento
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Score = ((kills × 3) + (KDA × 2) − (deaths × 1.5)) ÷ partidas. Respeita os filtros globais (data, hora, guild).
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Evento:</span>
              <Select value={eventFocus} onValueChange={setEventFocus}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {data.eventTypes.map(e => (
                    <SelectItem key={e} value={e}>{EVENT_LABELS[e] || e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes" className="gap-1"><Users className="w-3 h-3" /> Classes</TabsTrigger>
          <TabsTrigger value="players" className="gap-1"><User className="w-3 h-3" /> Personagens</TabsTrigger>
          <TabsTrigger value="byevent" className="gap-1"><Trophy className="w-3 h-3" /> Melhor por Evento</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Aproveitamento por Classe</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-right">Kills</TableHead>
                    <TableHead className="text-right">Deaths</TableHead>
                    <TableHead className="text-right">KDA</TableHead>
                    <TableHead className="text-right">Partic.</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClasses.map((r, i) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.label}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{EVENT_LABELS[r.eventType] || r.eventType}</Badge></TableCell>
                      <TableCell className="text-right text-destructive font-bold">{r.kills}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.deaths}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{r.kda}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.matches}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.score > 0 ? 'default' : 'destructive'}>
                          {r.score > 0 ? '+' : ''}{r.score}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredClasses.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem dados para o filtro selecionado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Aproveitamento por Personagem</CardTitle>
              <div className="relative w-64">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar personagem..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-7 h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Personagem</TableHead>
                    <TableHead>Classe / Guild</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-right">K</TableHead>
                    <TableHead className="text-right">D</TableHead>
                    <TableHead className="text-right">KDA</TableHead>
                    <TableHead className="text-right">Partic.</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlayers.slice(0, 200).map((r, i) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.subLabel}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{EVENT_LABELS[r.eventType] || r.eventType}</Badge></TableCell>
                      <TableCell className="text-right text-destructive font-bold">{r.kills}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.deaths}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{r.kda}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.matches}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.score > 0 ? 'default' : 'destructive'}>
                          {r.score > 0 ? '+' : ''}{r.score}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPlayers.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sem dados para o filtro selecionado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredPlayers.length > 200 && (
                <div className="p-2 text-center text-xs text-muted-foreground">Mostrando top 200 de {filteredPlayers.length}.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="byevent">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from(classesByEvent.entries()).map(([ev, rows]) => {
              const top = [...rows].sort((a, b) => b.score - a.score).slice(0, 5);
              const topPlayers = data.playerRows
                .filter(r => r.eventType === ev)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
              return (
                <Card key={ev}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-warning" />
                      {EVENT_LABELS[ev] || ev}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Top 5 Classes</div>
                      <div className="space-y-1">
                        {top.map((r, i) => (
                          <div key={r.key} className="flex items-center justify-between text-sm">
                            <span><span className="text-muted-foreground mr-2">{i + 1}.</span>{r.label}</span>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">KDA {r.kda}</Badge>
                              <Badge variant={r.score > 0 ? 'default' : 'destructive'} className="text-xs">
                                {r.score > 0 ? '+' : ''}{r.score}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Top 5 Personagens</div>
                      <div className="space-y-1">
                        {topPlayers.map((r, i) => (
                          <div key={r.key} className="flex items-center justify-between text-sm">
                            <span>
                              <span className="text-muted-foreground mr-2">{i + 1}.</span>
                              {r.label} <span className="text-xs text-muted-foreground">({r.subLabel})</span>
                            </span>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">KDA {r.kda}</Badge>
                              <Badge variant={r.score > 0 ? 'default' : 'destructive'} className="text-xs">
                                {r.score > 0 ? '+' : ''}{r.score}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {classesByEvent.size === 0 && (
              <div className="text-center text-muted-foreground py-6 col-span-2">Sem dados para o filtro selecionado.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
