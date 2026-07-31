import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

type TimePickerProps = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  className?: string;
  disabled?: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function TimePicker({ hour, minute, onChange, className, disabled }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => `${pad(hour)}:${pad(minute)}`, [hour, minute]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start gap-2 font-normal", className)}
        >
          <Clock className="h-4 w-4 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          <ScrollArea className="h-56 w-14 rounded-md border">
            <div className="flex flex-col p-1">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onChange(h, minute)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-accent",
                    h === hour && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {pad(h)}
                </button>
              ))}
            </div>
          </ScrollArea>
          <ScrollArea className="h-56 w-14 rounded-md border">
            <div className="flex flex-col p-1">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onChange(hour, m);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm tabular-nums hover:bg-accent",
                    m === minute && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
