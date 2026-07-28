import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trophy, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MatchMeta { id: string; date: string; hour?: number | null }

interface Props {
  matchIds?: string[];
  matches?: MatchMeta[];
  guilds: string[];
  onWinnerChange?: (winner: string | null) => void;
}

export const WinnerGuildPicker = ({ matchIds, matches, guilds, onWinnerChange }: Props) => {
  const { isAdmin } = useUserRole();
  const canEdit = isAdmin;

  // Group by date
  const grouped = useMemo(() => {
    const list = matches && matches.length > 0
      ? matches
      : (matchIds || []).map(id => ({ id, date: '__all__' as string }));
    const byDate = new Map<string, string[]>();
    for (const m of list) {
      const arr = byDate.get(m.date) || [];
      arr.push(m.id);
      byDate.set(m.date, arr);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, ids]) => ({ date, ids }));
  }, [matches, matchIds]);

  const guildOptions = useMemo(
    () => Array.from(new Set(guilds.filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [guilds]
  );

  const allIds = useMemo(() => grouped.flatMap(g => g.ids), [grouped]);

  const [winners, setWinners] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!allIds.length) {
        setWinners({});
        setSelected({});
        onWinnerChange?.(null);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('pvp_matches')
        .select('id, match_date, winner_guild')
        .in('id', allIds);
      setLoading(false);
      if (cancelled) return;
      if (error) {
        console.error('winner load error', error);
        return;
      }
      const winByDate: Record<string, string | null> = {};
      for (const g of grouped) {
        const rows = (data || []).filter((r: any) => g.ids.includes(r.id));
        const uniq = Array.from(new Set(rows.map((r: any) => r.winner_guild).filter(Boolean)));
        winByDate[g.date] = uniq.length === 1 ? uniq[0] as string : null;
      }
      setWinners(winByDate);
      const sel: Record<string, string> = {};
      Object.entries(winByDate).forEach(([d, w]) => { sel[d] = w || '__none__'; });
      setSelected(sel);
      // Notify with single winner if there is exactly one date and one winner
      if (grouped.length === 1) onWinnerChange?.(winByDate[grouped[0].date] || null);
      else onWinnerChange?.(null);
    };
    load();
    return () => { cancelled = true; };
  }, [allIds.join(',')]);

  const handleSave = async (date: string, ids: string[]) => {
    const value = (selected[date] === '__none__' || !selected[date]) ? null : selected[date];
    setSavingDate(date);
    const { error } = await supabase
      .from('pvp_matches')
      .update({ winner_guild: value })
      .in('id', ids);
    setSavingDate(null);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setWinners(prev => ({ ...prev, [date]: value }));
    if (grouped.length === 1) onWinnerChange?.(value);
    toast({ title: 'Guild vencedora atualizada', description: value ? `${date}: ${value}` : `${date}: removida` });
  };

  if (!allIds.length) return null;

  const formatDate = (d: string) => {
    if (d === '__all__') return 'Selecionado';
    try { return format(parseISO(d), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }); }
    catch { return d; }
  };

  return (
    <div className="space-y-2 p-3 rounded-lg border border-warning/40 bg-warning/5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Trophy className="w-4 h-4 text-warning" />
        Guild Vencedora {grouped.length > 1 && <span className="text-xs text-muted-foreground font-normal">(uma por data)</span>}
      </div>
      {grouped.map(({ date, ids }) => (
        <div key={date} className="flex flex-wrap items-center gap-2 pl-6">
          <span className="text-xs text-muted-foreground w-44">{formatDate(date)}</span>
          {canEdit ? (
            <>
              <Select
                value={selected[date] || '__none__'}
                onValueChange={(v) => setSelected(prev => ({ ...prev, [date]: v }))}
                disabled={loading || savingDate === date}
              >
                <SelectTrigger className="w-[220px] h-8">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {guildOptions.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => handleSave(date, ids)}
                disabled={savingDate === date || loading || (selected[date] || '__none__') === ((winners[date]) || '__none__')}
              >
                {savingDate === date ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
              </Button>
              {winners[date] && (
                <span className="text-xs text-muted-foreground">Atual: <strong>{winners[date]}</strong></span>
              )}
            </>
          ) : (
            <span className="text-sm">{winners[date] || '—'}</span>
          )}
        </div>
      ))}
    </div>
  );
};
