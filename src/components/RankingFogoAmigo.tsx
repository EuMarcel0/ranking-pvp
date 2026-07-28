import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Flame, Search, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUserRole } from '@/hooks/useUserRole';

interface FogoAmigoRow {
  player_name: string;
  player_class: string;
  player_class_short: string;
  player_guild: string;
  friendly_kills: number;
  friendly_deaths: number;
  kda: number;
  event_score: number;
}

const eventTypeOptions = [
  { value: 'all', label: 'Todos os Eventos' },
  { value: 'boss_event', label: 'Boss Diário' },
  { value: 'throne_conquest', label: 'Throne Conquest' },
  { value: 'arka_war', label: 'Arka War' },
];

export const RankingFogoAmigo = () => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<FogoAmigoRow[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hourFrom, setHourFrom] = useState<string>('');
  const [hourTo, setHourTo] = useState<string>('');
  const [eventType, setEventType] = useState<string>('all');
  const [guildFilter, setGuildFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [nameSearch, setNameSearch] = useState('');
  const { isAdmin } = useUserRole();
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');

  const publishToDiscord = async () => {
    setPublishing(true);
    try {
      const ranking = filtered.map(r => ({
        name: r.player_name,
        class_short: r.player_class_short,
        guild: r.player_guild,
        friendly_kills: r.friendly_kills,
        friendly_deaths: r.friendly_deaths,
        kda: Number(r.kda),
        eventScore: Number(r.event_score),
      }));

      const totalFK = ranking.reduce((s, p) => s + p.friendly_kills, 0);

      const payload = {
        type: 'fogo_amigo' as const,
        environment,
        filters: {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          hourFrom: hourFrom === '' ? undefined : Number(hourFrom),
          hourTo: hourTo === '' ? undefined : Number(hourTo),
          eventType,
        },
        ranking,
        totals: {
          playerCount: ranking.length,
          totalFriendlyKills: totalFK,
        },
      };

      const { error } = await supabase.functions.invoke('discord-webhook', { body: payload });
      if (error) throw error;
      toast.success('Ranking Fogo Amigo publicado no Discord!');
      setShowPublishDialog(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Falha ao publicar no Discord');
    } finally {
      setPublishing(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_ranking_fogo_amigo', {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_hour_from: hourFrom === '' ? null : Number(hourFrom),
        p_hour_to: hourTo === '' ? null : Number(hourTo),
        p_event_type: eventType,
      });
      if (error) throw error;
      setRows((data || []) as FogoAmigoRow[]);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar ranking de fogo amigo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guilds = useMemo(
    () => Array.from(new Set(rows.map(r => r.player_guild).filter(Boolean))).sort(),
    [rows]
  );
  const classes = useMemo(
    () => Array.from(new Set(rows.map(r => r.player_class).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (guildFilter !== 'all' && r.player_guild !== guildFilter) return false;
      if (classFilter !== 'all' && r.player_class !== classFilter) return false;
      if (nameSearch && !r.player_name.toLowerCase().includes(nameSearch.toLowerCase())) return false;
      return true;
    });
  }, [rows, guildFilter, classFilter, nameSearch]);

  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setHourFrom(''); setHourTo('');
    setEventType('all'); setGuildFilter('all'); setClassFilter('all'); setNameSearch('');
    setTimeout(fetchData, 0);
  };

  const podiumBadge = (idx: number) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Flame className="w-6 h-6" />
          Ranking Fogo Amigo
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Quem mais traiu os próprios aliados — kills entre membros da mesma guild.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Data de</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Data até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hora de</Label>
            <Input type="number" min={0} max={23} value={hourFrom} onChange={(e) => setHourFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hora até</Label>
            <Input type="number" min={0} max={23} value={hourTo} onChange={(e) => setHourTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Evento</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {eventTypeOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar nome</Label>
            <Input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="Nome..." />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Guild</Label>
            <Select value={guildFilter} onValueChange={setGuildFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {guilds.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Classe</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={fetchData} disabled={loading} className="gap-2">
              <Search className="w-4 h-4" /> {loading ? 'Buscando...' : 'Buscar'}
            </Button>
            <Button variant="outline" onClick={resetFilters} className="gap-2">
              <RotateCcw className="w-4 h-4" /> Limpar
            </Button>
            {isAdmin && (
              <Button
                variant="default"
                onClick={() => setShowPublishDialog(true)}
                disabled={filtered.length === 0}
                className="gap-2"
              >
                <Send className="w-4 h-4" /> Publicar no Discord
              </Button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Pos</TableHead>
                <TableHead>Personagem</TableHead>
                <TableHead className="w-20">Sigla</TableHead>
                <TableHead>Guild</TableHead>
                <TableHead className="text-right">Kills Aliados</TableHead>
                <TableHead className="text-right">Mortes p/ Aliados</TableHead>
                <TableHead className="text-right">KDA</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {loading ? 'Carregando...' : 'Nenhum caso de fogo amigo encontrado para os filtros.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r, idx) => (
                <TableRow key={`${r.player_name}-${idx}`}>
                  <TableCell className="font-bold">{podiumBadge(idx)}</TableCell>
                  <TableCell className="font-medium">{r.player_name}</TableCell>
                  <TableCell>
                    {r.player_class_short && (
                      <Badge variant="outline" className="font-mono">{r.player_class_short}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.player_guild && <Badge variant="secondary">{r.player_guild}</Badge>}
                  </TableCell>
                  <TableCell className="text-right text-destructive font-bold">{r.friendly_kills}</TableCell>
                  <TableCell className="text-right">{r.friendly_deaths}</TableCell>
                  <TableCell className="text-right">{Number(r.kda).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {Number(r.event_score).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-destructive" />
              Publicar Fogo Amigo no Discord
            </DialogTitle>
            <DialogDescription>
              Serão enviados {filtered.length} jogadores no formato monoespaçado, seguindo o padrão do ranking PVP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Ambiente</Label>
            <RadioGroup value={environment} onValueChange={(v) => setEnvironment(v as 'homolog' | 'prod')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="homolog" id="fa-homolog" />
                <Label htmlFor="fa-homolog">Homologação (teste)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prod" id="fa-prod" />
                <Label htmlFor="fa-prod">Produção</Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishDialog(false)} disabled={publishing}>
              Cancelar
            </Button>
            <Button onClick={publishToDiscord} disabled={publishing} className="gap-2">
              <Send className="w-4 h-4" />
              {publishing ? 'Publicando...' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
