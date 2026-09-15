import { ruleSections } from "../data/techtrove";

export function RulesPage() {
  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
          <p className="eyebrow">Rules</p>
          <h1 className="display mt-3 text-5xl animated-gradient-text drop-shadow-2xl sm:text-7xl">Rulebook</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            The ground rules for TechTrove 3.0. Event-specific rules are published on each event page
            and updated as details are confirmed.
          </p>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-12 px-4 py-14 pb-20 sm:px-6 md:py-20 lg:px-8">
        {ruleSections.map((section, i) => (
          <article
            key={section.id}
            className="grid gap-6 glass-panel glowing-border p-6 sm:p-8 md:grid-cols-[14rem_1fr] md:gap-12 hover:shadow-[0_0_20px_rgba(124, 58, 237,0.15)] transition-all"
          >
            <div>
              <span aria-hidden className="display outline-text block text-4xl animated-gradient-text opacity-80">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="display mt-3 text-2xl text-foreground">{section.title}</h2>
            </div>
            <ul className="space-y-3 self-start">
              {section.items.map((item, j) => (
                <li key={j} className="flex items-start gap-3 text-sm leading-relaxed text-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}

        <p className="text-xs leading-relaxed text-muted">
          Note: sections marked as to be announced are placeholders and will be updated by the
          organizing committee.
        </p>
      </section>
    </div>
  );
}
