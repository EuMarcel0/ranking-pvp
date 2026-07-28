import { useState } from 'react';
import { Upload, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface ParsedKill {
  killer: string;
  victim: string;
  time: string | null;
}

export const ArkaWarImport = () => {
  const queryClient = useQueryClient();
  const [importDate, setImportDate] = useState<Date>();
  const [importHour, setImportHour] = useState<number>(21);
  const [parsedKills, setParsedKills] = useState<ParsedKill[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      const startRow = rows[0]?.some(cell =>
        typeof cell === 'string' && /assassino|vitima|hora|abate/i.test(cell)
      ) ? 1 : 0;

      const kills: ParsedKill[] = [];
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const killer = String(row[0] || '').trim();
        const victim = String(row[1] || '').trim();
        if (killer && victim && killer.length <= 50 && victim.length <= 50) {
          const timeVal = row[2] !== undefined ? String(row[2]).trim() : null;
          kills.push({ killer, victim, time: timeVal });
        }
      }

      if (kills.length === 0) {
        toast({ title: 'Erro', description: 'Nenhum kill encontrado na planilha. Verifique o formato: Assassino | Vitimas | Hora/Abate', variant: 'destructive' });
        return;
      }

      if (kills[0].time) {
        const hourMatch = kills[0].time.match(/(\d{1,2}):/);
        if (hourMatch) setImportHour(parseInt(hourMatch[1]));
      }

      setParsedKills(kills);
      setFileName(file.name);
      toast({ title: 'Planilha lida', description: `${kills.length} kills encontrados. Selecione a data e confirme a importação.` });
    } catch (err) {
      console.error('Error parsing Excel:', err);
      toast({ title: 'Erro', description: 'Falha ao ler a planilha Excel', variant: 'destructive' });
    }

    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importDate || parsedKills.length === 0) {
      toast({ title: 'Erro', description: 'Selecione a data do evento e carregue a planilha', variant: 'destructive' });
      return;
    }

    setImporting(true);
    try {
      const matchDate = format(importDate, 'yyyy-MM-dd');

      const { data: existing } = await supabase
        .from('pvp_matches')
        .select('id')
        .eq('match_date', matchDate)
        .eq('match_hour', importHour)
        .eq('event_type', 'arka_war');

      if (existing && existing.length > 0) {
        toast({ title: 'Duplicado', description: `Já existe um evento Arka War nesta data (${matchDate}) e hora (${importHour}h)`, variant: 'destructive' });
        setImporting(false);
        return;
      }

      const { data: match, error: matchError } = await supabase
        .from('pvp_matches')
        .insert({
          match_date: matchDate,
          match_hour: importHour,
          event_type: 'arka_war',
          boss_label: `arka ${format(importDate, 'dd/MM')} ${importHour} horas`,
        })
        .select('id')
        .single();

      if (matchError) throw matchError;

      const BATCH = 500;
      for (let i = 0; i < parsedKills.length; i += BATCH) {
        const batch = parsedKills.slice(i, i + BATCH).map(k => ({
          match_id: match.id,
          killer_name: k.killer,
          victim_name: k.victim,
        }));
        const { error } = await supabase.from('pvp_kill_logs').insert(batch);
        if (error) throw error;
      }

      const playerMap = new Map<string, { kills: number; deaths: number }>();
      for (const k of parsedKills) {
        const ks = playerMap.get(k.killer) || { kills: 0, deaths: 0 };
        ks.kills++;
        playerMap.set(k.killer, ks);
        const vs = playerMap.get(k.victim) || { kills: 0, deaths: 0 };
        vs.deaths++;
        playerMap.set(k.victim, vs);
      }

      const matchPlayers = Array.from(playerMap.entries()).map(([name, stats]) => ({
        match_id: match.id,
        player_name: name,
        kills: stats.kills,
        deaths: stats.deaths,
        kda: stats.deaths === 0 ? stats.kills : parseFloat((stats.kills / stats.deaths).toFixed(2)),
      }));

      for (let i = 0; i < matchPlayers.length; i += BATCH) {
        const batch = matchPlayers.slice(i, i + BATCH);
        const { error } = await supabase.from('pvp_match_players').insert(batch);
        if (error) throw error;
      }

      toast({ title: 'Sucesso!', description: `Arka War importado: ${parsedKills.length} kills, ${playerMap.size} jogadores` });
      setParsedKills([]);
      setFileName('');
      setImportDate(undefined);
      queryClient.invalidateQueries({ queryKey: ['ranking-arka-war'] });
    } catch (err: any) {
      console.error('Import error:', err);
      toast({ title: 'Erro', description: err.message || 'Falha ao importar dados', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="border-orange-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Upload className="w-5 h-5 text-orange-500" />
          Importar Dados de Arka War
        </CardTitle>
        <CardDescription>
          Formato da planilha: Assassino | Vitimas | Hora/Abate
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Planilha Excel</label>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="w-[250px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Data do Evento</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !importDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {importDate ? format(importDate, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={importDate} onSelect={setImportDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Hora</label>
            <Select value={String(importHour)} onValueChange={v => setImportHour(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleImport} disabled={importing || parsedKills.length === 0 || !importDate} className="gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Importando...' : `Importar${parsedKills.length > 0 ? ` (${parsedKills.length} kills)` : ''}`}
          </Button>
        </div>
        {fileName && parsedKills.length > 0 && (
          <p className="text-sm text-muted-foreground mt-2">📄 {fileName} — {parsedKills.length} kills prontos para importar</p>
        )}
      </CardContent>
    </Card>
  );
};
