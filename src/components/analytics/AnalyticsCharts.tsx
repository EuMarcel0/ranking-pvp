import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AnalyticsFilters } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';

interface Props {
  filters: AnalyticsFilters;
}

const COLORS = ['hsl(190, 95%, 55%)', 'hsl(0, 85%, 60%)', 'hsl(142, 76%, 45%)', 'hsl(45, 100%, 50%)', 'hsl(270, 70%, 60%)', 'hsl(30, 90%, 55%)'];

export const AnalyticsCharts = ({ filters }: Props) => {
  const [chartPlayer, setChartPlayer] = useState('');

  const { data: dataset, isLoading } = useAnalyticsDataset(filters);
  const data = useMemo(() => {
    if (!dataset) return null;
    return {
      logs: dataset.logs,
      charMap: dataset.charMap,
      matchDateMap: dataset.matchDateMap,
      characters: dataset.characters,
    };
  }, [dataset]);

  // Player kills/deaths per day
  const playerDailyData = useMemo(() => {
    if (!data || !chartPlayer) return [];
    const name = chartPlayer.trim().toLowerCase();
    const dailyKills = new Map<string, number>();
    const dailyDeaths = new Map<string, number>();

    for (const l of data.logs) {
      const date = data.matchDateMap.get(l.match_id);
      if (!date) continue;

      if (l.killer_name.toLowerCase() === name) {
        dailyKills.set(date, (dailyKills.get(date) || 0) + 1);
      }
      if (l.victim_name.toLowerCase() === name) {
        dailyDeaths.set(date, (dailyDeaths.get(date) || 0) + 1);
      }
    }

    const allDates = new Set([...dailyKills.keys(), ...dailyDeaths.keys()]);
    return [...allDates].sort().map(date => ({
      date,
      kills: dailyKills.get(date) || 0,
      deaths: dailyDeaths.get(date) || 0,
      kda: (dailyDeaths.get(date) || 0) === 0
        ? (dailyKills.get(date) || 0)
        : Math.round(((dailyKills.get(date) || 0) / (dailyDeaths.get(date) || 1)) * 100) / 100,
    }));
  }, [data, chartPlayer]);

  // Class distribution
  const classDistribution = useMemo(() => {
    if (!data) return [];
    const classCounts = new Map<string, number>();
    const players = new Set<string>();

    for (const l of data.logs) {
      players.add(l.killer_name);
      players.add(l.victim_name);
    }

    for (const name of players) {
      const cls = data.charMap.get(name)?.class || 'Desconhecido';
      classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
    }

    return [...classCounts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  // Guild kills
  const guildKillsChart = useMemo(() => {
    if (!data) return [];
    const guildKills = new Map<string, number>();
    const guildDeaths = new Map<string, number>();

    for (const l of data.logs) {
      const kg = data.charMap.get(l.killer_name)?.guild;
      const vg = data.charMap.get(l.victim_name)?.guild;
      if (kg) guildKills.set(kg, (guildKills.get(kg) || 0) + 1);
      if (vg) guildDeaths.set(vg, (guildDeaths.get(vg) || 0) + 1);
    }

    const allGuilds = new Set([...guildKills.keys(), ...guildDeaths.keys()]);
    return [...allGuilds]
      .map(g => ({ guild: g, kills: guildKills.get(g) || 0, deaths: guildDeaths.get(g) || 0 }))
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 10);
  }, [data]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando gráficos...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Player daily chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Evolução do Jogador</CardTitle>
          <Input
            placeholder="Nome do jogador..."
            value={chartPlayer}
            onChange={e => setChartPlayer(e.target.value)}
            className="max-w-[250px] mt-2"
          />
        </CardHeader>
        <CardContent>
          {playerDailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={playerDailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                <XAxis dataKey="date" tick={{ fill: 'hsl(210, 20%, 65%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(210, 20%, 65%)', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 10%)', border: '1px solid hsl(220, 20%, 20%)' }} />
                <Legend />
                <Line type="monotone" dataKey="kills" stroke="hsl(0, 85%, 60%)" name="Kills" strokeWidth={2} />
                <Line type="monotone" dataKey="deaths" stroke="hsl(210, 20%, 65%)" name="Deaths" strokeWidth={2} />
                <Line type="monotone" dataKey="kda" stroke="hsl(190, 95%, 55%)" name="KDA" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {chartPlayer ? 'Nenhum dado encontrado para este jogador' : 'Digite o nome de um jogador'}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Class Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Distribuição de Classes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={classDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {classDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 10%)', border: '1px solid hsl(220, 20%, 20%)' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Guild Performance */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Performance por Guild (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={guildKillsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 20%)" />
                <XAxis dataKey="guild" tick={{ fill: 'hsl(210, 20%, 65%)', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fill: 'hsl(210, 20%, 65%)', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 25%, 10%)', border: '1px solid hsl(220, 20%, 20%)' }} />
                <Legend />
                <Bar dataKey="kills" fill="hsl(142, 76%, 45%)" name="Kills" />
                <Bar dataKey="deaths" fill="hsl(0, 85%, 60%)" name="Deaths" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
