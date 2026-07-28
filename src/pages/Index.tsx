import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FileUpload } from '@/components/FileUpload';
import { Scoreboard, PlayerStats } from '@/components/Scoreboard';
import { RankingGeral } from '@/components/RankingGeral';
import { RankingThroneConquest } from '@/components/RankingThroneConquest';
import { ClassGuildRanking } from '@/components/ClassGuildRanking';
import { PutinhaRanking } from '@/components/PutinhaRanking';
import { MuralDaVergonha } from '@/components/MuralDaVergonha';
import { KillStreakRanking } from '@/components/KillStreakRanking';
import { ReisDoPVP } from '@/components/ReisDoPVP';
import { BestPerClassRanking } from '@/components/BestPerClassRanking';
import { ClassMatchup } from '@/components/ClassMatchup';
import { NeverPositiveKDA } from '@/components/NeverPositiveKDA';
import { RankingFogoAmigo } from '@/components/RankingFogoAmigo';
import { ConfrontosDiretos } from '@/components/ConfrontosDiretos';
import { DatabaseManager } from '@/components/DatabaseManager';
import { CronStatus } from '@/components/CronStatus';
import { PvPAnalyticsDashboard } from '@/components/analytics/PvPAnalyticsDashboard';
import { HallDaFama } from '@/components/HallDaFama';
import { MarcosConquistas } from '@/components/MarcosConquistas';
import { Conquistas } from '@/components/Conquistas';
import { RankingArkaWar } from '@/components/RankingArkaWar';
import { LegendsSorteio } from '@/components/LegendsSorteio';
import { DatabaseImport } from '@/components/DatabaseImport';
import { ArkaWarImport } from '@/components/ArkaWarImport';
import { parseTxtFile, ParseResult } from '@/utils/txtParser';
import { Swords, FileText, Database, Crown, Crosshair } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { AppSidebar } from '@/components/AppSidebar';
import { LiveIndicator } from '@/components/LiveIndicator';
import { useRealtimeRankings } from '@/hooks/useRealtimeRankings';

const Index = () => {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [bossLabel, setBossLabel] = useState<string | null>(null);
  const [killLogs, setKillLogs] = useState<any[]>([]);
  const [eventType, setEventType] = useState<'boss_event' | 'throne_conquest'>('boss_event');
  const { user } = useAuth();
  const { canEditData, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lastEventAt } = useRealtimeRankings();

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    if (tab) return tab;
    return 'ranking';
  });

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    } else if (!user && activeTab === 'placar') {
      setActiveTab('ranking');
    }
  }, [searchParams, user, activeTab]);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    if (searchParams.get('subtab') || searchParams.get('filter')) {
      navigate(`/?tab=${newTab}`, { replace: true });
    }
  };

  const [importSource, setImportSource] = useState<'txt' | 'database' | 'arka'>('txt');
  const [importEventType, setImportEventType] = useState<'boss_event' | 'throne_conquest'>('boss_event');

  const handleFileUpload = (content: string) => {
    const result = parseTxtFile(content);
    setPlayers(result.players);
    setBossLabel(result.bossLabel);
    setKillLogs(result.killLogs);
    setEventType(result.eventType);
  };

  const handleDatabaseImport = (result: ParseResult) => {
    setPlayers(result.players);
    setBossLabel(result.bossLabel);
    setKillLogs(result.killLogs);
    setEventType(result.eventType);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'placar':
        if (!canEditData) return null;
        return (
          <div className="space-y-8">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                <Button variant={importSource === 'txt' ? 'default' : 'ghost'} size="sm" onClick={() => setImportSource('txt')} className="gap-2">
                  <FileText className="w-4 h-4" /> Arquivo TXT
                </Button>
                <Button variant={importSource === 'database' ? 'default' : 'ghost'} size="sm" onClick={() => setImportSource('database')} className="gap-2">
                  <Database className="w-4 h-4" /> Banco de Dados
                </Button>
                <Button variant={importSource === 'arka' ? 'default' : 'ghost'} size="sm" onClick={() => setImportSource('arka')} className="gap-2">
                  <Crosshair className="w-4 h-4" /> Arka War
                </Button>
              </div>
              {importSource === 'database' && (
                <div className="flex gap-2 p-1 bg-muted/30 rounded-lg">
                  <Button variant={importEventType === 'boss_event' ? 'default' : 'ghost'} size="sm" onClick={() => setImportEventType('boss_event')} className="gap-2">
                    <Swords className="w-4 h-4" /> Boss Event (PvP Square)
                  </Button>
                  <Button variant={importEventType === 'throne_conquest' ? 'default' : 'ghost'} size="sm" onClick={() => setImportEventType('throne_conquest')} className="gap-2">
                    <Crown className="w-4 h-4" /> Throne Conquest (Devias)
                  </Button>
                </div>
              )}
              {importSource === 'txt' && <FileUpload onFileUpload={handleFileUpload} />}
              {importSource === 'database' && <DatabaseImport onDataLoaded={handleDatabaseImport} eventType={importEventType} />}
              {importSource === 'arka' && <ArkaWarImport />}
            </div>
            {importSource !== 'arka' && <Scoreboard players={players} bossLabel={bossLabel} killLogs={killLogs} eventType={eventType} />}
          </div>
        );
      case 'ranking':
        return <RankingGeral />;
      case 'throne':
        return <RankingThroneConquest />;
      case 'arka':
        return <RankingArkaWar />;
      case 'reis':
        return <ReisDoPVP />;
      case 'classe-guild':
        return <ClassGuildRanking />;
      case 'melhor-classe':
        return <BestPerClassRanking />;
      case 'classe-matchup':
        return <ClassMatchup />;
      case 'putinha':
        return <PutinhaRanking />;
      case 'vergonha':
        return <MuralDaVergonha />;
      case 'never-positive':
        return <NeverPositiveKDA />;
      case 'fogo-amigo':
        return <RankingFogoAmigo />;
      case 'confrontos':
        return <ConfrontosDiretos />;
      case 'killstreak':
        return <KillStreakRanking />;
      case 'analytics':
        return <PvPAnalyticsDashboard />;
      case 'hall-fama':
        return <HallDaFama />;
      case 'marcos':
        return <MarcosConquistas />;
      case 'conquistas':
        return <Conquistas />;
      case 'sorteio':
        return <LegendsSorteio />;
      case 'admin':
        return <DatabaseManager />;
      case 'cron':
        return <CronStatus />;
      default:
        return <RankingGeral />;
    }
  };


  return (
    <div className="min-h-screen bg-background gradient-gaming flex">
      <Helmet>
        <title>Ranking de Kill - PVP BOSS</title>
        <meta name="description" content="Ranking de PvP BOSS: kills, deaths, KDA e score por jogador, classe e guild. Acompanhe Boss, Throne Conquest e Arka War em tempo real." />
        <link rel="canonical" href="https://rankingpvpboss.lovable.app/" />
        <meta property="og:title" content="Ranking de Kill - PVP BOSS" />
        <meta property="og:description" content="Ranking de PvP BOSS: kills, deaths, KDA e score por jogador, classe e guild." />
        <meta property="og:url" content="https://rankingpvpboss.lovable.app/" />
        <meta property="og:type" content="website" />
      </Helmet>
      <AppSidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex-1 flex flex-col min-h-screen">
        <main className="container mx-auto px-4 py-8 max-w-6xl flex-1">
          <header className="text-center mb-8 relative">
            <div className="absolute right-0 top-0">
              <LiveIndicator lastEventAt={lastEventAt} />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground text-glow flex items-center justify-center gap-3">
              <Swords className="w-8 h-8 md:w-12 md:h-12 text-primary animate-pulse" />
              Ranking de Kill - PVP BOSS
              <Swords className="w-8 h-8 md:w-12 md:h-12 text-primary animate-pulse" />
            </h1>
            <p className="text-sm md:text-lg text-muted-foreground mt-2">
              Aqui separamos os homens das crianças, quem é superior no pvp? quem mais se destaca?
            </p>
          </header>

          <div className="space-y-8">
            {renderContent()}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default Index;
