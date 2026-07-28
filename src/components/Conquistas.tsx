import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Award, RefreshCw, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

const RARITY_STYLE: Record<string, string> = {
  common: 'border-muted-foreground/40 text-muted-foreground',
  rare: 'border-blue-500/60 text-blue-400',
  epic: 'border-purple-500/60 text-purple-400',
  legendary: 'border-yellow-500/70 text-yellow-400',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Comum',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Lendária',
};

export const Conquistas = () => {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState('');

  const { data: definitions, isLoading: loadingD } = useQuery({
    queryKey: ['badge-definitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('badge_definitions')
        .select('*')
        .order('rarity')
        .order('criteria_value');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeSeason } = useQuery({
    queryKey: ['active-season'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_season');
      if (error) throw error;
      return (data && data[0]) || null;
    },
  });

  const { data: badges, isLoading: loadingB } = useQuery({
    queryKey: ['player-badges', activeSeason?.started_at],
    enabled: activeSeason !== undefined,
    queryFn: async () => {
      let q = supabase
        .from('player_badges')
        .select('*')
        .order('achieved_at', { ascending: false })
        .range(0, 9999);
      if (activeSeason?.started_at) {
        q = q.gte('achieved_at', activeSeason.started_at);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const defByCode = useMemo(() => {
    const m: Record<string, any> = {};
    (definitions || []).forEach((d: any) => { m[d.code] = d; });
    return m;
  }, [definitions]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    (badges || []).forEach((b: any) => { m[b.badge_code] = (m[b.badge_code] || 0) + 1; });
    return m;
  }, [badges]);

  const playerBadges = useMemo(() => {
    const m: Record<string, any[]> = {};
    (badges || []).forEach((b: any) => { (m[b.player_name] ||= []).push(b); });
    return m;
  }, [badges]);

  const filteredPlayers = useMemo(() => {
    const entries = Object.entries(playerBadges);
    const s = search.trim().toLowerCase();
    const filtered = s ? entries.filter(([name]) => name.toLowerCase().includes(s)) : entries;
    const sorted = filtered.sort((a, b) => b[1].length - a[1].length);
    // Quando há busca: mostra todos os resultados; sem busca: limita a 200
    return s ? sorted : sorted.slice(0, 200);
  }, [playerBadges, search]);

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-badges');
      if (error) throw error;
      toast({
        title: 'Verificação concluída',
        description: `${data?.new_badges ?? 0} nova(s) conquista(s) detectada(s).`,
      });
      await qc.invalidateQueries({ queryKey: ['player-badges'] });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Award className="w-8 h-8 text-yellow-500" />
          Conquistas
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Badges desbloqueadas pelos jogadores
        </p>
      </div>

      {isAdmin && (
        <div className="flex justify-center">
          <Button onClick={runCheck} disabled={running} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Verificando...' : 'Verificar conquistas agora'}
          </Button>
        </div>
      )}

      {activeSeason && (
        <div className="text-center text-xs text-muted-foreground">
          Exibindo conquistas da <span className="text-primary font-semibold">{activeSeason.name}</span> (desde {(() => { const [y,m,d] = String(activeSeason.started_at).split('-'); return `${d}/${m}/${y}`; })()})
        </div>
      )}

      {/* Catalogo de badges */}
      <Card className="gaming-card">
        <CardHeader>
          <CardTitle>Catálogo de Conquistas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingD ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(definitions || []).map((d: any) => (
                <div
                  key={d.id}
                  className={`p-3 rounded border-2 bg-muted/20 ${RARITY_STYLE[d.rarity] || ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-3xl">{d.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{d.name}</div>
                      <Badge variant="outline" className={`text-[10px] ${RARITY_STYLE[d.rarity] || ''}`}>
                        {RARITY_LABEL[d.rarity] || d.rarity}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{d.description}</p>
                  <div className="text-xs mt-2 text-primary font-mono">
                    {counts[d.code] || 0} jogador(es)
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jogadores com mais conquistas */}
      <Card className="gaming-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Jogadores</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar jogador..."
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loadingB ? (
            <Skeleton className="h-40 w-full" />
          ) : filteredPlayers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum jogador encontrado.
            </p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredPlayers.map(([name, list]) => (
                <div key={name} className="flex items-center gap-3 p-3 bg-muted/30 rounded border border-border/40">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-muted-foreground">{list.length} conquista(s)</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                    {list.map((b: any) => {
                      const def = defByCode[b.badge_code];
                      if (!def) return null;
                      return (
                        <span
                          key={b.id}
                          title={`${def.name} — ${def.description}`}
                          className={`text-lg px-1.5 py-0.5 rounded border ${RARITY_STYLE[def.rarity] || ''}`}
                        >
                          {def.emoji}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
