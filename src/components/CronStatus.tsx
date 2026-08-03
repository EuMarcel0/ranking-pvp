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

const JOBS = [
  { name: 'boss-kill-detector-every-minute', title: 'Detector de Boss Kill' },
  { name: 'monthly-close-season-day-1', title: 'Fechamento mensal + imagem Hall da Fama' },
] as const;

function CronJobCard({
  title,
  data,
}: {
  title: string;
  data: CronStatusData | null;
}) {
  const fmt = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-5 h-5 text-primary" />
          {title}
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
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={data.active ? 'default' : 'destructive'}>
                {data.active ? 'Ativo' : 'Inativo'}
              </Badge>
              <Badge variant="outline">{data.job_name}</Badge>
              <Badge variant="outline">schedule: {data.schedule}</Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Últimas execuções</p>
              {(data.runs ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem runs ainda</p>
              ) : (
                <ul className="space-y-1 text-xs font-mono">
                  {(data.runs ?? []).slice(0, 8).map((r, i) => (
                    <li key={i} className="flex flex-wrap gap-2 border-b border-border/40 py-1">
                      <span className={r.status === 'succeeded' ? 'text-green-500' : 'text-yellow-500'}>
                        {r.status === 'succeeded' ? (
                          <CheckCircle2 className="inline w-3 h-3" />
                        ) : null}{' '}
                        {r.status}
                      </span>
                      <span>{fmt(r.start_time)}</span>
                      {r.return_message && (
                        <span className="text-muted-foreground truncate max-w-full">{r.return_message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const CronStatus = () => {
  const [jobs, setJobs] = useState<Record<string, CronStatusData | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const next: Record<string, CronStatusData | null> = {};
      for (const job of JOBS) {
        const { data: res, error: err } = await supabase.rpc('get_cron_status', {
          p_job_name: job.name,
        });
        if (err) throw err;
        next[job.name] = res as unknown as CronStatusData;
      }
      setJobs(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Status dos Crons</h2>
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

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
        {JOBS.map((job) => (
          <CronJobCard key={job.name} title={job.title} data={jobs[job.name] ?? null} />
        ))}
      </div>
    </div>
  );
};
