import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Trophy, Skull, Target, Users } from 'lucide-react';
import { AnalyticsFilters } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';

interface Props {
  filters: AnalyticsFilters;
}

interface GuildStat {
  guild: string;
  kills: number;
  deaths: number;
  kda: number;
  members: number;
  matchesPlayed: number;
  topKiller: { name: string; kills: number } | null;
  mostKilledGuild: { guild: string; count: number } | null;
  dominantRival: { guild: string; count: number } | null;
}

export const GuildAnalytics = ({ filters }: Props) => {
  const [selectedGuild, setSelectedGuild] = useState<string>('');

  const { data: dataset, isLoading } = useAnalyticsDataset(filters);

  const data = useMemo<GuildStat[] | null>(() => {
    if (!dataset) return null;
    const { logs, charMap } = dataset;

    // Track unique active players per guild (only those who appear in logs)
      const guildActiveMembers = new Map<string, Set<string>>();
      const guildKills = new Map<string, number>();
      const guildDeaths = new Map<string, number>();
      const guildMatches = new Map<string, Set<string>>();
      const guildPlayerKills = new Map<string, Map<string, number>>();
      const guildVsGuild = new Map<string, Map<string, number>>();

      for (const l of logs) {
        const killerChar = charMap.get(l.killer_name);
        const victimChar = charMap.get(l.victim_name);
        const killerGuild = killerChar?.guild;
        const victimGuild = victimChar?.guild;

        // Track active members per guild (distinct player names)
        if (killerGuild) {
          if (!guildActiveMembers.has(killerGuild)) guildActiveMembers.set(killerGuild, new Set());
          guildActiveMembers.get(killerGuild)!.add(l.killer_name);

          guildKills.set(killerGuild, (guildKills.get(killerGuild) || 0) + 1);
          if (!guildMatches.has(killerGuild)) guildMatches.set(killerGuild, new Set());
          guildMatches.get(killerGuild)!.add(l.match_id);

          if (!guildPlayerKills.has(killerGuild)) guildPlayerKills.set(killerGuild, new Map());
          const pk = guildPlayerKills.get(killerGuild)!;
          pk.set(l.killer_name, (pk.get(l.killer_name) || 0) + 1);

          if (victimGuild && victimGuild !== killerGuild) {
            if (!guildVsGuild.has(killerGuild)) guildVsGuild.set(killerGuild, new Map());
            const vs = guildVsGuild.get(killerGuild)!;
            vs.set(victimGuild, (vs.get(victimGuild) || 0) + 1);
          }
        }

        if (victimGuild) {
          if (!guildActiveMembers.has(victimGuild)) guildActiveMembers.set(victimGuild, new Set());
          guildActiveMembers.get(victimGuild)!.add(l.victim_name);

          guildDeaths.set(victimGuild, (guildDeaths.get(victimGuild) || 0) + 1);
          if (!guildMatches.has(victimGuild)) guildMatches.set(victimGuild, new Set());
          guildMatches.get(victimGuild)!.add(l.match_id);
        }
      }

      // Build stats using only guilds that have active players in the filtered logs
      const stats: GuildStat[] = [];
      const allGuilds = new Set([...guildActiveMembers.keys()]);
      for (const guild of allGuilds) {
        const kills = guildKills.get(guild) || 0;
        const deaths = guildDeaths.get(guild) || 0;
        if (kills === 0 && deaths === 0) continue;
        const activeMembers = guildActiveMembers.get(guild)?.size || 0;

        let topKiller: GuildStat['topKiller'] = null;
        const pk = guildPlayerKills.get(guild);
        if (pk) {
          let max = 0;
          for (const [name, count] of pk) {
            if (count > max) { max = count; topKiller = { name, kills: count }; }
          }
        }

        let mostKilledGuild: GuildStat['mostKilledGuild'] = null;
        let dominantRival: GuildStat['dominantRival'] = null;
        const vsMap = guildVsGuild.get(guild);
        if (vsMap) {
          let maxKilled = 0;
          for (const [g, count] of vsMap) {
            if (count > maxKilled) { maxKilled = count; mostKilledGuild = { guild: g, count }; }
          }
        }
        // Dominant rival: guild that killed us the most
        for (const [otherGuild, otherVs] of guildVsGuild) {
          if (otherGuild === guild) continue;
          const killsAgainstUs = otherVs.get(guild) || 0;
          if (!dominantRival || killsAgainstUs > dominantRival.count) {
            dominantRival = { guild: otherGuild, count: killsAgainstUs };
          }
        }

        stats.push({
          guild,
          kills,
          deaths,
          kda: deaths === 0 ? kills : Math.round((kills / deaths) * 100) / 100,
          members: activeMembers,
          matchesPlayed: guildMatches.get(guild)?.size || 0,
          topKiller,
          mostKilledGuild,
          dominantRival,
        });
      }

    return stats.sort((a, b) => b.kda - a.kda);
  }, [dataset]);

  const guilds = useMemo(() => (data || []).map(g => g.guild).sort(), [data]);
  const detail = useMemo(() => data?.find(g => g.guild === selectedGuild), [data, selectedGuild]);

  if (isLoading || !data) {
    return <div className="text-center py-8 text-muted-foreground">Carregando dados das guilds...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={selectedGuild || 'none'} onValueChange={v => setSelectedGuild(v === 'none' ? '' : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Selecionar guild" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecionar guild...</SelectItem>
            {guilds.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {detail && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {detail.guild}
              <Badge variant="secondary">{detail.members} membros</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card rounded-lg p-3 border border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Skull className="w-3 h-3" />Kills</div>
                <p className="text-lg font-bold text-destructive">{detail.kills}</p>
              </div>
              <div className="bg-card rounded-lg p-3 border border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Target className="w-3 h-3" />Deaths</div>
                <p className="text-lg font-bold text-foreground">{detail.deaths}</p>
              </div>
              <div className="bg-card rounded-lg p-3 border border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Trophy className="w-3 h-3" />KDA</div>
                <p className="text-lg font-bold text-primary">{detail.kda}</p>
              </div>
              <div className="bg-card rounded-lg p-3 border border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Users className="w-3 h-3" />Partidas</div>
                <p className="text-lg font-bold text-foreground">{detail.matchesPlayed}</p>
              </div>
              {detail.topKiller && (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Top Killer</p>
                  <p className="text-sm font-bold text-foreground">{detail.topKiller.name} ({detail.topKiller.kills})</p>
                </div>
              )}
              {detail.mostKilledGuild && (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Guild mais abatida</p>
                  <p className="text-sm font-bold text-foreground">{detail.mostKilledGuild.guild} ({detail.mostKilledGuild.count})</p>
                </div>
              )}
              {detail.dominantRival && (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Rival dominante</p>
                  <p className="text-sm font-bold text-destructive">{detail.dominantRival.guild} ({detail.dominantRival.count})</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guild Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ranking de Guilds</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Guild</TableHead>
                <TableHead className="text-right">Membros</TableHead>
                <TableHead className="text-right">Kills</TableHead>
                <TableHead className="text-right">Deaths</TableHead>
                <TableHead className="text-right">KDA</TableHead>
                <TableHead className="text-right">Partidas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data || []).map((g, i) => (
                <TableRow key={g.guild} className={g.guild === selectedGuild ? 'bg-primary/10' : ''}>
                  <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium text-foreground">{g.guild}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{g.members}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">{g.kills}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{g.deaths}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{g.kda}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{g.matchesPlayed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
