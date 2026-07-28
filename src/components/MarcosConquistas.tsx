import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Award, Zap, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

const METRIC_LABELS: Record<string, string> = {
  total_kills: 'Total de Kills',
  kill_streak: 'Kill Streak',
  single_match_kills: 'Kills em uma partida',
  best_kda: 'Melhor KDA',
};

export const MarcosConquistas = () => {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [newMetric, setNewMetric] = useState('total_kills');
  const [newThreshold, setNewThreshold] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏅');
  const [search, setSearch] = useState('');

  const { data: thresholds, isLoading: loadingT } = useQuery({
    queryKey: ['milestone-thresholds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestone_thresholds')
        .select('*')
        .order('metric')
        .order('threshold');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: achievements, isLoading: loadingA } = useQuery({
    queryKey: ['player-milestones-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_milestones')
        .select('*')
        .order('achieved_at', { ascending: false })
        .range(0, 4999);
      if (error) throw error;
      return data || [];
    },
  });

  const filteredAchievements = (() => {
    const s = search.trim().toLowerCase();
    const list = achievements || [];
    const filtered = s ? list.filter((a: any) => a.player_name.toLowerCase().includes(s)) : list;
    return s ? filtered : filtered.slice(0, 200);
  })();

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-milestones');
      if (error) throw error;
      toast({
        title: 'Verificação concluída',
        description: `${data?.new_milestones ?? 0} novo(s) marco(s) detectado(s).`,
      });
      await qc.invalidateQueries({ queryKey: ['player-milestones-recent'] });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const addThreshold = async () => {
    const t = parseFloat(newThreshold);
    if (!t || !newLabel.trim()) {
      toast({ title: 'Preencha valor e rótulo', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('milestone_thresholds').insert({
      metric: newMetric,
      threshold: t,
      label: newLabel.trim(),
      emoji: newEmoji.trim() || '🏅',
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setNewThreshold('');
    setNewLabel('');
    qc.invalidateQueries({ queryKey: ['milestone-thresholds'] });
    toast({ title: 'Marco adicionado' });
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from('milestone_thresholds').update({ enabled }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['milestone-thresholds'] });
  };

  const deleteThreshold = async (id: string) => {
    if (!confirm('Excluir este marco?')) return;
    await supabase.from('milestone_thresholds').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['milestone-thresholds'] });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Award className="w-8 h-8 text-yellow-500" />
          Marcos & Conquistas
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Conquistas históricas dos jogadores
        </p>
      </div>

      {isAdmin && (
        <div className="flex justify-center">
          <Button onClick={runCheck} disabled={running} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Verificando...' : 'Verificar marcos agora'}
          </Button>
        </div>
      )}

      {/* Recent achievements */}
      <Card className="gaming-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Conquistas {search ? `— "${search}"` : 'Recentes'}
          </CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jogador..."
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loadingA ? (
            <Skeleton className="h-40 w-full" />
          ) : !filteredAchievements || filteredAchievements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma conquista encontrada.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
              {filteredAchievements.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 bg-muted/30 rounded border border-border/40"
                >
                  <span className="text-2xl">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{a.player_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.label}</div>
                    <div className="text-xs text-muted-foreground/70">
                      {new Date(a.achieved_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Thresholds management (admin) */}
      {isAdmin && (
        <Card className="gaming-card">
          <CardHeader>
            <CardTitle>Configurar Marcos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 items-end p-3 border border-dashed rounded">
              <div>
                <label className="text-xs text-muted-foreground">Métrica</label>
                <select
                  className="block px-2 py-1 bg-background border border-border rounded text-sm"
                  value={newMetric}
                  onChange={(e) => setNewMetric(e.target.value)}
                >
                  {Object.entries(METRIC_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Valor</label>
                <Input
                  type="number"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground">Rótulo</label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex: 1.000 Kills" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Emoji</label>
                <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} className="w-20" />
              </div>
              <Button onClick={addThreshold}>Adicionar</Button>
            </div>

            {loadingT ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {(thresholds || []).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 p-2 bg-muted/20 rounded">
                    <span className="text-xl w-8 text-center">{t.emoji}</span>
                    <Badge variant="outline" className="text-xs">{METRIC_LABELS[t.metric] || t.metric}</Badge>
                    <span className="font-mono text-sm w-20 text-right">{Number(t.threshold).toLocaleString('pt-BR')}</span>
                    <span className="flex-1 text-sm">{t.label}</span>
                    <Switch checked={t.enabled} onCheckedChange={(v) => toggleEnabled(t.id, v)} />
                    <Button variant="ghost" size="sm" onClick={() => deleteThreshold(t.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
