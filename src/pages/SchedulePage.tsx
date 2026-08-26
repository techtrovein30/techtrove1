import { Link } from "react-router-dom";
import { schedule, siteConfig } from "../data/techtrove";
import { getDays } from "../lib/eventStore";

export function SchedulePage() {
  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
          <p className="eyebrow">Schedule</p>
          <h1 className="display mt-3 text-5xl animated-gradient-text drop-shadow-2xl sm:text-7xl">The three days</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            {siteConfig.eventDate} · {siteConfig.venue}. Timings are indicative and may shift once
            fixtures are drawn.
          </p>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="space-y-14 pb-16 md:pb-24">
          {getDays().map((day) => {
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
                  <ol className="relative mt-8 space-y-6 pl-0">
                    {items.map((item, i) => (
                      <li key={i} className="relative glass-panel glowing-border p-6 sm:p-8 flex items-start gap-6 sm:gap-8 hover:shadow-[0_0_25px_rgba(124, 58, 237,0.15)] transition-all">
                        <span className="display pt-0.5 text-2xl leading-none text-primary-soft sm:text-3xl">
                          {item.time}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold uppercase tracking-[0.08em] text-foreground">
                            {item.title}
                          </h3>
                          {item.note && <p className="mt-2 text-sm text-muted">{item.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="glass-panel glowing-border mt-8 p-12 text-center shadow-[0_0_20px_rgba(255,255,255,0.02)]">
                    <p className="display text-3xl text-foreground">Coming soon</p>
                    <p className="mx-auto mt-4 max-w-md text-sm text-muted">
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
