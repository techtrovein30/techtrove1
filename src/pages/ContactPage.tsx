import { Mail, MapPin, Phone } from "lucide-react";
import { siteConfig } from "../data/techtrove";

export function ContactPage() {
  const c = siteConfig.contact;

  return (
    <div className="reveal-up">
      <section className="border-b border-edge bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-16 md:pt-40 lg:px-8">
          <p className="eyebrow">Contact</p>
          <h1 className="display mt-3 text-5xl text-foreground sm:text-7xl">Get in touch</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Questions about events, registration or partnerships. The organizing committee is one
            message away.
          </p>
          <hr className="rule-line mt-6 w-44" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        <dl className="grid gap-px border border-edge bg-edge sm:grid-cols-2">
          <div className="bg-surface p-6 sm:p-8">
            <dt className="eyebrow flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-primary-soft" aria-hidden /> Email
            </dt>
            <dd className="mt-3">
              <a href={`mailto:${c.email}`} className="text-lg font-medium transition-colors hover:text-primary-soft">
                {c.email}
              </a>
            </dd>
          </div>
          <div className="bg-surface p-6 sm:p-8">
            <dt className="eyebrow flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-primary-soft" aria-hidden /> Phone
            </dt>
            <dd className="mt-3">
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-lg font-medium transition-colors hover:text-primary-soft">
                {c.phone}
              </a>
            </dd>
          </div>
          <div className="bg-surface p-6 sm:p-8">
            <dt className="eyebrow flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-primary-soft" aria-hidden /> Venue
            </dt>
            <dd className="mt-3 text-lg font-medium">{c.venue}</dd>
          </div>
          <div className="bg-surface p-6 sm:p-8">
            <dt className="eyebrow flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-primary-soft" aria-hidden /> Organizing committee
            </dt>
            <dd className="mt-3 text-lg font-medium">{c.committee}</dd>
            <dd className="mt-1 text-sm text-muted">{c.college}</dd>
          </div>
        </dl>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-6 border-t border-edge pt-10">
          <div>
            <h2 className="display text-2xl text-foreground sm:text-3xl">Follow the symposium</h2>
            <p className="mt-2 text-sm text-muted">Announcements drop first on our official channels.</p>
          </div>
          <ul className="flex flex-wrap gap-3">
            {siteConfig.socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.url}
                  className="clip-angle inline-flex border border-edge-strong px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:border-primary hover:text-primary-soft"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
