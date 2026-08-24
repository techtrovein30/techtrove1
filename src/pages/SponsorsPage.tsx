import { sponsors } from "../data/techtrove";

export function SponsorsPage() {
  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
          <p className="eyebrow">Sponsors</p>
          <h1 className="display mt-3 text-5xl animated-gradient-text drop-shadow-2xl sm:text-7xl">Our sponsors</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            TechTrove 3.0 is backed by brands that back student talent. Sponsor slots for this edition
            are open.
          </p>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-14 px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        {sponsors.map((tier) => (
          <article key={tier.tier}>
            <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge pb-4">
              <h2 className="display text-2xl text-foreground sm:text-3xl">{tier.tier}</h2>
              <span className="eyebrow">{tier.slots.length} slot{tier.slots.length > 1 ? "s" : ""}</span>
            </header>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {tier.slots.map((slot, i) => (
                <div
                  key={i}
                  className="glass-panel glowing-border flex min-h-36 flex-col items-center justify-center p-8 text-center hover:shadow-[0_0_20px_rgba(212, 175, 55,0.2)] transition-all"
                >
                  {slot.logo ? (
                    <img src={slot.logo} alt={`${slot.name ?? tier.tier} logo`} loading="lazy" className="max-h-16 object-contain" />
                  ) : (
                    <>
                      <p className="display text-xl text-muted/70">Available slot</p>
                      <p className="mt-1.5 text-xs text-muted">Your brand here</p>
                    </>
                  )}
                  {slot.name && <p className="display mt-4 text-2xl">{slot.name}</p>}
                </div>
              ))}
            </div>
          </article>
        ))}

        <div className="glass-panel glowing-border relative overflow-hidden px-6 py-12 text-center sm:py-16 shadow-[0_0_30px_rgba(212, 175, 55,0.15)]">
          <h2 className="display text-3xl text-foreground sm:text-4xl">Partner with TechTrove 3.0</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            Put your brand in front of students from colleges across the region, on the field and
            on stage.
          </p>
          <a
            href="mailto:techtrove@example.edu"
            className="rounded-full mt-8 inline-flex bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all shadow-[0_0_20px_rgba(212, 175, 55,0.4)] hover:shadow-[0_0_30px_rgba(212, 175, 55,0.7)] hover:bg-primary-soft"
          >
            Become a sponsor
          </a>
        </div>
      </section>
    </div>
  );
}
