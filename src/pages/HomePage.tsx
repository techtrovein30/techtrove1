import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { days, siteConfig } from "../data/techtrove";
import { EventCard } from "../components/site/EventCard";
import { Marquee } from "../components/site/Marquee";

export function HomePage() {
  const day1 = days[0];
  const featured = day1.events.slice(0, 3);

  return (
    <div className="reveal-up">
      {/* Hero */}
      <section className="grain relative overflow-hidden">
        <img
          src="/images/arena.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/55 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/60" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-32 sm:px-6 md:pb-24 md:pt-44 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-12 xl:gap-16">
          <div>
            <p className="eyebrow text-primary-soft">{siteConfig.presenter} presents</p>
            <h1 className="display mt-4 whitespace-nowrap text-[clamp(2.5rem,10vw,7.5rem)] animated-gradient-text drop-shadow-2xl">
              TechTrove 3.0
            </h1>
            <p className="display mt-3 text-lg tracking-[0.14em] text-primary-soft sm:text-2xl">
              {siteConfig.tagline}
            </p>

            <div className="mt-6 flex items-center gap-6 border-t border-edge pt-6 lg:hidden">
              <img
                src="/images/techtrove-logo.webp"
                alt="TechTrove 3.0 wolf emblem"
                className="glow-emblem h-28 w-auto self-start"
              />
              <p className="max-w-xs text-sm leading-relaxed text-muted">{siteConfig.description}</p>
            </div>

            <dl className="mt-8 grid max-w-md grid-cols-2 gap-4 sm:mt-10">
              <div className="glass-panel glowing-border p-5">
                <dt className="eyebrow text-primary-soft">Dates</dt>
                <dd className="mt-2 text-sm font-semibold text-foreground">{siteConfig.eventDate}</dd>
              </div>
              <div className="glass-panel glowing-border p-5">
                <dt className="eyebrow text-primary-soft">Venue</dt>
                <dd className="mt-2 text-sm font-semibold text-foreground">{siteConfig.venue}</dd>
              </div>
            </dl>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/register"
                className="rounded-full inline-flex items-center justify-center gap-2 bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all shadow-[0_0_20px_rgba(124, 58, 237,0.4)] hover:shadow-[0_0_30px_rgba(124, 58, 237,0.7)] hover:bg-primary-soft"
              >
                Register now
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/events"
                className="rounded-full inline-flex items-center justify-center gap-2 border border-edge-strong bg-background/50 px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-foreground backdrop-blur-sm transition-all hover:border-primary hover:text-primary-soft hover:shadow-[0_0_20px_rgba(124, 58, 237,0.2)] glass-panel"
              >
                Explore events
              </Link>
            </div>
          </div>

          <div className="relative min-w-0 hidden lg:block">
            <img
              src="/images/techtrove-logo.webp"
              alt="TechTrove 3.0 wolf emblem"
              className="glow-emblem relative mx-auto h-96 w-auto max-w-full"
            />
            <p className="relative mt-6 max-w-xs text-sm leading-relaxed text-muted">
              {siteConfig.description}
            </p>
          </div>
        </div>
      </section>

      <Marquee />

      {/* Stats */}
      <section aria-label="Symposium statistics" className="border-b border-edge">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
          {siteConfig.stats.map((stat, i) => (
            <div
              key={stat.label}
              className={
                "flex flex-col items-center gap-2 px-4 py-10 text-center md:py-14 " +
                (i > 0 ? "md:border-l md:border-edge " : "") +
                (i % 2 === 1 ? "border-l border-edge md:border-l " : "") +
                (i >= 2 ? "border-t border-edge md:border-t-0" : "")
              }
            >
              <dt className="eyebrow order-1">{stat.label}</dt>
              <dd className="display order-2 mt-1 text-4xl text-primary-soft sm:text-5xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* About teaser */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-28 lg:px-8">
        <span
          aria-hidden
          className="outline-text display pointer-events-none absolute -top-4 left-0 select-none whitespace-nowrap text-[clamp(5rem,18vw,15rem)] leading-none opacity-40"
        >
          TechTrove 3.0
        </span>
        <div className="relative max-w-2xl">
          <p className="eyebrow">Symposium</p>
          <h2 className="display mt-3 text-4xl text-foreground sm:text-6xl">
            Three days.
            <br />
            One arena.
          </h2>
          <hr className="rule-line mt-6 w-40" />
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            TechTrove 3.0 brings technology, competition and sport onto the same stage. Day 1 belongs to
            the field. Day 2 and Day 3 open up the technical and creative tracks of the symposium.
          </p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Built for students who compete hard and build harder, TechTrove 3.0 is where colleges meet,
            teams form and the SIMATS wolf finds its pack.
          </p>
          <Link
            to="/about"
            className="group mt-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-soft"
          >
            Read more about TechTrove 3.0
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Day 1 feature */}
      <section className="border-y border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-24 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow">Day 1 · Sports</p>
              <h2 className="display mt-3 text-4xl text-foreground sm:text-5xl">On the field first</h2>
              <hr className="rule-line mt-6 w-40" />
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
                Six team sports open the symposium. Registration for Day 1 is live now.
              </p>
            </div>
            <Link
              to="/events?day=day-1"
              className="group inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground transition-colors hover:text-primary-soft"
            >
              All events
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Day overview */}
      <section aria-label="The three days" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-24 lg:px-8">
        <ol>
          {days.map((day, i) => {
            const content = (
              <>
                <span className="display outline-text w-16 shrink-0 text-5xl sm:w-24 sm:text-7xl">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 py-1">
                  <span className="eyebrow block">{day.label}</span>
                  <span className="display mt-1 block text-3xl text-foreground sm:text-4xl">
                    {day.name}
                  </span>
                  <span className="mt-2 block max-w-md text-sm text-muted">{day.description}</span>
                </span>
                <span
                  className={
                    "self-center border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " +
                    (day.status === "active"
                      ? "border-primary/60 bg-primary/10 text-primary-soft"
                      : "border-edge text-muted")
                  }
                >
                  {day.status === "active" ? "Registration live" : "Coming soon"}
                </span>
              </>
            );

            return (
              <li key={day.id} className="border-t border-edge last:border-b">
                {day.status === "active" ? (
                  <Link
                    to={`/events?day=${day.id}`}
                    className="group flex flex-col gap-4 px-1 py-10 transition-colors hover:bg-surface sm:flex-row sm:items-center sm:gap-8 sm:px-4"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-4 px-1 py-10 sm:flex-row sm:items-center sm:gap-8 sm:px-4">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* CTA band */}
      <section className="grain relative overflow-hidden border-t border-edge">
        <img
          src="/images/arena.webp"
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/70 to-background" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 md:py-32">
          <img
            src="/images/techtrove-logo.webp"
            alt="TechTrove 3.0 logo"
            loading="lazy"
            className="glow-emblem h-20 w-auto"
          />
          <h2 className="display mt-8 text-5xl text-foreground sm:text-7xl">Claim your slot</h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            Register your team for Day 1 sports. Day 2 and Day 3 registrations open once the events
            are announced.
          </p>
          <Link
            to="/register"
            className="rounded-full mt-9 inline-flex items-center gap-2 bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all shadow-[0_0_20px_rgba(124, 58, 237,0.4)] hover:shadow-[0_0_30px_rgba(124, 58, 237,0.7)] hover:bg-primary-soft"
          >
            Register now
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
