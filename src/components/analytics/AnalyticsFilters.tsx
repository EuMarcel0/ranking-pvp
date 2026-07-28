import { useState, useEffect } from 'react';
import { Filter, RotateCcw, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AnalyticsFilters as FiltersType, defaultFilters } from '@/hooks/useAnalyticsData';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AnalyticsFiltersProps {
  filters: FiltersType;
  onChange: (filters: FiltersType) => void;
}

const hours = Array.from({ length: 24 }, (_, i) => i);

function parseInputDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = parseInt(day), m = parseInt(month), y = parseInt(year);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  return `${year}-${month}-${day}`;
}

function formatForDisplay(isoDate: string | null): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export const AnalyticsFiltersBar = ({ filters, onChange }: AnalyticsFiltersProps) => {
  const [guilds, setGuilds] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [dateFromInput, setDateFromInput] = useState(formatForDisplay(filters.dateFrom));
  const [dateToInput, setDateToInput] = useState(formatForDisplay(filters.dateTo));

  useEffect(() => {
    const fetchOptions = async () => {
      const { data } = await supabase
        .from('characters')
        .select('guild, class, name')
        .eq('banned', false);
      if (data) {
        const uniqueGuilds = [...new Set(data.map(c => c.guild).filter(Boolean))].sort();
        const uniqueClasses = [...new Set(data.map(c => c.class).filter(Boolean))].sort();
        const uniqueNames = [...new Set(data.map(c => c.name).filter(Boolean))].sort();
        setGuilds(uniqueGuilds);
        setClasses(uniqueClasses);
        setPlayerNames(uniqueNames);
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    setDateFromInput(formatForDisplay(filters.dateFrom));
  }, [filters.dateFrom]);

  useEffect(() => {
    setDateToInput(formatForDisplay(filters.dateTo));
  }, [filters.dateTo]);

  const handleDateFromBlur = () => {
    if (dateFromInput === '') {
      onChange({ ...filters, dateFrom: null });
      return;
    }
    const parsed = parseInputDate(dateFromInput);
    if (parsed) {
      onChange({ ...filters, dateFrom: parsed });
    } else {
      setDateFromInput(formatForDisplay(filters.dateFrom));
    }
  };

  const handleDateToBlur = () => {
    if (dateToInput === '') {
      onChange({ ...filters, dateTo: null });
      return;
    }
    const parsed = parseInputDate(dateToInput);
    if (parsed) {
      onChange({ ...filters, dateTo: parsed });
    } else {
      setDateToInput(formatForDisplay(filters.dateTo));
    }
  };

  const handleDateKeyDown = (e: React.KeyboardEvent, type: 'from' | 'to') => {
    if (e.key === 'Enter') {
      type === 'from' ? handleDateFromBlur() : handleDateToBlur();
    }
  };

  const reset = () => onChange({ ...defaultFilters });

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card/50 rounded-lg border border-border">
      <Filter className="w-4 h-4 text-muted-foreground" />

      <div className="flex items-center gap-1">
        <Input
          placeholder="Data início (dd/mm/aaaa)"
          value={dateFromInput}
          onChange={(e) => setDateFromInput(e.target.value)}
          onBlur={handleDateFromBlur}
          onKeyDown={(e) => handleDateKeyDown(e, 'from')}
          className="w-[170px] h-8 text-xs"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
              <CalendarIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00') : undefined}
              onSelect={(d) => {
                if (!d) return;
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                onChange({ ...filters, dateFrom: iso });
              }}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-1">
        <Input
          placeholder="Data fim (dd/mm/aaaa)"
          value={dateToInput}
          onChange={(e) => setDateToInput(e.target.value)}
          onBlur={handleDateToBlur}
          onKeyDown={(e) => handleDateKeyDown(e, 'to')}
          className="w-[170px] h-8 text-xs"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
              <CalendarIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filters.dateTo ? new Date(filters.dateTo + 'T00:00:00') : undefined}
              onSelect={(d) => {
                if (!d) return;
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                onChange({ ...filters, dateTo: iso });
              }}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      <Select
        value={filters.hourFrom !== null ? String(filters.hourFrom) : 'all'}
        onValueChange={(v) => onChange({ ...filters, hourFrom: v === 'all' ? null : Number(v) })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Hora início" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Hora início</SelectItem>
          {hours.map(h => (
            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.hourTo !== null ? String(filters.hourTo) : 'all'}
        onValueChange={(v) => onChange({ ...filters, hourTo: v === 'all' ? null : Number(v) })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Hora fim" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Hora fim</SelectItem>
          {hours.map(h => (
            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.eventType}
        onValueChange={(v) => onChange({ ...filters, eventType: v as FiltersType['eventType'] })}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos Eventos</SelectItem>
          <SelectItem value="boss_event">Boss Event</SelectItem>
          <SelectItem value="throne_conquest">Throne</SelectItem>
          <SelectItem value="arka_war">Arka War</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.guild || 'all'}
        onValueChange={(v) => onChange({ ...filters, guild: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Guild" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas Guilds</SelectItem>
          {guilds.map(g => (
            <SelectItem key={g} value={g}>{g}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.playerClass || 'all'}
        onValueChange={(v) => onChange({ ...filters, playerClass: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Classe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas Classes</SelectItem>
          {classes.map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>


      <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-xs text-muted-foreground">
        <RotateCcw className="w-3 h-3" /> Limpar
      </Button>
    </div>
  );
};
