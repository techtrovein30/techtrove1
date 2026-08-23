import { Link } from "react-router-dom";
import { days, schedule, siteConfig } from "../data/techtrove";

export function SchedulePage() {
  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
          <p className="eyebrow">Schedule</p>
          <h1 className="display mt-3 text-5xl text-foreground sm:text-7xl">The three days</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            {siteConfig.eventDate} · {siteConfig.venue}. Timings are indicative and may shift once
            fixtures are drawn.
          </p>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="space-y-14 pb-16 md:pb-24">
          {days.map((day) => {
            const items = schedule[day.id] ?? [];
            return (
              <article key={day.id}>
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-edge pb-6">
                  <div>
                    <p className="eyebrow">{day.label}</p>
                    <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">{day.name}</h2>
                  </div>
                  {day.status === "active" ? (
                    <Link
                      to="/events?day=day-1"
                      className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-soft hover:text-primary"
                    >
                      View events
                    </Link>
                  ) : (
                    <span className="border border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Coming soon
                    </span>
                  )}
                </header>

                {items.length > 0 ? (
                  <ol className="relative mt-8 space-y-8 border-l border-edge pl-0">
                    {items.map((item, i) => (
                      <li key={i} className="relative grid grid-cols-[4.5rem_1fr] gap-4 pl-6 sm:gap-8 sm:pl-10">
                        <span
                          aria-hidden
                          className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rotate-45 bg-primary"
                        />
                        <span className="display pt-0.5 text-lg leading-none text-primary-soft">
                          {item.time}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                            {item.title}
                          </h3>
                          {item.note && <p className="mt-1 text-sm text-muted">{item.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="diag-stripes clip-angle mt-8 border border-edge bg-surface px-6 py-12 text-center">
                    <p className="display text-3xl text-foreground">Coming soon</p>
                    <p className="mx-auto mt-3 max-w-md text-sm text-muted">
                      The schedule will be published along with the Day {day.label.slice(-1)} events.
                      Stay tuned.
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
