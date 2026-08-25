import { Link } from "react-router-dom";
import { siteConfig } from "../data/techtrove";

export function AboutPage() {
  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-32 sm:px-6 md:pb-20 md:pt-40 lg:px-8">
          <p className="eyebrow">About</p>
          <h1 className="display mt-3 text-5xl animated-gradient-text drop-shadow-2xl sm:text-7xl">About TechTrove 3.0</h1>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl overflow-hidden px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <span
          aria-hidden
          className="outline-text display pointer-events-none absolute right-0 top-0 select-none text-[clamp(4rem,14vw,12rem)] leading-none opacity-50"
        >
          SIMATS
        </span>
        <div className="relative grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div className="relative">
            <img
              src="/images/techtrove-logo.webp"
              alt="TechTrove 3.0 wolf emblem"
              loading="lazy"
              className="glow-emblem mx-auto h-64 w-auto lg:h-80"
            />
          </div>

          <div>
            <h2 className="display text-3xl text-foreground sm:text-4xl">
              Technology. Competition. Sport.
            </h2>
            <hr className="rule-line mt-6 w-40" />
            <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted sm:text-base">
              <p>{siteConfig.description}</p>
              <p>
                Across three days, TechTrove 3.0 moves from the field to the lab to the stage. Day 1
                opens with team sports. Day 2 and Day 3 bring the technical and creative tracks of
                the symposium.
              </p>
              <p>
                It is a meeting point for colleges across the region: teams form, rivalries are
                settled on the field, ideas get built under time pressure and the best work is
                recognised in front of everyone.
              </p>
              <p>
                Whether you play, build, present or organise, there is a place for you in the pack.
              </p>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-4">
              <div className="glass-panel glowing-border p-6 shadow-sm hover:shadow-[0_0_20px_rgba(124, 58, 237,0.15)] transition-all">
                <dt className="eyebrow text-primary-soft">Dates</dt>
                <dd className="mt-2 text-sm font-semibold">{siteConfig.eventDate}</dd>
              </div>
              <div className="glass-panel glowing-border p-6 shadow-sm hover:shadow-[0_0_20px_rgba(124, 58, 237,0.15)] transition-all">
                <dt className="eyebrow text-primary-soft">Venue</dt>
                <dd className="mt-2 text-sm font-semibold">{siteConfig.venue}</dd>
              </div>
              <div className="glass-panel glowing-border p-6 shadow-sm hover:shadow-[0_0_20px_rgba(124, 58, 237,0.15)] transition-all">
                <dt className="eyebrow text-primary-soft">Presenter</dt>
                <dd className="mt-2 text-sm font-semibold">{siteConfig.presenter}</dd>
              </div>
              <div className="glass-panel glowing-border p-6 shadow-sm hover:shadow-[0_0_20px_rgba(124, 58, 237,0.15)] transition-all">
                <dt className="eyebrow text-primary-soft">Format</dt>
                <dd className="mt-2 text-sm font-semibold">Three-day symposium</dd>
              </div>
            </dl>

            <Link
              to="/events"
              className="rounded-full mt-10 inline-flex bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all shadow-[0_0_20px_rgba(124, 58, 237,0.4)] hover:shadow-[0_0_30px_rgba(124, 58, 237,0.7)] hover:bg-primary-soft"
            >
              Explore events
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
