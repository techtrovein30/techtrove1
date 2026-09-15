import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="reveal-up mx-auto max-w-3xl px-4 pb-24 pt-40 text-center sm:px-6">
      <p className="eyebrow">Error 404</p>
      <h1 className="display mt-3 text-6xl text-foreground sm:text-8xl">Off the field</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        The page you are looking for does not exist. Head back to the arena and pick up from there.
      </p>
      <Link
        to="/"
        className="clip-angle mt-9 inline-flex bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
      >
        Back to home
      </Link>
    </div>
  );
}
