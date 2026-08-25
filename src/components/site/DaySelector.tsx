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
              "relative rounded-xl px-2 py-4 text-center transition-all duration-300 sm:px-4",
              active
                ? "day-active -translate-y-1"
                : "glass-panel text-muted hover:-translate-y-0.5 hover:border-white/20 hover:text-foreground",
            )}
          >
            <span className="display block text-xl sm:text-2xl">{day.label}</span>
            <span
              className={cn(
                "mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em]",
                active ? "text-primary-soft" : "text-muted",
              )}
            >
              {day.status === "active" ? "Live now" : "Coming soon"}
            </span>
            {active && (
              <span className="absolute bottom-3 left-1/2 h-px w-10 -translate-x-1/2 bg-primary-soft" />
            )}
          </button>
        );
      })}
    </div>
  );
}
