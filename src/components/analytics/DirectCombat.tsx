import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Swords, Shield } from 'lucide-react';
import { AnalyticsFilters } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';

interface Props {
  filters: AnalyticsFilters;
}

export const DirectCombat = ({ filters }: Props) => {
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [guildA, setGuildA] = useState('');
  const [guildB, setGuildB] = useState('');

  const { data: dataset, isLoading } = useAnalyticsDataset(filters);
  const data = useMemo(() => {
    if (!dataset) return null;
    return { logs: dataset.logs, charMap: dataset.charMap, characters: dataset.characters };
  }, [dataset]);

  // Player vs Player
  const pvpResult = useMemo(() => {
    if (!data || !playerA || !playerB) return null;
    const a = playerA.trim();
    const b = playerB.trim();
    if (!a || !b) return null;

    let aKilledB = 0;
    let bKilledA = 0;
    for (const l of data.logs) {
      if (l.killer_name.toLowerCase() === a.toLowerCase() && l.victim_name.toLowerCase() === b.toLowerCase()) aKilledB++;
      if (l.killer_name.toLowerCase() === b.toLowerCase() && l.victim_name.toLowerCase() === a.toLowerCase()) bKilledA++;
    }

    const total = aKilledB + bKilledA;
    return {
      playerA: a, playerB: b,
      aKilledB, bKilledA,
      dominance: total > 0 ? Math.round((aKilledB / total) * 100) : 50,
      winner: aKilledB > bKilledA ? a : bKilledA > aKilledB ? b : 'Empate',
    };
  }, [data, playerA, playerB]);

  // Guild vs Guild
  const gvgResult = useMemo(() => {
    if (!data || !guildA || !guildB || guildA === 'none' || guildB === 'none') return null;

    let aKilledB = 0;
    let bKilledA = 0;
    const aPerformers = new Map<string, number>();
    const bPerformers = new Map<string, number>();

    for (const l of data.logs) {
      const killerGuild = data.charMap.get(l.killer_name)?.guild;
      const victimGuild = data.charMap.get(l.victim_name)?.guild;

      if (killerGuild === guildA && victimGuild === guildB) {
        aKilledB++;
        aPerformers.set(l.killer_name, (aPerformers.get(l.killer_name) || 0) + 1);
      }
      if (killerGuild === guildB && victimGuild === guildA) {
        bKilledA++;
        bPerformers.set(l.killer_name, (bPerformers.get(l.killer_name) || 0) + 1);
      }
    }

    const total = aKilledB + bKilledA;
    const topA = [...aPerformers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topB = [...bPerformers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      guildA, guildB,
      aKilledB, bKilledA,
      dominance: total > 0 ? Math.round((aKilledB / total) * 100) : 50,
      winner: aKilledB > bKilledA ? guildA : bKilledA > aKilledB ? guildB : 'Empate',
      topA, topB,
    };
  }, [data, guildA, guildB]);

  const guilds = useMemo(() => {
    if (!data) return [];
    const gs = new Set<string>();
    for (const c of data.characters) {
      if (!c.banned && c.guild) gs.add(c.guild);
    }
    return [...gs].sort();
  }, [data]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando dados de confrontos...</div>;
  }

  return (
    <Tabs defaultValue="pvp">
      <TabsList>
        <TabsTrigger value="pvp" className="gap-1"><Swords className="w-3 h-3" /> Player vs Player</TabsTrigger>
        <TabsTrigger value="gvg" className="gap-1"><Shield className="w-3 h-3" /> Guild vs Guild</TabsTrigger>
      </TabsList>

      <TabsContent value="pvp" className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Input placeholder="Player A" value={playerA} onChange={e => setPlayerA(e.target.value)} className="max-w-[200px]" />
          <span className="text-muted-foreground font-bold">VS</span>
          <Input placeholder="Player B" value={playerB} onChange={e => setPlayerB(e.target.value)} className="max-w-[200px]" />
        </div>

        {pvpResult && (
          <Card className="border-primary/30">
            <CardContent className="p-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-foreground">{pvpResult.playerA}</p>
                  <p className="text-3xl font-bold text-primary">{pvpResult.aKilledB}</p>
                  <p className="text-xs text-muted-foreground">kills</p>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <Swords className="w-8 h-8 text-muted-foreground mb-2" />
                  <Badge variant={pvpResult.winner === pvpResult.playerA ? 'default' : pvpResult.winner === pvpResult.playerB ? 'destructive' : 'secondary'}>
                    {pvpResult.winner}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">Dominância: {pvpResult.dominance}%</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{pvpResult.playerB}</p>
                  <p className="text-3xl font-bold text-destructive">{pvpResult.bKilledA}</p>
                  <p className="text-xs text-muted-foreground">kills</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="gvg" className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Select value={guildA || 'none'} onValueChange={v => setGuildA(v === 'none' ? '' : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Guild A" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Guild A...</SelectItem>
              {guilds.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground font-bold">VS</span>
          <Select value={guildB || 'none'} onValueChange={v => setGuildB(v === 'none' ? '' : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Guild B" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Guild B...</SelectItem>
              {guilds.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {gvgResult && (
          <div className="space-y-4">
            <Card className="border-primary/30">
              <CardContent className="p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{gvgResult.guildA}</p>
                    <p className="text-3xl font-bold text-primary">{gvgResult.aKilledB}</p>
                    <p className="text-xs text-muted-foreground">kills</p>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <Shield className="w-8 h-8 text-muted-foreground mb-2" />
                    <Badge variant={gvgResult.winner === gvgResult.guildA ? 'default' : gvgResult.winner === gvgResult.guildB ? 'destructive' : 'secondary'}>
                      {gvgResult.winner}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">Dominância: {gvgResult.dominance}%</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{gvgResult.guildB}</p>
                    <p className="text-3xl font-bold text-destructive">{gvgResult.bKilledA}</p>
                    <p className="text-xs text-muted-foreground">kills</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top performers */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Top de {gvgResult.guildA}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Player</TableHead><TableHead className="text-right">Kills</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {gvgResult.topA.map(([name, kills]) => (
                        <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="text-right font-bold text-primary">{kills}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Top de {gvgResult.guildB}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Player</TableHead><TableHead className="text-right">Kills</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {gvgResult.topB.map(([name, kills]) => (
                        <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="text-right font-bold text-primary">{kills}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};
