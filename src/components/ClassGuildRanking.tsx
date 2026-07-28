import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from './ui/table';
import { Crosshair, Users, Sword, AlertCircle, Calendar as CalendarIcon, Download, Image } from 'lucide-react';
import { EventTypeFilter } from './EventTypeFilter';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

interface PlayerWithCharacter {
  player_name: string;
  kills: number;
  deaths: number;
  class: string | null;
  guild: string | null;
}

interface AggregatedStats {
  name: string;
  totalKills: number;
  totalDeaths: number;
  totalKda: number;
  playerCount: number;
  isGeneric?: boolean;
}

type FilterType = 'class' | 'guild';

const COLORS = [
  '#3b82f6', // Azul
  '#ef4444', // Vermelho
  '#10b981', // Verde
  '#f59e0b', // Laranja
  '#8b5cf6', // Roxo
  '#ec4899', // Rosa
  '#06b6d4', // Ciano
  '#84cc16', // Lima
  '#f97316', // Laranja escuro
  '#6366f1', // Índigo
  '#14b8a6', // Teal
  '#f43f5e', // Rosa escuro
  '#a855f7', // Roxo claro
  '#d946ef', // Magenta
  '#0ea5e9', // Azul céu
  '#22c55e', // Verde claro
  '#eab308', // Amarelo
  '#fb923c', // Laranja pêssego
  '#c084fc', // Lavanda
  '#facc15', // Amarelo ouro
  '#4ade80', // Verde menta
  '#fb7185', // Rosa coral
  '#38bdf8', // Azul claro
  '#fbbf24', // Âmbar
  '#a78bfa', // Violeta
];

export const ClassGuildRanking = () => {
  const [filterType, setFilterType] = useState<FilterType>('class');
  const [eventType, setEventType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const BOSS_HOURS = [20, 21, 22];

  const { data: playersData, isLoading } = useQuery({
    queryKey: ['players-with-characters', dateFrom, dateTo, hourFrom, hourTo, eventType],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_class_guild_ranking', {
        p_date_from: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : null,
        p_date_to: dateTo ? format(dateTo, 'yyyy-MM-dd') : null,
        p_hour_from: hourFrom ?? null,
        p_hour_to: hourTo ?? null,
        p_event_type: eventType,
      });
      if (error) throw error;
      const result: PlayerWithCharacter[] = (data || []).map((r: any) => ({
        player_name: r.player_name,
        kills: Number(r.kills),
        deaths: Number(r.deaths),
        class: r.player_class || null,
        guild: r.player_guild || null,
      }));
      return result;
    },
  });

  const aggregatedStats = useMemo(() => {
    if (!playersData) return [];

    const statsMap = new Map<string, AggregatedStats>();

    playersData.forEach((player) => {
      const key =
        filterType === 'class'
          ? player.class || 'Genérico (Sem Classe)'
          : player.guild || 'Genérico (Sem Guild)';

      const playerKda = player.deaths > 0 ? player.kills / player.deaths : player.kills;

      const existing = statsMap.get(key) || {
        name: key,
        totalKills: 0,
        totalDeaths: 0,
        totalKda: 0,
        playerCount: 0,
        isGeneric: !player.class || !player.guild,
      };

      statsMap.set(key, {
        name: key,
        totalKills: existing.totalKills + player.kills,
        totalDeaths: existing.totalDeaths + player.deaths,
        totalKda: existing.totalKda + playerKda,
        playerCount: existing.playerCount + 1,
        isGeneric: key.includes('Genérico'),
      });
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalKills - a.totalKills);
  }, [playersData, filterType]);

  const unregisteredPlayers = useMemo(() => {
    if (!playersData) return [];
    
    // Normalize function for consistent comparisons
    const normalize = (s?: string) =>
      (s ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    // Check if a value looks like "sem guild" placeholder
    const isSemGuild = (val?: string) => {
      const normalized = normalize(val).replace(/[^a-z]/g, '');
      return normalized === 'semguild';
    };

    // Check if a value is missing (but "sem guild" is not considered missing)
    const isMissing = (val?: string) => {
      if (isSemGuild(val)) return false;
      const v = normalize(val);
      return !v || v === '-' || v === 'n/a' || v === 'none';
    };

    // A player is unregistered if both guild and class are missing
    return playersData.filter((p) => isMissing(p.guild) && isMissing(p.class));
  }, [playersData]);

  const chartData = useMemo(() => {
    return aggregatedStats
      .filter(stat => !stat.isGeneric)
      .map(stat => ({
        name: stat.name,
        value: stat.totalKills,
      }));
  }, [aggregatedStats]);

  const exportToExcel = () => {
    try {
      const data = aggregatedStats.map((stat, index) => ({
        Rank: index + 1,
        [filterType === 'class' ? 'Classe' : 'Guild']: stat.name,
        'Total Kills': stat.totalKills,
        'Total Deaths': stat.totalDeaths,
        'Jogadores': stat.playerCount,
        'Média Kills': (stat.totalKills / stat.playerCount).toFixed(2),
        'KDA Médio': (stat.totalKda / stat.playerCount).toFixed(2),
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Ranking ${filterType}`);

      const fileName = `ranking_${filterType}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      toast.success('Arquivo Excel exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar para Excel:', error);
      toast.error('Erro ao exportar para Excel');
    }
  };

  const exportToImage = async () => {
    if (!chartRef.current) return;

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#1a1a2e',
        scale: 2,
        logging: false,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ranking_${filterType}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.png`;
          link.click();
          URL.revokeObjectURL(url);
          toast.success('Imagem exportada com sucesso!');
        }
      });
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
      toast.error('Erro ao exportar imagem');
    }
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
      {/* Filtros de Data e Hora */}
      <div className="bg-card/50 p-6 rounded-xl border border-border space-y-4">
        <div className="flex flex-wrap gap-4 justify-center items-center">
          <EventTypeFilter value={eventType} onChange={setEventType} />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">De:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Até:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Hora Inicial:</span>
            <select
              value={hourFrom ?? ''}
              onChange={(e) => setHourFrom(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {BOSS_HOURS.map((hour) => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Hora Final:</span>
            <select
              value={hourTo ?? ''}
              onChange={(e) => setHourTo(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {BOSS_HOURS.map((hour) => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setDateFrom(undefined);
              setDateTo(undefined);
              setHourFrom(undefined);
              setHourTo(undefined);
            }}
            className="text-sm"
          >
            Limpar Filtros
          </Button>
        </div>
      </div>

      {chartData.length > 0 && (
        <Card className="p-6" ref={chartRef}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-center flex-1">
              Distribuição de Kills por {filterType === 'class' ? 'Classe' : 'Guild'}
            </h3>
            <div className="flex gap-2">
              <Button
                onClick={exportToImage}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Image className="w-4 h-4" />
                Exportar Imagem
              </Button>
              <Button
                onClick={exportToExcel}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar Excel
              </Button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={500}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`${value} kills`, 'Total']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
                formatter={(value, entry: any) => {
                  const percent = ((entry.payload.value / chartData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
                  return `${value} (${percent}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      {unregisteredPlayers.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {unregisteredPlayers.length} jogador(es) sem cadastro completo. Cadastre-os para
              estatísticas mais precisas.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => user ? navigate('/?tab=admin&subtab=personagens&filter=unregistered') : navigate('/auth')}
            >
              Gerenciar Personagens
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-6" ref={tableRef}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {filterType === 'class' ? (
              <Sword className="w-6 h-6 text-primary" />
            ) : (
              <Users className="w-6 h-6 text-primary" />
            )}
            <h2 className="text-2xl font-bold">
              Ranking por {filterType === 'class' ? 'Classe' : 'Guild'}
            </h2>
          </div>

          <div className="flex gap-2 items-center">
            <Select
              value={filterType}
              onValueChange={(value) => setFilterType(value as FilterType)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Por Classe</SelectItem>
                <SelectItem value="guild">Por Guild</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>{filterType === 'class' ? 'Classe' : 'Guild'}</TableHead>
                <TableHead className="text-right">Total Kills</TableHead>
                <TableHead className="text-right">Total Deaths</TableHead>
                <TableHead className="text-right">Jogadores</TableHead>
                <TableHead className="text-right">Média Kills</TableHead>
                <TableHead className="text-right">KDA Médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregatedStats.map((stat, index) => (
                <TableRow
                  key={stat.name}
                  className={stat.isGeneric ? 'bg-muted/50' : ''}
                >
                  <TableCell className="font-medium">#{index + 1}</TableCell>
                  <TableCell className="font-semibold">
                    {stat.name}
                    {stat.isGeneric && (
                      <AlertCircle className="inline-block ml-2 w-4 h-4 text-yellow-600" />
                    )}
                  </TableCell>
                  <TableCell className="text-right text-green-600 font-bold">
                    {stat.totalKills}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    {stat.totalDeaths}
                  </TableCell>
                  <TableCell className="text-right">{stat.playerCount}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(stat.totalKills / stat.playerCount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {(stat.totalKda / stat.playerCount).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            Total de {filterType === 'class' ? 'classes' : 'guilds'}:{' '}
            {aggregatedStats.length}
          </p>
          <p>
            Total de kills: {aggregatedStats.reduce((sum, s) => sum + s.totalKills, 0)}
          </p>
        </div>
      </Card>
    </div>
  );
};
