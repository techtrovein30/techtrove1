export function EventClosed() {
  return (
    <div className="diag-stripes relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-6">
      <img
        src="/images/techtrove-logo.webp"
        alt=""
        className="pointer-events-none absolute -right-16 top-1/2 h-96 w-auto -translate-y-1/2 opacity-[0.05] sm:h-[32rem]"
      />
      <div className="clip-angle relative z-10 w-full max-w-xl border border-edge bg-surface/80 px-8 py-14 text-center backdrop-blur-sm sm:px-14 sm:py-20">
        <p className="eyebrow">TechTrove 3.0</p>
        <h1 className="display mt-4 text-5xl leading-none text-foreground sm:text-6xl">
          That&rsquo;s a wrap
        </h1>
        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted">
          The event has ended and the online portal is now closed. Thank you to
          everyone who participated, coordinated, and made TechTrove 3.0 a
          success.
        </p>
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-muted/80">
          Registration, payments, and attendance are no longer available.
          Certificates and results will be shared through the official channels.
        </p>
      </div>
    </div>
  );
}
