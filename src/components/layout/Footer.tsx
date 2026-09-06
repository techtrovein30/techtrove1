import { Link } from "react-router-dom";
import { siteConfig } from "../../data/techtrove";
import { Brand } from "../site/Brand";

const exploreLinks = [
  { to: "/events", label: "Events" },
  { to: "/schedule", label: "Schedule" },
  { to: "/rules", label: "Rules" },

];

export function Footer() {
  return (
    <footer className="border-t border-edge bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <Brand logoClass="h-12 w-auto" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            SIMATS presents TechTrove 3.0. Innovate. Compete. Conquer.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
            {siteConfig.eventDate} · {siteConfig.venue}
          </p>
        </div>

        <nav aria-label="Explore">
          <h2 className="eyebrow">Explore</h2>
          <ul className="mt-4 space-y-2.5">
            {exploreLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-foreground/80 transition-colors hover:text-primary-soft">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="eyebrow">Reach us</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-foreground/80">
            <li>
              <a
                href={`mailto:${siteConfig.contact.email}`}
                className="break-all transition-colors hover:text-primary-soft"
              >
                {siteConfig.contact.email}
              </a>
            </li>
            <li>
              <a
                href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}
                className="transition-colors hover:text-primary-soft"
              >
                {siteConfig.contact.phone}
              </a>
            </li>
            <li>{siteConfig.contact.committee}</li>
          </ul>
          <ul className="mt-6 flex flex-wrap gap-3">
            {siteConfig.socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex border border-edge px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:border-primary hover:text-primary-soft"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-edge">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:px-6 lg:px-8">
          <span>Copyright TechTrove 3.0. All rights reserved.</span>
          <span className="uppercase tracking-[0.18em]">{siteConfig.name} · {siteConfig.presenter}</span>
        </div>
      </div>
    </footer>
  );
}
