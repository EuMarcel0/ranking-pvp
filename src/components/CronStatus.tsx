import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface CronRun {
  start_time: string;
  end_time: string | null;
  status: string;
  return_message: string | null;
}

interface CronStatusData {
  found: boolean;
  jobid?: number;
  job_name?: string;
  schedule?: string;
  active?: boolean;
  runs?: CronRun[];
}

const JOB_NAME = 'boss-kill-detector-every-minute';

export const CronStatus = () => {
  const [data, setData] = useState<CronStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.rpc('get_cron_status', { p_job_name: JOB_NAME });
    if (err) setError(err.message);
    else setData(res as unknown as CronStatusData);
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const fmt = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Status do Cron — Detector de Boss Kill</h2>
        <Button onClick={fetchStatus} disabled={loading} size="sm" variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {JOB_NAME}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : !data.found ? (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" /> Cron NÃO encontrado
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Ativo">
                  {data.active ? (
                    <Badge className="bg-green-600 hover:bg-green-600 gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Sim
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="w-3 h-3" /> Não
                    </Badge>
                  )}
                </Stat>
                <Stat label="Schedule"><code className="text-primary">{data.schedule}</code></Stat>
                <Stat label="Job ID">{data.jobid}</Stat>
                <Stat label="Último disparo">{fmt(data.runs?.[0]?.start_time ?? null)}</Stat>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Últimos 10 disparos</h3>
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2">Início</th>
                        <th className="text-left px-3 py-2">Fim</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.runs ?? []).length === 0 ? (
                        <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground text-center">Sem execuções registradas ainda.</td></tr>
                      ) : (
                        data.runs!.map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-3 py-2">{fmt(r.start_time)}</td>
                            <td className="px-3 py-2">{fmt(r.end_time)}</td>
                            <td className="px-3 py-2">
                              <Badge variant={r.status === 'succeeded' ? 'default' : 'destructive'}>{r.status}</Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[300px]">{r.return_message || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="p-3 rounded-md bg-muted/30 border border-border">
    <div className="text-xs text-muted-foreground mb-1">{label}</div>
    <div className="font-medium text-foreground">{children}</div>
  </div>
);
