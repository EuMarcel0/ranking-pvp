import { useState, useRef, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Skull, Target, Download, Calendar, Clock, Send } from 'lucide-react';
import { EventTypeFilter } from './EventTypeFilter';
import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

interface PutinhaRelation {
  victim: string;
  killer: string;
  deaths: number;
  victimGuild?: string;
  killerGuild?: string;
}

export const PutinhaRanking = () => {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const [exporting, setExporting] = useState(false);
  const [postingDiscord, setPostingDiscord] = useState(false);
  const [eventType, setEventType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const cardRef = useRef<HTMLDivElement>(null);

  // Debounce filter updates
  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined, hFrom: number | undefined, hTo: number | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
      setDebouncedHourFrom(hFrom);
      setDebouncedHourTo(hTo);
    }, 500),
    []
  );

  // Update debounced values when filters change
  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo, hourFrom, hourTo);
  }, [dateFrom, dateTo, hourFrom, hourTo, debouncedSetFilters]);

  const { data: relations = [], isLoading: loading } = useQuery({
    queryKey: ['putinha-ranking', debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo, eventType],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_ranking_putinha', {
        p_date_from: debouncedDateFrom ? format(debouncedDateFrom, 'yyyy-MM-dd') : null,
        p_date_to: debouncedDateTo ? format(debouncedDateTo, 'yyyy-MM-dd') : null,
        p_hour_from: debouncedHourFrom ?? null,
        p_hour_to: debouncedHourTo ?? null,
        p_event_type: eventType,
      });
      if (error) throw error;
      const relations: PutinhaRelation[] = (data || []).map((r: any) => ({
        victim: r.victim_name,
        killer: r.killer_name,
        deaths: Number(r.deaths),
        victimGuild: r.victim_guild || undefined,
        killerGuild: r.killer_guild || undefined,
      }));
      return relations;
    },
  });


  const exportAsImage = async () => {
    if (!cardRef.current) return;

    try {
      setExporting(true);
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = `minha-putinha-ranking-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      toast({
        title: 'Sucesso',
        description: 'Imagem exportada com sucesso!',
      });
    } catch (error) {
      console.error('Error exporting image:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao exportar imagem',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const postToDiscord = async (environment: 'homolog' | 'prod') => {
    if (relations.length === 0) return;
    try {
      setPostingDiscord(true);

      const putinhaData = relations.map((r, i) => ({
        position: i + 1,
        killer: r.killer,
        killerGuild: r.killerGuild || '',
        victim: r.victim,
        victimGuild: r.victimGuild || '',
        deaths: r.deaths,
        level: r.deaths >= 50 ? 'DEVASTADOR' : r.deaths >= 30 ? 'CRUEL' : r.deaths >= 20 ? 'IMPLACÁVEL' : 'DOMINANTE',
      }));

      const filters: Record<string, any> = {};
      if (eventType !== 'all') filters.eventType = eventType;
      if (debouncedDateFrom) filters.dateFrom = format(debouncedDateFrom, 'yyyy-MM-dd');
      if (debouncedDateTo) filters.dateTo = format(debouncedDateTo, 'yyyy-MM-dd');
      if (debouncedHourFrom !== undefined) filters.hourFrom = debouncedHourFrom;
      if (debouncedHourTo !== undefined) filters.hourTo = debouncedHourTo;

      const { data, error } = await supabaseClient.functions.invoke('discord-webhook', {
        body: {
          type: 'putinha',
          environment,
          filters,
          putinhaData,
          totals: { relationCount: relations.length },
        },
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `Ranking postado no Discord (${environment === 'prod' ? 'Produção' : 'Homologação'})!`,
      });
    } catch (error: any) {
      console.error('Error posting to Discord:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao postar no Discord',
        variant: 'destructive',
      });
    } finally {
      setPostingDiscord(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card ref={cardRef}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skull className="w-6 h-6 text-destructive" />
            <div>
              <CardTitle>Ranking: Minha Putinha</CardTitle>
              <CardDescription>
                Quem morre 10 ou mais vezes para o mesmo jogador (Total: {relations.length} relações)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Button
                  onClick={() => postToDiscord('homolog')}
                  disabled={postingDiscord || relations.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <Send className="w-4 h-4" />
                  {postingDiscord ? 'Enviando...' : 'Discord HML'}
                </Button>
                <Button
                  onClick={() => postToDiscord('prod')}
                  disabled={postingDiscord || relations.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <Send className="w-4 h-4" />
                  {postingDiscord ? 'Enviando...' : 'Discord Prod'}
                </Button>
              </>
            )}
            <Button
              onClick={exportAsImage}
              disabled={exporting || relations.length === 0}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          </div>
        </div>
        
        {/* Date and Hour Filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          <EventTypeFilter value={eventType} onChange={setEventType} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: ptBR }) : 'Data Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: ptBR }) : 'Data Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Select value={hourFrom?.toString() || "all"} onValueChange={(v) => setHourFrom(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hora Início" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {i}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={hourTo?.toString() || "all"} onValueChange={(v) => setHourTo(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hora Fim" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {i}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom(undefined);
                setDateTo(undefined);
                setHourFrom(undefined);
                setHourTo(undefined);
              }}
            >
              Limpar Filtros
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {relations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma relação de dominância encontrada ainda.</p>
            <p className="text-sm mt-2">É necessário morrer 10 ou mais vezes para o mesmo jogador.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Dominador</TableHead>
                  <TableHead className="text-center w-24">Kills</TableHead>
                  <TableHead>Putinha</TableHead>
                  <TableHead className="text-center">Nível</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relations.map((relation, index) => {
                  const dominanceLevel = 
                    relation.deaths >= 50 ? 'DEVASTADOR' :
                    relation.deaths >= 30 ? 'CRUEL' :
                    relation.deaths >= 20 ? 'IMPLACÁVEL' :
                    'DOMINANTE';
                  
                  const badgeVariant = 
                    relation.deaths >= 50 ? 'destructive' :
                    relation.deaths >= 30 ? 'destructive' :
                    relation.deaths >= 20 ? 'default' :
                    'secondary';

                  return (
                    <TableRow key={`${relation.victim}-${relation.killer}`}>
                      <TableCell className="font-bold text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <div>
                            <div className="font-medium">{relation.killer}</div>
                            {relation.killerGuild && (
                              <div className="text-xs text-muted-foreground">
                                {relation.killerGuild}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-bold text-destructive border-destructive">
                          {relation.deaths}×
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skull className="w-4 h-4 text-destructive" />
                          <div>
                            <div className="font-medium">{relation.victim}</div>
                            {relation.victimGuild && (
                              <div className="text-xs text-muted-foreground">
                                {relation.victimGuild}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badgeVariant} className="font-semibold">
                          {dominanceLevel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
