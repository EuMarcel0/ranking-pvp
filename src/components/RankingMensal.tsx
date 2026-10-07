import { useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { CalendarDays, Crown, Loader2, Send, Swords, Trophy, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getClassShort } from '@/lib/classShortMap';

interface MonthlyEntry {
  name: string;
  class_name?: string;
  class_short?: string;
  guild?: string;
  kills: number;
  deaths: number;
  kda: number;
  matches: number;
  eventScore: number;
}

interface MonthlyPreview {
  dateFrom: string;
  dateTo: string;
  topPlayers: MonthlyEntry[];
  topByClass: MonthlyEntry[];
  totals: { playerCount: number; matchCount: number; kills: number };
  classFilter: { short: string; label: string } | null;
}

interface MonthlyData {
  dateFrom: string;
  dateTo: string;
  allPlayers: MonthlyEntry[];
  bestByClass: MonthlyEntry[];
  matchCount: number;
}

const TOP_LIMIT = 5;
const ALL_CLASSES = 'all';

function formatBr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export const RankingMensal = () => {
  const lastMonth = subMonths(new Date(), 1);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
  const [data, setData] = useState<MonthlyData | null>(null);
  const [classFilter, setClassFilter] = useState<string>(ALL_CLASSES);
  const [loading, setLoading] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');
  const [publishing, setPublishing] = useState(false);

  const generate = async () => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      toast({ title: 'Período inválido', description: 'Data início deve ser antes da data fim.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const [geralRes, classRes, matchesRes] = await Promise.all([
        supabase.rpc('get_ranking_geral', {
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_hour_from: null,
          p_hour_to: null,
        }),
        (supabase.rpc as any)('get_ranking_best_per_class', {
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_event_type: 'boss_event',
        }),
        supabase
          .from('pvp_matches')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'boss_event')
          .gte('match_date', dateFrom)
          .lte('match_date', dateTo),
      ]);

      if (geralRes.error) throw geralRes.error;
      if (classRes.error) throw classRes.error;
      if (matchesRes.error) throw matchesRes.error;

      const geral = (geralRes.data as any[]) || [];
      const byName = new Map(geral.map((r) => [r.player_name, r]));

      const allPlayers: MonthlyEntry[] = geral.map((r) => ({
        name: r.player_name,
        class_name: r.player_class || undefined,
        class_short: r.player_class_short || getClassShort(r.player_class) || undefined,
        guild: r.player_guild || undefined,
        kills: Number(r.total_kills),
        deaths: Number(r.total_deaths),
        kda: Number(r.kda),
        matches: Number(r.matches_played),
        eventScore: Number(r.event_score),
      }));

      const bestByClass: MonthlyEntry[] = ((classRes.data as any[]) || [])
        .filter((r) => r.is_best)
        .map((r) => ({
          name: r.player_name,
          class_name: r.class_name,
          class_short: byName.get(r.player_name)?.player_class_short || getClassShort(r.class_name) || undefined,
          kills: Number(r.total_kills),
          deaths: Number(r.total_deaths),
          kda: Number(r.total_kda),
          matches: Number(r.match_count),
          eventScore: Number(r.event_score),
        }))
        .filter((p) => p.kills > 0)
        .sort((a, b) => b.eventScore - a.eventScore);

      setData({
        dateFrom,
        dateTo,
        allPlayers,
        bestByClass,
        matchCount: matchesRes.count ?? 0,
      });
      if (classFilter !== ALL_CLASSES && !allPlayers.some((p) => p.class_short === classFilter)) {
        setClassFilter(ALL_CLASSES);
      }
    } catch (e: any) {
      toast({ title: 'Erro ao gerar ranking', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const classOptions = useMemo(() => {
    if (!data) return [];
    const byShort = new Map<string, Set<string>>();
    data.allPlayers.forEach((p) => {
      if (!p.class_short) return;
      if (!byShort.has(p.class_short)) byShort.set(p.class_short, new Set());
      if (p.class_name) byShort.get(p.class_short)!.add(p.class_name);
    });
    return [...byShort.entries()]
      .map(([short, names]) => ({ short, label: `${short} — ${[...names].sort().join(', ')}` }))
      .sort((a, b) => a.short.localeCompare(b.short));
  }, [data]);

  const preview = useMemo<MonthlyPreview | null>(() => {
    if (!data) return null;
    const isAll = classFilter === ALL_CLASSES;
    const players = isAll ? data.allPlayers : data.allPlayers.filter((p) => p.class_short === classFilter);
    const topPlayers = [...players]
      .filter((p) => isAll || p.kills > 0)
      .sort((a, b) => b.eventScore - a.eventScore)
      .slice(0, TOP_LIMIT);

    return {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      topPlayers,
      topByClass: isAll ? data.bestByClass : [],
      totals: {
        playerCount: players.length,
        matchCount: data.matchCount,
        kills: players.reduce((sum, p) => sum + p.kills, 0),
      },
      classFilter: isAll ? null : { short: classFilter, label: classFilter },
    };
  }, [data, classFilter]);

  const publish = async () => {
    if (!preview) return;
    setPublishing(true);
    try {
      const { error } = await supabase.functions.invoke('discord-webhook', {
        body: { type: 'monthly', environment, ...preview },
      });
      if (error) throw error;
      toast({
        title: 'Publicado!',
        description: `Ranking mensal enviado para ${environment === 'prod' ? 'Produção' : 'Homologação'}.`,
      });
      setShowPublish(false);
    } catch (e: any) {
      toast({ title: 'Erro ao publicar', description: e.message || 'Falha ao postar no Discord', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Ranking Mensal</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Considera apenas partidas de Boss Diário. Top 5 do PvP e o melhor jogador de cada classe no período.
          Após gerar, filtre por classe para ver os melhores de uma classe específica.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="mensal-inicio">Data início</Label>
            <Input id="mensal-inicio" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mensal-fim">Data fim</Label>
            <Input id="mensal-fim" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
          </div>
          <Button onClick={generate} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            Gerar
          </Button>
          <div className="space-y-1">
            <Label>Classe</Label>
            <Select value={classFilter} onValueChange={setClassFilter} disabled={!data}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todas as classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLASSES}>Todas as classes</SelectItem>
                {classOptions.map((c) => (
                  <SelectItem key={c.short} value={c.short}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowPublish(true)}
            disabled={!preview || preview.topPlayers.length === 0}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Postar no Discord
          </Button>
        </div>
      </Card>

      {preview && (
        <>
          <Card className="p-6 space-y-2">
            <h3 className="text-lg font-bold">
              📅 {formatBr(preview.dateFrom)} a {formatBr(preview.dateTo)}
            </h3>
            <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Swords className="w-4 h-4" /> {preview.totals.matchCount} bosses</span>
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {preview.totals.playerCount} jogadores</span>
              <span>🗡️ {preview.totals.kills} kills</span>
            </div>
            {preview.topPlayers[0] && (
              <p className="pt-2 flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                <span>
                  {preview.classFilter ? `Melhor ${preview.classFilter.short} do mês` : 'Campeão do mês'}: <strong>{preview.topPlayers[0].name}</strong>{' '}
                  ({preview.topPlayers[0].eventScore.toFixed(1)} score)
                </span>
              </p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">
              🏆 {preview.classFilter ? `Top 5 ${preview.classFilter.short}` : 'Top 5 do PvP'}
            </h3>
            {preview.topPlayers.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                {preview.classFilter ? 'Nenhum jogador desta classe com kills no período.' : 'Nenhum boss no período.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Jogador</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Guild</TableHead>
                      <TableHead className="text-center">Kills</TableHead>
                      <TableHead className="text-center">Deaths</TableHead>
                      <TableHead className="text-center">KDA</TableHead>
                      <TableHead className="text-center">Bosses</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.topPlayers.map((p, i) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-bold text-primary">{medal(i)}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.class_short || p.class_name || '-'}</TableCell>
                        <TableCell>{p.guild || '-'}</TableCell>
                        <TableCell className="text-center text-success">{p.kills}</TableCell>
                        <TableCell className="text-center text-destructive">{p.deaths}</TableCell>
                        <TableCell className="text-center">{p.kda.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{p.matches}</TableCell>
                        <TableCell className="text-center font-bold text-primary">{p.eventScore.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {!preview.classFilter && (
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">⚔️ Melhor de cada classe</h3>
            {preview.topByClass.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Nenhum dado de classe no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Classe</TableHead>
                      <TableHead>Jogador</TableHead>
                      <TableHead className="text-center">Kills</TableHead>
                      <TableHead className="text-center">Deaths</TableHead>
                      <TableHead className="text-center">KDA</TableHead>
                      <TableHead className="text-center">Bosses</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.topByClass.map((p) => (
                      <TableRow key={p.class_name}>
                        <TableCell className="font-semibold">{p.class_name}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-center text-success">{p.kills}</TableCell>
                        <TableCell className="text-center text-destructive">{p.deaths}</TableCell>
                        <TableCell className="text-center">{p.kda.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{p.matches}</TableCell>
                        <TableCell className="text-center font-bold text-primary">{p.eventScore.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
          )}
        </>
      )}

      <Dialog open={showPublish} onOpenChange={setShowPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar Ranking Mensal</DialogTitle>
            <DialogDescription>
              {preview &&
                `${formatBr(preview.dateFrom)} a ${formatBr(preview.dateTo)} • ` +
                  (preview.classFilter ? `Top 5 ${preview.classFilter.short}` : 'Top 5 + melhor de cada classe')}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-card/50 p-4 rounded-lg border border-border space-y-3">
            <Label className="text-sm font-semibold">Ambiente de Publicação</Label>
            <RadioGroup value={environment} onValueChange={(v: 'homolog' | 'prod') => setEnvironment(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="homolog" id="mensal-homolog" />
                <Label htmlFor="mensal-homolog" className="cursor-pointer font-normal">🧪 Homologação (testes)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prod" id="mensal-prod" />
                <Label htmlFor="mensal-prod" className="cursor-pointer font-normal">🚀 Produção (oficial)</Label>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublish(false)} disabled={publishing}>
              Cancelar
            </Button>
            <Button onClick={publish} disabled={publishing}>
              {publishing ? 'Publicando...' : 'Confirmar Publicação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
