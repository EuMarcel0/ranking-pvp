import { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Skull, Crosshair, TrendingUp, FileSpreadsheet, Image, Database, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';

import { KillLog, EventType } from '@/utils/txtParser';

export interface PlayerStats {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
}

interface ScoreboardProps {
  players: PlayerStats[];
  bossLabel?: string | null;
  killLogs?: KillLog[];
  eventType?: EventType;
}

type SortKey = 'kills' | 'deaths' | 'kda' | 'score';

const calcScore = (p: PlayerStats) => (p.kills * 3) + (p.kda * 1) + 1 - (p.deaths * 3);

export const Scoreboard = ({ players, bossLabel, killLogs = [], eventType = 'boss_event' }: ScoreboardProps) => {
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const scoreboardRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (sortBy === 'score') return calcScore(b) - calcScore(a);
      return b[sortBy] - a[sortBy];
    });
  }, [players, sortBy]);

  const topPlayer = sortedPlayers[0];

  // Classificações especiais
  const reiDoPVP = useMemo(() => {
    return [...players].sort((a, b) => b.kills - a.kills)[0];
  }, [players]);

  const brabissimo = useMemo(() => {
    return [...players].sort((a, b) => b.kda - a.kda)[0];
  }, [players]);

  const coneMonodedo = useMemo(() => {
    return [...players].sort((a, b) => b.deaths - a.deaths)[0];
  }, [players]);

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Crosshair className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>Nenhum dado encontrado. Faça upload de um arquivo .txt para começar.</p>
      </div>
    );
  }

  const exportToExcel = () => {
    const dataToExport = sortedPlayers.map((player, index) => ({
      'Rank': index + 1,
      'Jogador': player.name,
      'Kills': player.kills,
      'Deaths': player.deaths,
      'KDA': player.kda.toFixed(2),
      'Pontuação': calcScore(player).toFixed(2)
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Placar');
    XLSX.writeFile(workbook, 'battle-scoreboard.xlsx');
  };

  const exportToImage = async () => {
    if (!scoreboardRef.current) return;

    try {
      const canvas = await html2canvas(scoreboardRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        logging: false,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const fileName = bossLabel 
            ? `placar-humilhacao-${bossLabel.replace(/\s+/g, '-').replace(/\//g, '-')}.jpg`
            : 'placar-humilhacao.jpg';
          link.download = fileName;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/jpeg', 0.95);
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
    }
  };

  const saveToDatabase = async () => {
    // Check if user is authenticated
    if (!user) {
      toast({
        title: "Login necessário",
        description: "Você precisa fazer login para salvar dados",
        variant: "destructive"
      });
      navigate('/auth');
      return;
    }

    if (!bossLabel || players.length === 0) {
      toast({
        title: "Erro",
        description: "Não há dados para salvar",
        variant: "destructive"
      });
      return;
    }

    try {
      // Detect event type from boss label prefix if not provided
      const detectedEventType = bossLabel?.startsWith('throne') ? 'throne_conquest' : eventType;
      
      // Parse date and hour from boss/throne label (format: "boss DD/MM HH horas" or "throne DD/MM HH horas")
      const match = bossLabel.match(/(boss|throne) (\d{2})\/(\d{2}) (\d{1,2}) horas/);
      if (!match) {
        throw new Error("Formato de label inválido");
      }

      const day = parseInt(match[2]);
      const month = parseInt(match[3]);
      const hour = parseInt(match[4]);
      const year = new Date().getFullYear();
      const matchDate = new Date(year, month - 1, day);
      const formattedDate = matchDate.toISOString().split('T')[0];

      // Check if match already exists (with same event_type)
      const { data: existingMatch } = await supabase
        .from('pvp_matches')
        .select('id')
        .eq('match_date', formattedDate)
        .eq('match_hour', hour)
        .eq('event_type', detectedEventType)
        .maybeSingle();

      if (existingMatch) {
        toast({
          title: "Duplicado",
          description: "Já existe um registro para esta data e hora",
          variant: "destructive"
        });
        return;
      }

      // Insert match with event_type
      const { data: matchData, error: matchError } = await supabase
        .from('pvp_matches')
        .insert({
          boss_label: bossLabel,
          match_date: formattedDate,
          match_hour: hour,
          event_type: detectedEventType
        })
        .select()
        .single();

      if (matchError) throw matchError;

      // Insert players
      const playersData = players.map(player => ({
        match_id: matchData.id,
        player_name: player.name,
        kills: player.kills,
        deaths: player.deaths,
        kda: player.kda
      }));

      const { error: playersError } = await supabase
        .from('pvp_match_players')
        .insert(playersData);

      if (playersError) throw playersError;

      // Insert kill logs if available
      if (killLogs.length > 0) {
        const killLogsData = killLogs.map(log => ({
          match_id: matchData.id,
          killer_name: log.killer,
          victim_name: log.victim
        }));

        const { error: killLogsError } = await supabase
          .from('pvp_kill_logs')
          .insert(killLogsData);

        if (killLogsError) {
          console.error('Erro ao salvar kill logs:', killLogsError);
          // Não falhar a operação toda se os kill logs não salvarem
        }
      }

      toast({
        title: "Sucesso!",
        description: "Dados salvos no banco de dados",
      });
    } catch (error) {
      console.error('Erro ao salvar no banco:', error);
      toast({
        title: "Erro",
        description: "Falha ao salvar no banco de dados",
        variant: "destructive"
      });
    }
  };

  const SortButton = ({ label, sortKey, icon: Icon }: { label: string; sortKey: SortKey; icon: any }) => (
    <button
      onClick={() => setSortBy(sortKey)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300",
        sortBy === sortKey
          ? "bg-primary text-primary-foreground glow-primary"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div ref={scoreboardRef} className="space-y-6">
      {/* Boss Label */}
      {bossLabel && (
        <div className="text-center">
          <div className="inline-block bg-primary/20 border-2 border-primary rounded-lg px-6 py-3">
            <p className="text-xl font-bold text-primary uppercase tracking-wider">
              {bossLabel}
            </p>
          </div>
        </div>
      )}

      {/* Classificações Especiais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-warning/10 border-2 border-warning rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Trophy className="w-10 h-10 text-warning mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-warning mb-2">👑 Rei do PVP</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{reiDoPVP?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-success font-bold">{reiDoPVP?.kills}</span> kills
          </p>
        </div>

        <div className="bg-primary/10 border-2 border-primary rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-primary mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-primary mb-2">⚡ Brabissimo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{brabissimo?.name}</p>
          <p className="text-sm text-muted-foreground">
            KDA: <span className="text-warning font-bold">{brabissimo?.kda.toFixed(2)}</span>
          </p>
        </div>

        <div className="bg-destructive/10 border-2 border-destructive rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Skull className="w-10 h-10 text-destructive mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-destructive mb-2">🍦 Cone monodedo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{coneMonodedo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive font-bold">{coneMonodedo?.deaths}</span> deaths
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 justify-center items-center">
        <SortButton label="Pontuação" sortKey="score" icon={Star} />
        <SortButton label="Kills" sortKey="kills" icon={Crosshair} />
        <SortButton label="Deaths" sortKey="deaths" icon={Skull} />
        <SortButton label="KDA" sortKey="kda" icon={TrendingUp} />
        <Button 
          onClick={exportToExcel}
          className="flex items-center gap-2 glow-success"
          variant="default"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Exportar Excel
        </Button>
        <Button 
          onClick={exportToImage}
          className="flex items-center gap-2 glow-primary"
          variant="default"
        >
          <Image className="w-4 h-4" />
          Exportar Imagem
        </Button>
        <Button 
          onClick={saveToDatabase}
          className="flex items-center gap-2 opacity-20 hover:opacity-100 transition-opacity duration-300"
          variant="ghost"
          size="sm"
        >
          <Database className="w-3 h-3" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Jogador
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-success uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Crosshair className="w-4 h-4" />
                    Kills
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-destructive uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Skull className="w-4 h-4" />
                    Deaths
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-warning uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    KDA
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-primary uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Star className="w-4 h-4" />
                    Pontuação
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedPlayers.map((player, index) => {
                const isTopPlayer = player.name === topPlayer.name;
                return (
                  <tr
                    key={player.name}
                    className={cn(
                      "transition-all duration-300 hover:bg-secondary/30",
                      isTopPlayer && "bg-primary/5"
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <Trophy className="w-5 h-5 text-warning animate-pulse" />
                        )}
                        <span className={cn(
                          "font-bold text-lg",
                          index === 0 && "text-warning text-glow"
                        )}>
                          #{index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "font-semibold text-base",
                        isTopPlayer && "text-primary text-glow"
                      )}>
                        {player.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-success text-lg glow-success">
                        {player.kills}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-destructive text-lg glow-destructive">
                        {player.deaths}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-warning text-lg">
                        {player.kda.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-primary text-lg glow-primary">
                        {calcScore(player).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-success/10 border border-success/30 rounded-lg p-6 text-center">
          <Crosshair className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Total de Kills</p>
          <p className="text-3xl font-bold text-success glow-success">
            {players.reduce((sum, p) => sum + p.kills, 0)}
          </p>
        </div>
        
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <Skull className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Total de Deaths</p>
          <p className="text-3xl font-bold text-destructive glow-destructive">
            {players.reduce((sum, p) => sum + p.deaths, 0)}
          </p>
        </div>
        
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
          <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Jogadores</p>
          <p className="text-3xl font-bold text-primary glow-primary">
            {players.length}
          </p>
        </div>
      </div>
    </div>
  );
};
