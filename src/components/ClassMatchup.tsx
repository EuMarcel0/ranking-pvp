import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from './ui/table';
import { Crosshair, Download, Image, Calendar as CalendarIcon } from 'lucide-react';
import { EventTypeFilter } from './EventTypeFilter';
import { Button } from './ui/button';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#f43f5e', '#a855f7', '#d946ef', '#0ea5e9',
];

const normalize = (s?: string) =>
  (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

interface MatchupEntry {
  kills: number;
  deaths: number;
}

export const ClassMatchup = () => {
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [eventType, setEventType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch precomputed matchup matrix from RPC
  const { data: matrixRows = [], isLoading } = useQuery({
    queryKey: ['class-matchup-matrix', dateFrom, dateTo, eventType],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_class_matchup_matrix', {
        p_date_from: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : null,
        p_date_to: dateTo ? format(dateTo, 'yyyy-MM-dd') : null,
        p_event_type: eventType,
      });
      if (error) throw error;
      return (data || []) as { attacker_class: string; victim_class: string; kills: number }[];
    },
  });

  // Build matchup matrix from RPC rows
  const { classNames, matchupData } = useMemo(() => {
    const matrix = new Map<string, Map<string, MatchupEntry>>();
    const classSet = new Set<string>();

    matrixRows.forEach(row => {
      const a = row.attacker_class;
      const v = row.victim_class;
      const k = Number(row.kills);
      classSet.add(a); classSet.add(v);

      // Killer side
      if (!matrix.has(a)) matrix.set(a, new Map());
      const arow = matrix.get(a)!;
      const ex = arow.get(v) || { kills: 0, deaths: 0 };
      arow.set(v, { kills: ex.kills + k, deaths: ex.deaths });

      // Victim side mirror
      if (!matrix.has(v)) matrix.set(v, new Map());
      const vrow = matrix.get(v)!;
      const ex2 = vrow.get(a) || { kills: 0, deaths: 0 };
      vrow.set(a, { kills: ex2.kills, deaths: ex2.deaths + k });
    });

    return {
      classNames: Array.from(classSet).sort(),
      matchupData: matrix,
    };
  }, [matrixRows]);

  // Prepare display data for selected class
  const displayData = useMemo(() => {
    if (selectedClass === 'all' || !matchupData.has(selectedClass)) {
      // Show summary: each class total kills/deaths
      return classNames.map(cls => {
        const row = matchupData.get(cls);
        let totalKills = 0, totalDeaths = 0;
        row?.forEach(entry => {
          totalKills += entry.kills;
          totalDeaths += entry.deaths;
        });
        const winRate = totalKills + totalDeaths > 0
          ? ((totalKills / (totalKills + totalDeaths)) * 100).toFixed(1)
          : '0.0';
        return { className: cls, kills: totalKills, deaths: totalDeaths, saldo: totalKills - totalDeaths, winRate };
      }).sort((a, b) => b.kills - a.kills);
    }

    const row = matchupData.get(selectedClass)!;
    return classNames
      .filter(cls => cls !== selectedClass)
      .map(cls => {
        const entry = row.get(cls) || { kills: 0, deaths: 0 };
        const winRate = entry.kills + entry.deaths > 0
          ? ((entry.kills / (entry.kills + entry.deaths)) * 100).toFixed(1)
          : '0.0';
        return {
          className: cls,
          kills: entry.kills,
          deaths: entry.deaths,
          saldo: entry.kills - entry.deaths,
          winRate,
        };
      })
      .sort((a, b) => b.kills - a.kills);
  }, [selectedClass, matchupData, classNames]);

  const chartData = useMemo(() => {
    return displayData.map((d, i) => ({
      name: d.className,
      kills: d.kills,
      deaths: d.deaths,
      saldo: d.saldo,
      winRate: d.winRate,
      fill: COLORS[i % COLORS.length],
    }));
  }, [displayData]);

  const exportToExcel = () => {
    try {
      const data = displayData.map((d, i) => ({
        '#': i + 1,
        'Classe': d.className,
        'Kills': d.kills,
        'Mortes': d.deaths,
        'Saldo': d.saldo,
        'Win Rate %': d.winRate,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Classe x Classe');
      XLSX.writeFile(wb, `classe_matchup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
      toast.success('Excel exportado!');
    } catch { toast.error('Erro ao exportar'); }
  };

  const exportToImage = async () => {
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current, { backgroundColor: '#1a1a2e', scale: 2, logging: false });
      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `classe_matchup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Imagem exportada!');
        }
      });
    } catch { toast.error('Erro ao exportar imagem'); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Crosshair className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-card/50 p-6 rounded-xl border border-border space-y-4">
        <div className="flex flex-wrap gap-4 justify-center items-center">
          <EventTypeFilter value={eventType} onChange={setEventType} />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Classe:</span>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Todas as classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as classes</SelectItem>
                {classNames.map(cls => (
                  <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">De:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Até:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <Button variant="ghost" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setSelectedClass('all'); }} className="text-sm">
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="p-6" ref={chartRef}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold flex-1">
              <Crosshair className="w-6 h-6 inline-block mr-2 text-primary" />
              {selectedClass === 'all' ? 'Kills por Classe (Geral)' : `${selectedClass} vs Outras Classes`}
            </h3>
            <div className="flex gap-2">
              <Button onClick={exportToImage} variant="outline" size="sm" className="gap-2">
                <Image className="w-4 h-4" /> Imagem
              </Button>
              <Button onClick={exportToExcel} variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" /> Excel
              </Button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 50)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 30, top: 5, bottom: 5 }}>
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" width={110} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'kills') return [`${value}`, 'Kills'];
                  return [`${value}`, 'Mortes'];
                }}
              />
              {selectedClass !== 'all' ? (
                <>
                  <Bar dataKey="kills" name="kills" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="deaths" name="deaths" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </>
              ) : (
                <Bar dataKey="kills" name="kills" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Table */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">
          {selectedClass === 'all' ? 'Resumo por Classe' : `${selectedClass} - Detalhamento`}
        </h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{selectedClass === 'all' ? 'Classe' : 'Classe Alvo'}</TableHead>
                <TableHead className="text-right">Kills</TableHead>
                <TableHead className="text-right">Mortes</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Win Rate %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((d, i) => (
                <TableRow key={d.className}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{d.className}</TableCell>
                  <TableCell className="text-right text-green-400">{d.kills}</TableCell>
                  <TableCell className="text-right text-red-400">{d.deaths}</TableCell>
                  <TableCell className={cn("text-right font-semibold", d.saldo > 0 ? "text-green-400" : d.saldo < 0 ? "text-red-400" : "text-muted-foreground")}>
                    {d.saldo > 0 ? '+' : ''}{d.saldo}
                  </TableCell>
                  <TableCell className="text-right">{d.winRate}%</TableCell>
                </TableRow>
              ))}
              {displayData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum dado encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
