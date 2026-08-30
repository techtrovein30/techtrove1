import { useSearchParams } from "react-router-dom";
import { useEvents } from "../lib/useEvents";
import { DaySelector } from "../components/site/DaySelector";
import { EventCard } from "../components/site/EventCard";
import { ComingSoon } from "../components/site/ComingSoon";

export function EventsPage() {
  const { days, loading, error } = useEvents();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("day") ?? (days[0]?.id ?? "day-1");
  const activeDay = days.find((d) => d.id === requested) ?? days[0];

  if (loading) {
    return (
      <div className="reveal-up">
        <section className="border-b border-edge bg-surface/50">
          <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
            <p className="eyebrow">Events</p>
            <h1 className="display mt-3 text-5xl animated-gradient-text drop-shadow-2xl sm:text-7xl">Explore events</h1>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse border border-edge bg-surface h-48" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error || !days.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-40 text-center sm:px-6">
        <p className="eyebrow">Error</p>
        <h1 className="display mt-3 text-4xl text-foreground">Could not load events</h1>
        <p className="mt-4 text-sm text-muted">{error ?? "No events found."}</p>
      </div>
    );
  }

  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
          <p className="eyebrow">Events</p>
          <h1 className="display mt-3 text-5xl animated-gradient-text drop-shadow-2xl sm:text-7xl">Explore events</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Three days of competition across sports, technology and creativity. Pick a day to see
            what is on.
          </p>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <DaySelector
          days={days}
          activeId={activeDay.id}
          onSelect={(id) => setSearchParams({ day: id })}
        />

        <header className="mt-10 flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-6">
          <div>
            <h2 className="display text-3xl text-foreground sm:text-4xl">{activeDay.name}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">{activeDay.description}</p>
          </div>
          <span className="eyebrow">{activeDay.label}</span>
        </header>

        <div className="mt-8 pb-16 md:pb-24">
          {activeDay.status === "active" && activeDay.events.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeDay.events.map((event, i) => (
                <EventCard key={event.id} event={event} index={i} />
              ))}
            </div>
          ) : (
            <ComingSoon day={activeDay} />
          )}
        </div>
      </section>
    </div>
  );
}
