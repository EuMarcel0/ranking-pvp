import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Trash2, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WebhookManager } from './WebhookManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfrontosDiretos } from './ConfrontosDiretos';
import { Characters } from './Characters';
import { UserManagement } from './UserManagement';
import { AutoProcessMonitor } from './AutoProcessMonitor';
import { DiscordPhrasesManager } from './DiscordPhrasesManager';

export const DatabaseManager = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('monitoramento');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDate, setDeleteDate] = useState<Date>();
  const [deleteHour, setDeleteHour] = useState<number>();
  const [deleteEventType, setDeleteEventType] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const subtab = searchParams.get('subtab');
    if (subtab === 'personagens') {
      setActiveTab('personagens');
    }
  }, [searchParams]);

  const handleDeleteByDate = async () => {
    if (!user) {
      toast.error('Você precisa estar logado para executar esta ação');
      navigate('/auth');
      return;
    }

    if (!deleteDate) {
      toast.error('Selecione uma data para deletar');
      return;
    }

    setIsDeleting(true);
    try {
      // Buscar matches que correspondem à data e hora selecionadas
      let query = supabase
        .from('pvp_matches')
        .select('id')
        .eq('match_date', format(deleteDate, 'yyyy-MM-dd'));

      if (deleteHour !== undefined) {
        query = query.eq('match_hour', deleteHour);
      }

      if (deleteEventType) {
        query = query.eq('event_type', deleteEventType);
      }

      const { data: matches, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!matches || matches.length === 0) {
        toast.error(`Nenhum dado encontrado para ${format(deleteDate, 'dd/MM/yyyy')}${deleteHour !== undefined ? ` às ${deleteHour}:00` : ''}`);
        setIsDeleting(false);
        setShowDeleteModal(false);
        return;
      }

      const matchIds = matches.map(m => m.id);

      // Deletar kill_logs relacionados
      const { error: killLogsError } = await supabase
        .from('pvp_kill_logs')
        .delete()
        .in('match_id', matchIds);

      if (killLogsError) throw killLogsError;

      // Deletar match_players relacionados
      const { error: matchPlayersError } = await supabase
        .from('pvp_match_players')
        .delete()
        .in('match_id', matchIds);

      if (matchPlayersError) throw matchPlayersError;

      // Deletar matches
      const { error: matchesError } = await supabase
        .from('pvp_matches')
        .delete()
        .in('id', matchIds);

      if (matchesError) throw matchesError;

      toast.success(`${matches.length} partida(s) e todos os registros relacionados foram removidos`);

      // Resetar filtros e fechar modal
      setDeleteDate(undefined);
      setDeleteHour(undefined);
      setDeleteEventType('');
      setShowDeleteModal(false);
    } catch (error: any) {
      console.error('Erro ao deletar dados:', error);
      toast.error('Erro ao deletar dados: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const clearAllPvpData = async () => {
    if (!user) {
      toast.error('Você precisa estar logado para executar esta ação');
      navigate('/auth');
      return;
    }

    try {
      setLoading(true);

      // Deletar kill logs primeiro (devido à foreign key)
      const { error: killLogsError } = await supabase
        .from('pvp_kill_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (killLogsError) throw killLogsError;

      // Deletar match players
      const { error: playersError } = await supabase
        .from('pvp_match_players')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (playersError) throw playersError;

      // Deletar matches
      const { error: matchesError } = await supabase
        .from('pvp_matches')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (matchesError) throw matchesError;

      toast.success('Todos os dados de PVP foram removidos com sucesso!');
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      toast.error('Erro ao limpar dados do banco');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5 mb-6">
        <TabsTrigger value="monitoramento">Monitoramento</TabsTrigger>
        <TabsTrigger value="management">Gerenciamento</TabsTrigger>
        <TabsTrigger value="frases">Frases Discord</TabsTrigger>
        <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        <TabsTrigger value="personagens">Personagens</TabsTrigger>
      </TabsList>

      <TabsContent value="monitoramento">
        <AutoProcessMonitor />
      </TabsContent>

      <TabsContent value="management">
        <div className="space-y-6">
          {/* Webhook Manager */}
          <WebhookManager />

          {/* Database Manager */}
          <Card className="border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="w-8 h-8 text-destructive" />
                <div>
                  <CardTitle className="text-2xl">Gerenciamento de Banco de Dados</CardTitle>
                  <CardDescription className="text-base mt-1">
                    Ferramentas administrativas para gerenciar dados do sistema
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Deletar por Data */}
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-warning mb-2">Deletar Dados por Data</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Remova partidas específicas por data e hora. Útil para corrigir dados incorretos ou duplicados.
                      </p>
                      <Button 
                        variant="outline" 
                        onClick={() => setShowDeleteModal(true)}
                        className="gap-2 border-warning/50 hover:bg-warning/10"
                      >
                        <Trash2 className="w-4 h-4" />
                        Deletar por Data
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-destructive mb-2">Limpar Todos os Dados de PVP</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Esta ação irá remover permanentemente todas as partidas, estatísticas de jogadores e registros de confrontos diretos.
                        Use esta opção se você deseja reimportar todos os dados do zero com os arquivos .txt completos.
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            disabled={loading}
                            className="gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            {loading ? 'Limpando...' : 'Limpar Todos os Dados'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Isso irá remover permanentemente:
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Todas as partidas registradas</li>
                                <li>Todas as estatísticas de jogadores</li>
                                <li>Todos os registros de confrontos diretos (quem matou quem)</li>
                              </ul>
                              <p className="mt-3 font-semibold text-destructive">
                                Você precisará reimportar todos os arquivos .txt novamente.
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={clearAllPvpData}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Sim, limpar tudo
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Instruções para reimportação:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Clique no botão "Limpar Todos os Dados" acima</li>
                    <li>Confirme a ação no diálogo de confirmação</li>
                    <li>Vá para a aba "Incluir Dados"</li>
                    <li>Importe cada arquivo .txt das partidas novamente</li>
                    <li>Clique em "Salvar no Banco" para cada partida</li>
                    <li>Agora todos os rankings incluirão os dados de confrontos diretos</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Modal de Delete por Data */}
          <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Deletar Dados por Data</DialogTitle>
                <DialogDescription>
                  Selecione a data e opcionalmente a hora dos dados que deseja deletar. Esta ação não pode ser desfeita.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Data *</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !deleteDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {deleteDate ? format(deleteDate, "PPP", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={deleteDate}
                        onSelect={setDeleteDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Hora (opcional)</label>
                  <select
                    value={deleteHour ?? ''}
                    onChange={(e) => setDeleteHour(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Todas as horas</option>
                    {[20, 21, 22, 23].map((hour) => (
                      <option key={hour} value={hour}>{hour}:00</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Se não selecionar hora, todos os dados do dia serão deletados
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Evento (opcional)</label>
                  <select
                    value={deleteEventType}
                    onChange={(e) => setDeleteEventType(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Todos os eventos</option>
                    <option value="boss_event">Boss Diário</option>
                    <option value="throne_conquest">Throne Conquest</option>
                    <option value="arka_war">Arka War</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Se não selecionar evento, todos os tipos serão deletados
                  </p>
                </div>

                {deleteDate && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                    <p className="text-sm font-semibold text-destructive">
                      ⚠️ Atenção: Você irá deletar dados de:
                    </p>
                    <p className="text-sm mt-2">
                      📅 {format(deleteDate, "dd/MM/yyyy", { locale: ptBR })}
                      {deleteHour !== undefined && ` às ${deleteHour}:00`}
                      {deleteEventType && ` | ${deleteEventType === 'boss_event' ? 'Boss Diário' : deleteEventType === 'throne_conquest' ? 'Throne Conquest' : 'Arka War'}`}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                  setShowDeleteModal(false);
                    setDeleteDate(undefined);
                    setDeleteHour(undefined);
                    setDeleteEventType('');
                  }}
                  disabled={isDeleting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteByDate}
                  disabled={isDeleting || !deleteDate}
                >
                  {isDeleting ? 'Deletando...' : 'Confirmar Deleção'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TabsContent>

      <TabsContent value="frases">
        <DiscordPhrasesManager />
      </TabsContent>

      <TabsContent value="usuarios">
        <UserManagement />
      </TabsContent>

      <TabsContent value="personagens">
        <Characters />
      </TabsContent>
    </Tabs>
  );
};
