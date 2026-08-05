import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const EVENT_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos Eventos' },
  { value: 'boss_event', label: 'Boss Event' },
  { value: 'world_boss', label: 'World Boss' },
  { value: 'throne_conquest', label: 'Throne Conquest' },
  { value: 'arka_war', label: 'Arka War' },
];

interface EventTypeFilterProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const EventTypeFilter = ({ value, onChange, className }: EventTypeFilterProps) => (
  <div className="flex items-center gap-2">
    <span className="text-sm font-semibold text-muted-foreground">Evento:</span>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className || "w-[160px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {EVENT_TYPE_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
