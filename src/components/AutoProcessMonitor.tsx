import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Activity, CheckCircle2, Clock, AlertCircle, RefreshCw, Calendar, Users, Play, Loader2, Crown, RotateCcw } from 'lucide-react';
import { format, formatDistanceToNow, parseISO, isToday, isYesterday, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface MatchData {
  id: string;
  match_date: string;
  match_hour: number;
  boss_label: string;
  created_at: string;
  event_type: string;
  player_count?: number;
}

interface ExpectedEvent {
  date: string;
  hour: number;
  minute: number;
  label: string;
  eventType: 'boss_event' | 'throne_conquest';
}

export const AutoProcessMonitor = () => {
  const [recentMatches, setRecentMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingEvent, setProcessingEvent] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRecentMatches = async () => {
    try {
      const { data: matches, error } = await supabase
        .from('pvp_matches')
        .select('id, match_date, match_hour, boss_label, created_at, event_type')
        .order('created_at', { ascending: false })
        .limit(21);

      if (error) throw error;

      const matchesWithCounts = await Promise.all(
        (matches || []).map(async (match) => {
          const { count } = await supabase
            .from('pvp_match_players')
            .select('*', { count: 'exact', head: true })
            .eq('match_id', match.id);
          return { ...match, player_count: count || 0 };
        })
      );

      setRecentMatches(matchesWithCounts);
    } catch (error) {
      console.error('Erro ao buscar partidas recentes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecentMatches(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRecentMatches();
    setRefreshing(false);
  };

  const handleManualProcess = async (event: ExpectedEvent, reprocess = false, testHomolog = false) => {
    const eventKey = `${event.date}-${event.hour}-${event.eventType}`;
    setProcessingEvent(eventKey);

    try {
      const { data, error } = await supabase.functions.invoke('auto-process-ranking', {
        body: {
          attempt: 3,
          forceProcess: true,
          forceReprocess: reprocess,
          testHomolog,
          eventHour: event.hour,
          eventMinute: event.minute,
          eventType: event.eventType,
          eventDate: event.date,
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: testHomolog ? "Teste em homologação enviado!" : reprocess ? "Reprocessamento concluído!" : "Processamento concluído!",
          description: `Ranking de ${event.date} ${event.hour}:${String(event.minute).padStart(2, '0')} processado com ${data.playersCount || data.playerCount || 0} jogadores.`,
        });
        await fetchRecentMatches();
      } else if (data?.skipped) {
        toast({ title: "Evento já processado", description: data.message || "Este evento já foi processado anteriormente." });
        await fetchRecentMatches();
      } else if (data?.noData) {
        toast({ title: "Sem dados", description: data.message || "Nenhum dado encontrado para este período.", variant: "destructive" });
      } else {
        toast({ title: "Resultado inesperado", description: JSON.stringify(data) });
      }
    } catch (error) {
      console.error('[Manual Trigger] Erro:', error);
      toast({
        title: "Erro no processamento",
        description: error instanceof Error ? error.message : "Erro desconhecido ao processar ranking.",
        variant: "destructive",
      });
    } finally {
      setProcessingEvent(null);
    }
  };

  const getExpectedEvents = (): ExpectedEvent[] => {
    const events: ExpectedEvent[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayOfWeek = date.getDay();

      // First boss event
      const firstEventHour = dayOfWeek === 1 ? 21 : 20;
      events.push({
        date: dateStr, hour: firstEventHour, minute: 0,
        label: `BOSSx2 ${format(date, 'dd/MM/yyyy')} ${firstEventHour}H`,
        eventType: 'boss_event',
      });

      // Tuesday and Thursday: Throne Conquest at 21:36
      if (dayOfWeek === 2 || dayOfWeek === 4) {
        events.push({
          date: dateStr, hour: 21, minute: 36,
          label: `Throne ${format(date, 'dd/MM/yyyy')} 21:36`,
          eventType: 'throne_conquest',
        });
      }

      // Second boss event
      const isSecondEventLate = dayOfWeek === 2 || dayOfWeek === 4;
      events.push({
        date: dateStr, hour: 22, minute: isSecondEventLate ? 30 : 0,
        label: `BOSSx2 ${format(date, 'dd/MM/yyyy')} 22${isSecondEventLate ? ':30' : ':00'}`,
        eventType: 'boss_event',
      });
    }

    return events;
  };

  const isEventProcessed = (event: ExpectedEvent): MatchData | null => {
    return recentMatches.find(
      (m) => m.match_date === event.date && m.match_hour === event.hour && m.event_type === event.eventType
    ) || null;
  };

  const shouldBeProcessed = (event: ExpectedEvent): boolean => {
    const now = new Date();
    const eventDate = parseISO(event.date);
    const eventTime = new Date(eventDate);
    eventTime.setHours(event.hour);
    eventTime.setMinutes(event.minute + 30);
    return now > eventTime;
  };

  const canManuallyProcess = (event: ExpectedEvent): boolean => {
    const now = new Date();
    const eventDate = parseISO(event.date);
    const eventTime = new Date(eventDate);
    eventTime.setHours(event.hour);
    eventTime.setMinutes(event.minute + 5);
    return now > eventTime;
  };

  const expectedEvents = getExpectedEvents();
  const processedCount = expectedEvents.filter(e => isEventProcessed(e) && shouldBeProcessed(e)).length;
  const pendingCount = expectedEvents.filter(e => !isEventProcessed(e) && shouldBeProcessed(e)).length;
  const upcomingCount = expectedEvents.filter(e => !shouldBeProcessed(e)).length;

  const formatProcessingDelay = (event: ExpectedEvent, match: MatchData): string => {
    const eventDate = parseISO(event.date);
    const eventTime = new Date(eventDate);
    eventTime.setHours(event.hour);
    eventTime.setMinutes(event.minute);
    const processedTime = parseISO(match.created_at);
    const delayMinutes = Math.round((processedTime.getTime() - eventTime.getTime()) / 60000);
    if (delayMinutes < 60) return `${delayMinutes}min após`;
    const hours = Math.floor(delayMinutes / 60);
    const mins = delayMinutes % 60;
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''} após`;
  };

  const getDateLabel = (dateStr: string): string => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';
    return format(date, 'EEEE', { locale: ptBR });
  };

  const formatEventTime = (event: ExpectedEvent): string => {
    return `${event.hour}:${String(event.minute).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Monitoramento de Processamento Automático
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            <div>
              <CardTitle>Monitoramento de Processamento Automático</CardTitle>
              <CardDescription className="mt-1">Status dos últimos rankings processados automaticamente</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
            <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-500">{processedCount}</div>
            <div className="text-sm text-muted-foreground">Processados</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
            <AlertCircle className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-yellow-500">{pendingCount}</div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
            <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-500">{upcomingCount}</div>
            <div className="text-sm text-muted-foreground">Aguardando</div>
          </div>
        </div>

        <div className="space-y-2">
          {expectedEvents.map((event) => {
            const match = isEventProcessed(event);
            const isPast = shouldBeProcessed(event);
            const isProcessed = !!match;
            const eventKey = `${event.date}-${event.hour}-${event.eventType}`;
            const isProcessing = processingEvent === eventKey;
            const canProcess = canManuallyProcess(event);
            const isThrone = event.eventType === 'throne_conquest';

            return (
              <div
                key={eventKey}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isProcessed
                    ? isThrone ? 'bg-amber-500/5 border-amber-500/20' : 'bg-green-500/5 border-green-500/20'
                    : isPast
                    ? 'bg-yellow-500/5 border-yellow-500/20'
                    : 'bg-muted/30 border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    isProcessed ? (isThrone ? 'bg-amber-500' : 'bg-green-500') : isPast ? 'bg-yellow-500' : 'bg-muted-foreground'
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      {isThrone ? <Crown className="w-4 h-4 text-amber-500" /> : <Calendar className="w-4 h-4 text-muted-foreground" />}
                      <span className="font-medium">
                        {getDateLabel(event.date)} - {formatEventTime(event)}
                      </span>
                      {isThrone && (
                        <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">Throne</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {format(parseISO(event.date), 'dd/MM')}
                      </Badge>
                    </div>
                    {match && (
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        {match.player_count} jogadores • {formatProcessingDelay(event, match)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isProcessed ? (
                    <>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleManualProcess(event, true, true)}
                        disabled={isProcessing}
                        className="gap-1 h-7 text-xs bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20"
                        title="Reprocessar e postar APENAS no webhook de homologação"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Testar Homolog
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline" size="sm"
                            disabled={isProcessing}
                            className="gap-1 h-7 text-xs"
                          >
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            {isProcessing ? 'Reprocessando...' : 'Reprocessar'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reprocessar evento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso vai apagar os dados atuais deste evento ({getDateLabel(event.date)} {formatEventTime(event)}) e buscar novamente no banco externo, postando o resultado no Discord (PROD).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleManualProcess(event, true)}>
                              Reprocessar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Badge className={isThrone
                        ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                        : "bg-green-500/20 text-green-500 border-green-500/30"
                      }>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Processado
                      </Badge>
                    </>
                  ) : isPast ? (
                    <>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleManualProcess(event)}
                        disabled={isProcessing || !canProcess}
                        className="gap-1 h-7 text-xs bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        {isProcessing ? 'Processando...' : 'Processar'}
                      </Button>
                      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Pendente
                      </Badge>
                    </>
                  ) : canProcess ? (
                    <>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleManualProcess(event)}
                        disabled={isProcessing}
                        className="gap-1 h-7 text-xs"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        {isProcessing ? 'Processando...' : 'Processar'}
                      </Button>
                      <Badge variant="outline" className="text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        Aguardando
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      Aguardando
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {recentMatches.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Último processamento: <span className="font-medium text-foreground">
                {formatDistanceToNow(parseISO(recentMatches[0].created_at), { addSuffix: true, locale: ptBR })}
              </span>
              {' '}({format(parseISO(recentMatches[0].created_at), "dd/MM 'às' HH:mm", { locale: ptBR })})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
