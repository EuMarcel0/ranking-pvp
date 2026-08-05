import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseExternalDbContent, ExternalLogEntry, ParseResult } from '@/utils/txtParser';
import { toast } from '@/components/ui/use-toast';

interface DatabaseImportProps {
  onDataLoaded: (result: ParseResult) => void;
  eventType?: 'boss_event' | 'throne_conquest' | 'world_boss';
}

export const DatabaseImport = ({ onDataLoaded, eventType = 'boss_event' }: DatabaseImportProps) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ logs: ExternalLogEntry[]; count: number } | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setPreviewData(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      // Add map filter based on event type
      params.set(
        'map',
        eventType === 'throne_conquest'
          ? 'devias'
          : eventType === 'world_boss'
            ? 'world_boss'
            : 'pvp_square',
      );

      const { data, error } = await supabase.functions.invoke('fetch-external-logs', {
        body: null,
        headers: {},
      });

      // Need to call with query params via URL
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-external-logs?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch logs');
      }

      const result = await response.json();
      setPreviewData(result);
      
      toast({
        title: 'Dados carregados',
        description: `${result.count} registros encontrados no banco externo.`,
      });
    } catch (error: any) {
      console.error('Error fetching external logs:', error);
      toast({
        title: 'Erro ao buscar dados',
        description: error.message || 'Falha ao conectar com o banco de dados externo.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const processData = () => {
    if (!previewData?.logs) return;

    const result = parseExternalDbContent(previewData.logs, eventType);
    
    if (result.players.length === 0) {
      toast({
        title: 'Nenhum dado válido',
        description: `Nenhum registro de kill válido encontrado nos logs (verificando mapa ${eventType === 'throne_conquest' ? 'Devias' : 'PvP Square'}).`,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Dados processados',
      description: `${result.players.length} jogadores e ${result.killLogs.length} kills processados.`,
    });

    onDataLoaded(result);
  };

  return (
    <Card className="bg-card/80 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Importar do Banco de Dados Externo
          {eventType === 'throne_conquest' && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">Throne Conquest (Devias)</span>
          )}
        </CardTitle>
        <CardDescription>
          Buscar logs de PvP diretamente do banco de dados externo
          {eventType === 'throne_conquest'
            ? ' - Filtrando mapa Devias'
            : eventType === 'world_boss'
              ? ' - Filtrando Selupan / Raklion (World Boss PvP)'
              : ' - Filtrando mapa PvP Square'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Data/Hora Inicial (opcional)</Label>
            <Input
              id="startDate"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">Data/Hora Final (opcional)</Label>
            <Input
              id="endDate"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-background/50"
            />
          </div>
        </div>

        <Button 
          onClick={fetchLogs} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Buscando dados...
            </>
          ) : (
            <>
              <Database className="w-4 h-4 mr-2" />
              Buscar do Banco Externo
            </>
          )}
        </Button>

        {previewData && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span className="text-sm">
                <strong>{previewData.count}</strong> registros carregados do banco externo
              </span>
            </div>

            {previewData.logs.length > 0 && (
              <div className="space-y-2">
                <Label>Preview dos dados (primeiros 5 registros):</Label>
                <div className="max-h-48 overflow-y-auto space-y-1 p-2 bg-background/30 rounded border border-border/30">
                  {previewData.logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="text-xs text-muted-foreground font-mono truncate">
                      {log.content}
                    </div>
                  ))}
                  {previewData.logs.length > 5 && (
                    <div className="text-xs text-muted-foreground italic">
                      ... e mais {previewData.logs.length - 5} registros
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button 
              onClick={processData}
              variant="secondary"
              className="w-full"
            >
              Processar e Visualizar Dados
            </Button>
          </div>
        )}

        {previewData?.count === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="text-sm text-destructive">
              Nenhum registro encontrado para o período selecionado.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
