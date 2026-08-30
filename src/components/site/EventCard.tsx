import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { TechEvent } from "../../data/techtrove";
import { formatPerPerson, pad } from "../../lib/utils";

export function EventCard({ event, index }: { event: TechEvent; index: number }) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="group rounded-2xl glass-panel relative flex flex-col overflow-hidden transition-all duration-300 hover:border-primary/60 hover:shadow-[0_0_30px_rgba(124, 58, 237,0.25)] glowing-border focus-visible:outline-none"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {event.image ? (
          <img
            src={event.image}
            alt={`${event.name} visual`}
            loading="lazy"
            className="duotone h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="diag-stripes flex h-full w-full items-center justify-center bg-elevated">
            <span className="display text-5xl text-muted/30">TT</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <span className="display absolute bottom-2 left-4 text-6xl text-foreground/25 transition-colors duration-300 group-hover:text-primary-soft/60">
          {pad(index + 1)}
        </span>
        <span className="absolute left-4 top-4 border border-edge-strong bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur-sm">
          {event.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 pt-4">
        <h3 className="display text-2xl text-foreground group-hover:text-primary-soft transition-colors">
          {event.name}
        </h3>
        <p className="mt-1.5 text-xs uppercase tracking-[0.14em] text-muted">
          {event.requiredPlayers} players · {event.maxSubstitutes} substitutes
        </p>

        <div className="mt-auto flex items-end justify-between border-t border-edge pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Fee per person</p>
            <p className="display mt-1 text-xl text-foreground">{formatPerPerson(event.registrationFee)}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-soft">
            View details
            <ArrowRight
              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
