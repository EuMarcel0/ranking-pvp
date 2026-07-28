import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Skull, Target, Trophy, Flame, Crosshair, Users } from 'lucide-react';
import { AnalyticsFilters, filterByClass } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';
import { PlayerEventDevelopment } from './PlayerEventDevelopment';

interface Props {
  filters: AnalyticsFilters;
}

interface PlayerStat {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
  className: string;
  guild: string;
  uniqueVictims: number;
  rivalKilled: { name: string; count: number } | null;
  rivalDiedTo: { name: string; count: number } | null;
  firstBloods: number;
  maxKillStreak: number;
}

export const PlayerAnalytics = ({ filters }: Props) => {
  const [search, setSearch] = useState('');
  const { data: dataset, isLoading } = useAnalyticsDataset(filters);

  // Heavy aggregation derived from the shared dataset cache.
  // Optimized: kill streaks are computed in a SINGLE pass per match
  // (O(L) instead of O(P×M×L) which previously froze the UI).
  const data = useMemo<PlayerStat[] | null>(() => {
    if (!dataset) return null;

    const logs = filterByClass(dataset.logs, filters.playerClass, dataset.charMap);
    const charMap = dataset.charMap;

    // ---- Pass 1: group logs by match (preserve original chronological order) ----
    const logsByMatch = new Map<string, typeof logs>();
    for (const l of logs) {
      let arr = logsByMatch.get(l.match_id);
      if (!arr) {
        arr = [];
        logsByMatch.set(l.match_id, arr);
      }
      arr.push(l);
    }

    // ---- Pass 2: per-player aggregates + per-match max streak in ONE walk ----
    interface Agg {
      kills: number;
      deaths: number;
      killsTo: Map<string, number>;
      deathsFrom: Map<string, number>;
      firstBloods: number;
      victims: Set<string>;
      maxStreak: number;
      currentStreakInMatch: number; // reset between matches
      currentMatchId: string | null;
    }
    const players = new Map<string, Agg>();
    const getP = (name: string): Agg => {
      let p = players.get(name);
      if (!p) {
        p = {
          kills: 0,
          deaths: 0,
          killsTo: new Map(),
          deathsFrom: new Map(),
          firstBloods: 0,
          victims: new Set(),
          maxStreak: 0,
          currentStreakInMatch: 0,
          currentMatchId: null,
        };
        players.set(name, p);
      }
      return p;
    };

    for (const [matchId, matchLogs] of logsByMatch) {
      // First blood = first killer in this match
      if (matchLogs.length > 0) {
        getP(matchLogs[0].killer_name).firstBloods++;
      }

      // Reset streaks for any player active in this match (handled lazily below)
      for (const l of matchLogs) {
        const killer = getP(l.killer_name);
        const victim = getP(l.victim_name);

        // Reset killer streak when entering a new match
        if (killer.currentMatchId !== matchId) {
          killer.currentMatchId = matchId;
          killer.currentStreakInMatch = 0;
        }
        if (victim.currentMatchId !== matchId) {
          victim.currentMatchId = matchId;
          victim.currentStreakInMatch = 0;
        }

        // Aggregate
        killer.kills++;
        victim.deaths++;
        killer.killsTo.set(l.victim_name, (killer.killsTo.get(l.victim_name) || 0) + 1);
        victim.deathsFrom.set(l.killer_name, (victim.deathsFrom.get(l.killer_name) || 0) + 1);
        killer.victims.add(l.victim_name);

        // Streak update: killer +1, victim resets
        killer.currentStreakInMatch++;
        if (killer.currentStreakInMatch > killer.maxStreak) {
          killer.maxStreak = killer.currentStreakInMatch;
        }
        victim.currentStreakInMatch = 0;
      }
    }

    // ---- Pass 3: build final stats ----
    const stats: PlayerStat[] = [];
    for (const [name, p] of players) {
      const char = charMap.get(name);

      // When a class filter is active, only include players whose OWN class
      // matches it. The shared `filterByClass` keeps logs where killer OR
      // victim matches (needed for matchup analytics), but in the Players
      // tab that leaks players of other classes into the rankings.
      if (filters.playerClass && char?.class !== filters.playerClass) {
        continue;
      }

      let rivalKilled: PlayerStat['rivalKilled'] = null;
      let maxKillsTo = 0;
      for (const [vName, count] of p.killsTo) {
        if (count > maxKillsTo) {
          maxKillsTo = count;
          rivalKilled = { name: vName, count };
        }
      }

      let rivalDiedTo: PlayerStat['rivalDiedTo'] = null;
      let maxDeathsFrom = 0;
      for (const [kName, count] of p.deathsFrom) {
        if (count > maxDeathsFrom) {
          maxDeathsFrom = count;
          rivalDiedTo = { name: kName, count };
        }
      }

      stats.push({
        name,
        kills: p.kills,
        deaths: p.deaths,
        kda: p.deaths === 0 ? p.kills : Math.round((p.kills / p.deaths) * 100) / 100,
        className: char?.class || '',
        guild: char?.guild || '',
        uniqueVictims: p.victims.size,
        rivalKilled,
        rivalDiedTo,
        firstBloods: p.firstBloods,
        maxKillStreak: p.maxStreak,
      });
    }

    return stats;
  }, [dataset, filters.playerClass]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter(p => p.name.toLowerCase().includes(s));
  }, [data, search]);

  const selectedPlayer = useMemo(() => {
    if (!search || !data) return null;
    return data.find(p => p.name.toLowerCase() === search.toLowerCase()) || null;
  }, [data, search]);

  const topKillers = useMemo(() => [...(data || [])].sort((a, b) => b.kills - a.kills).slice(0, 10), [data]);
  const topDeaths = useMemo(() => [...(data || [])].sort((a, b) => b.deaths - a.deaths).slice(0, 10), [data]);
  const topKDA = useMemo(() => [...(data || [])].filter(p => p.kills >= 5).sort((a, b) => b.kda - a.kda).slice(0, 10), [data]);

  if (isLoading || !data) {
    return <div className="text-center py-8 text-muted-foreground">Carregando dados dos jogadores...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar jogador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Player Detail Card */}
      {selectedPlayer && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              {selectedPlayer.name}
              {selectedPlayer.className && <Badge variant="outline">{selectedPlayer.className}</Badge>}
              {selectedPlayer.guild && <Badge variant="secondary">{selectedPlayer.guild}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Kills" value={selectedPlayer.kills} icon={<Skull className="w-4 h-4 text-destructive" />} />
              <StatCard label="Deaths" value={selectedPlayer.deaths} icon={<Target className="w-4 h-4 text-muted-foreground" />} />
              <StatCard label="KDA" value={selectedPlayer.kda} icon={<Trophy className="w-4 h-4 text-primary" />} />
              <StatCard label="Kill Streak" value={selectedPlayer.maxKillStreak} icon={<Flame className="w-4 h-4 text-warning" />} />
              <StatCard label="First Bloods" value={selectedPlayer.firstBloods} icon={<Crosshair className="w-4 h-4 text-destructive" />} />
              <StatCard label="Vítimas Únicas" value={selectedPlayer.uniqueVictims} icon={<Users className="w-4 h-4 text-muted-foreground" />} />
              {selectedPlayer.rivalKilled && (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Rival que mais matou</p>
                  <p className="text-sm font-bold text-foreground">{selectedPlayer.rivalKilled.name} ({selectedPlayer.rivalKilled.count}x)</p>
                </div>
              )}
              {selectedPlayer.rivalDiedTo && (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Rival que mais morreu</p>
                  <p className="text-sm font-bold text-foreground">{selectedPlayer.rivalDiedTo.name} ({selectedPlayer.rivalDiedTo.count}x)</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Player Development (Evolution) */}
      {selectedPlayer && (
        <PlayerEventDevelopment filters={{ ...filters, playerName: selectedPlayer.name }} />
      )}

      {/* Rankings */}
      <Tabs defaultValue="topKillers">
        <TabsList>
          <TabsTrigger value="topKillers">Top Killers</TabsTrigger>
          <TabsTrigger value="topDeaths">Mais Mortes</TabsTrigger>
          <TabsTrigger value="topKDA">Melhor KDA</TabsTrigger>
          {search && <TabsTrigger value="search">Busca</TabsTrigger>}
        </TabsList>

        <TabsContent value="topKillers">
          <RankTable data={topKillers} sortKey="kills" />
        </TabsContent>
        <TabsContent value="topDeaths">
          <RankTable data={topDeaths} sortKey="deaths" />
        </TabsContent>
        <TabsContent value="topKDA">
          <RankTable data={topKDA} sortKey="kda" />
        </TabsContent>
        {search && (
          <TabsContent value="search">
            <RankTable data={filtered.slice(0, 50)} sortKey="kills" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg p-3 border border-border">
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function RankTable({ data, sortKey }: { data: PlayerStat[]; sortKey: 'kills' | 'deaths' | 'kda' }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Guild</TableHead>
              <TableHead className="text-right">Kills</TableHead>
              <TableHead className="text-right">Deaths</TableHead>
              <TableHead className="text-right">KDA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p, i) => (
              <TableRow key={p.name}>
                <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{p.className || '—'}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-sm">{p.guild || '—'}</TableCell>
                <TableCell className="text-right font-bold text-destructive">{p.kills}</TableCell>
                <TableCell className="text-right text-muted-foreground">{p.deaths}</TableCell>
                <TableCell className="text-right font-bold text-primary">{p.kda}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
