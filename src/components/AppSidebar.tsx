import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Swords, LogIn, LogOut, User, Crown, Skull, Users,
  Trophy, Target, Flame, Award, Menu, X, Shield,
  ChevronsLeft, ChevronsRight, Crosshair, TrendingDown, BarChart3, Gift, Star, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  requiresAuth?: boolean;
  requiresEdit?: boolean;
  requiresAdmin?: boolean;
}

const navItems: NavItem[] = [
  { id: 'ranking', label: 'Boss Diário', icon: Trophy },
  { id: 'throne', label: 'Throne', icon: Crown },
  { id: 'arka', label: 'Arka War', icon: Crosshair },
  { id: 'reis', label: 'Rei/Cone PVP', icon: Target },
  { id: 'classe-guild', label: 'Classe/Guild', icon: Users },
  { id: 'melhor-classe', label: 'Melhor por Classe', icon: Award },
  { id: 'classe-matchup', label: 'Classe x Classe', icon: Crosshair },
  { id: 'putinha', label: 'Minha Putinha', icon: Flame },
  { id: 'vergonha', label: 'Mural da Vergonha', icon: Skull },
  { id: 'never-positive', label: 'Nunca Positivo', icon: TrendingDown },
  { id: 'fogo-amigo', label: 'Fogo Amigo', icon: Flame },
  { id: 'confrontos', label: 'Confrontos Diretos', icon: Swords },
  { id: 'killstreak', label: 'Kill Streak', icon: Swords },
  { id: 'hall-fama', label: 'Hall da Fama', icon: Star },
  { id: 'marcos', label: 'Marcos', icon: Award },
  { id: 'conquistas', label: 'Conquistas', icon: Award },
  { id: 'analytics', label: 'Análise PvP', icon: BarChart3, requiresAuth: true },
  { id: 'sorteio', label: 'Sorteio', icon: Gift, requiresEdit: true },
  { id: 'placar', label: 'Incluir Dados', icon: Swords, requiresAdmin: true },
  { id: 'cron', label: 'Status Cron', icon: Activity, requiresAdmin: true },
  { id: 'admin', label: 'Admin', icon: Shield, requiresAdmin: true },
];

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const AppSidebar = ({ activeTab, onTabChange }: AppSidebarProps) => {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const { isAdmin, canEditData } = useUserRole();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const filteredItems = navItems.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresEdit && !canEditData) return false;
    if (item.requiresAuth && !user) return false;
    return true;
  });

  const handleSelect = (id: string) => {
    onTabChange(id);
    setOpen(false);
  };

  const NavContent = ({ mini = false, onToggleCollapse }: { mini?: boolean; onToggleCollapse?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className={cn("flex items-center border-b border-border", mini ? "justify-center p-3" : "gap-2 p-4")}>
        <Swords className="w-6 h-6 text-primary shrink-0" />
        {!mini && <span className="font-bold text-lg text-foreground">PVP BOSS</span>}
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              title={mini ? item.label : undefined}
              className={cn(
                "w-full flex items-center text-sm font-medium transition-colors",
                mini ? "justify-center px-2 py-3" : "gap-3 px-4 py-3",
                "hover:bg-accent/10 hover:text-accent",
                isActive
                  ? "bg-primary/15 text-primary border-r-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!mini && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle - desktop only */}
      {!isMobile && onToggleCollapse && (
        <div className="border-t border-border p-2">
          <button
            onClick={onToggleCollapse}
            className={cn(
              "w-full flex items-center text-muted-foreground hover:text-foreground transition-colors py-2",
              mini ? "justify-center" : "gap-3 px-2"
            )}
            title={mini ? "Expandir menu" : "Minimizar menu"}
          >
            {mini ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            {!mini && <span className="text-xs">Minimizar</span>}
          </button>
        </div>
      )}

      <div className={cn("border-t border-border", mini ? "p-2" : "p-2 px-4")}>
        {!mini && user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="truncate">{user.email?.split('@')[0]}</span>
            </div>
            <Button 
              variant="destructive" 
              size="sm" 
              onMouseDown={(e) => {
                e.stopPropagation();
                console.log('Clique no botão Sair (onMouseDown)');
                signOut();
              }}
              className="w-full justify-start gap-2 cursor-pointer relative z-[100]"
            >
              <LogOut className="w-4 h-4" />
              Sair Definitivamente
            </Button>
          </div>
        ) : !mini ? (
          <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="w-full gap-2">
            <LogIn className="w-4 h-4" />
            Login
          </Button>
        ) : (
          user ? (
            <Button 
              variant="destructive" 
              size="icon" 
              onClick={() => signOut()}
              title="Sair" 
              className="w-full cursor-pointer relative z-[100]"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => navigate('/auth')} title="Login" className="w-full">
              <LogIn className="w-4 h-4" />
            </Button>
          )
        )}
      </div>
    </div>
  );

  // Mobile: Sheet overlay
  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="fixed top-4 left-4 z-50 bg-card/80 backdrop-blur-sm border border-border"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-64 p-0 bg-card">
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <NavContent mini={false} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: fixed sidebar with collapse
  return (
    <aside className={cn(
      "shrink-0 bg-card border-r border-border h-screen sticky top-0 overflow-hidden transition-all duration-200",
      collapsed ? "w-14" : "w-60"
    )}>
      <NavContent mini={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
    </aside>
  );
};
