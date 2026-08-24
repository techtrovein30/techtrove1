import type { Day } from "../../data/techtrove";
import { cn } from "../../lib/utils";

interface DaySelectorProps {
  days: Day[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function DaySelector({ days, activeId, onSelect }: DaySelectorProps) {
  return (
    <div role="tablist" aria-label="Select symposium day" className="grid grid-cols-3 gap-2 sm:gap-3">
      {days.map((day) => {
        const active = day.id === activeId;
        return (
          <button
            key={day.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(day.id)}
            className={cn(
              "rounded-xl glass-panel px-2 py-4 text-center transition-all duration-300 sm:px-4",
              active
                ? "bg-primary text-white shadow-[0_0_20px_rgba(212, 175, 55,0.5)] glowing-border"
                : "text-muted hover:border-primary/50 hover:text-foreground hover:shadow-[0_0_15px_rgba(212, 175, 55,0.2)] glowing-border",
            )}
          >
            <span className="display block text-xl sm:text-2xl">{day.label}</span>
            <span
              className={cn(
                "mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em]",
                active ? "text-white/80" : "text-muted",
              )}
            >
              {day.status === "active" ? "Live now" : "Coming soon"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
