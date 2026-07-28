import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsFilters } from '@/hooks/useAnalyticsData';
import { useAnalyticsDataset } from '@/hooks/useAnalyticsDataset';
import { toast } from 'sonner';

interface Props {
  filters: AnalyticsFilters;
}

export const AIInsights = ({ filters }: Props) => {
  const [insights, setInsights] = useState<string>('');
  const [loading, setLoading] = useState(false);
  // Reuses the shared dataset cache — instant if the user visited any other tab first.
  const { data: dataset, isLoading: datasetLoading } = useAnalyticsDataset(filters);

  const generateInsights = async () => {
    if (!dataset) {
      toast.error('Dados ainda carregando, aguarde...');
      return;
    }
    setLoading(true);
    setInsights('');

    try {
      const { logs, charMap, matchIds } = dataset;

      // Aggregate top players
      const playerKills = new Map<string, number>();
      const playerDeaths = new Map<string, number>();
      const classKills = new Map<string, number>();
      const classDeaths = new Map<string, number>();
      const guildKills = new Map<string, number>();
      const guildDeaths = new Map<string, number>();
      const pvpPairs = new Map<string, { a: string; b: string; aKills: number; bKills: number }>();

      for (const l of logs) {
        playerKills.set(l.killer_name, (playerKills.get(l.killer_name) || 0) + 1);
        playerDeaths.set(l.victim_name, (playerDeaths.get(l.victim_name) || 0) + 1);

        const kc = charMap.get(l.killer_name)?.class || 'Unknown';
        const vc = charMap.get(l.victim_name)?.class || 'Unknown';
        const kg = charMap.get(l.killer_name)?.guild || '';
        const vg = charMap.get(l.victim_name)?.guild || '';

        classKills.set(kc, (classKills.get(kc) || 0) + 1);
        classDeaths.set(vc, (classDeaths.get(vc) || 0) + 1);
        if (kg) guildKills.set(kg, (guildKills.get(kg) || 0) + 1);
        if (vg) guildDeaths.set(vg, (guildDeaths.get(vg) || 0) + 1);

        // Track rivalries
        const pairKey = [l.killer_name, l.victim_name].sort().join('|');
        if (!pvpPairs.has(pairKey)) {
          const [a, b] = [l.killer_name, l.victim_name].sort();
          pvpPairs.set(pairKey, { a, b, aKills: 0, bKills: 0 });
        }
        const pair = pvpPairs.get(pairKey)!;
        if (l.killer_name === pair.a) pair.aKills++;
        else pair.bKills++;
      }

      // Build summary for AI
      const topKillers = [...playerKills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      const topRivalries = [...pvpPairs.values()]
        .map(p => ({ ...p, total: p.aKills + p.bKills }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      const classStats = [...new Set([...classKills.keys(), ...classDeaths.keys()])].map(c => ({
        class: c, kills: classKills.get(c) || 0, deaths: classDeaths.get(c) || 0,
      }));
      const guildStats = [...new Set([...guildKills.keys(), ...guildDeaths.keys()])].map(g => ({
        guild: g, kills: guildKills.get(g) || 0, deaths: guildDeaths.get(g) || 0,
      })).sort((a, b) => b.kills - a.kills).slice(0, 10);

      const summary = {
        totalKills: logs.length,
        totalMatches: matchIds.length,
        topKillers: topKillers.map(([name, kills]) => ({ name, kills, deaths: playerDeaths.get(name) || 0 })),
        topRivalries: topRivalries.map(r => ({
          playerA: r.a, playerB: r.b, aKills: r.aKills, bKills: r.bKills,
          dominance: Math.round((Math.max(r.aKills, r.bKills) / r.total) * 100),
        })),
        classStats,
        guildStats,
      };

      // Call edge function
      const resp = await supabase.functions.invoke('pvp-ai-insights', {
        body: { summary },
      });

      if (resp.error) throw resp.error;

      if (resp.data?.error) {
        if (resp.data.status === 429) {
          toast.error('Rate limit atingido. Tente novamente em alguns segundos.');
        } else if (resp.data.status === 402) {
          toast.error('Créditos insuficientes para IA.');
        } else {
          toast.error(resp.data.error);
        }
        return;
      }

      setInsights(resp.data?.insights || 'Nenhum insight gerado.');
    } catch (err: any) {
      console.error('AI Insights error:', err);
      toast.error('Erro ao gerar insights: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Insights Automáticos (IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A IA analisa os dados de PvP e gera insights sobre dominâncias, rivalidades, tendências e a META do servidor.
          </p>
          <Button onClick={generateInsights} disabled={loading || datasetLoading} className="gap-2">
            {(loading || datasetLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {datasetLoading ? 'Carregando dados...' : loading ? 'Analisando...' : 'Gerar Insights'}
          </Button>

          {insights && (
            <div className="bg-card border border-border rounded-lg p-4 whitespace-pre-wrap text-sm text-foreground leading-relaxed">
              {insights}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
