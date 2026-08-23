import { Link } from "react-router-dom";
import type { Day } from "../../data/techtrove";

export function ComingSoon({ day }: { day: Day }) {
  return (
    <div className="diag-stripes clip-angle relative overflow-hidden border border-edge bg-surface px-6 py-16 text-center sm:py-24">
      <img
        src="/images/techtrove-logo.png"
        alt=""
        loading="lazy"
        className="pointer-events-none absolute -right-10 top-1/2 h-64 w-auto -translate-y-1/2 opacity-[0.06] sm:h-80"
      />
      <p className="eyebrow">{day.label}</p>
      <h3 className="display mt-4 text-5xl text-foreground sm:text-6xl">Coming soon</h3>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        Events are being finalised. Stay tuned. Follow the official channels for the announcement.
      </p>
      <Link
        to="/register"
        className="clip-angle mt-8 inline-flex bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
      >
        Register for Day 1 sports
      </Link>
    </div>
  );
}
