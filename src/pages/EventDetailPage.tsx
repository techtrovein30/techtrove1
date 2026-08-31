import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Ticket, UserPlus, Users } from "lucide-react";
import { useEvent } from "../lib/useEvents";
import { formatFee } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { event, day, loading } = useEvent(eventId);
  const { user } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-40 text-center sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-surface mx-auto" />
          <div className="h-16 w-2/3 bg-surface mx-auto" />
          <div className="h-4 w-1/2 bg-surface mx-auto" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-40 text-center sm:px-6">
        <p className="eyebrow">Not found</p>
        <h1 className="display mt-3 text-5xl text-foreground sm:text-6xl">Event not found</h1>
        <p className="mt-4 text-sm text-muted">
          This event does not exist or has not been announced yet.
        </p>
        <Link
          to="/events"
          className="clip-angle mt-8 inline-flex bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
        >
          Back to events
        </Link>
      </div>
    );
  }

  const day2 = day;
  return (
    <div className="reveal-up">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-edge">
        {event.image && (
          <>
            <img
              src={event.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/40" />
          </>
        )}
        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-14 pt-32 sm:px-6 md:pb-20 md:pt-44 lg:px-8">
          <Link
            to={`/events?day=${event.dayId}`}
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-primary-soft"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All events
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="border border-primary/60 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-soft">
              {event.category}
            </span>
            <span className="border border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {day2 ? `${day2.label} · ${day2.name}` : "Symposium"}
            </span>
          </div>

          <h1 className="display mt-6 text-6xl text-foreground sm:text-7xl lg:text-8xl">{event.name}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            {event.description}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
          <div className="min-w-0 space-y-12">
            {/* Format */}
            <dl className="grid grid-cols-2 gap-px border border-edge bg-edge sm:grid-cols-4">
              <div className="bg-surface p-5">
                <dt className="eyebrow flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Players
                </dt>
                <dd className="display mt-3 text-3xl">{event.requiredPlayers ?? "TBA"}</dd>
              </div>
              <div className="bg-surface p-5">
                <dt className="eyebrow flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5" aria-hidden /> Substitutes
                </dt>
                <dd className="display mt-3 text-3xl">{event.maxSubstitutes ?? "TBA"}</dd>
              </div>
              <div className="bg-surface p-5">
                <dt className="eyebrow flex items-center gap-2">
                  <Ticket className="h-3.5 w-3.5" aria-hidden /> Fee / person
                </dt>
                <dd className="display mt-3 text-3xl">
                  {user?.participantType === "internal" ? "Free" : formatFee(event.registrationFee)}
                </dd>
              </div>
              <div className="bg-surface p-5">
                <dt className="eyebrow flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Format
                </dt>
                <dd className="display mt-3 text-3xl capitalize">{event.registrationType ?? "TBA"}</dd>
              </div>
            </dl>

            {/* Rules */}
            {event.rules && event.rules.length > 0 && (
              <div>
                <p className="eyebrow">Rules</p>
                <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">Play by the book</h2>
                <hr className="rule-line mt-5 w-36" />
                <ol className="mt-6 divide-y divide-edge border-y border-edge">
                  {event.rules.map((rule, i) => (
                    <li key={i} className="flex gap-5 py-4">
                      <span className="display shrink-0 text-xl text-primary-soft/80">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="pt-0.5 text-sm leading-relaxed text-muted">{rule}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Eligibility */}
            {event.eligibility && event.eligibility.length > 0 && (
              <div>
                <p className="eyebrow">Eligibility</p>
                <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">Who can enter</h2>
                <hr className="rule-line mt-5 w-36" />
                <ul className="mt-6 space-y-3">
                  {event.eligibility.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-muted">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Register panel */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="clip-angle diag-stripes border border-edge bg-surface p-6 sm:p-8">
              <p className="eyebrow">Registration</p>
              <p className="display mt-3 text-4xl text-foreground">
                {user?.participantType === "internal" ? "Free" : formatFee(event.registrationFee)}
              </p>
              <p className="mt-1 text-xs text-muted">per person · charged for each player &amp; substitute · non-refundable</p>

              <dl className="mt-6 space-y-3 border-t border-edge pt-6 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Team size</dt>
                  <dd className="font-medium text-foreground">
                    {event.requiredPlayers ?? "-"} players
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Substitutes</dt>
                  <dd className="font-medium text-foreground">up to {event.maxSubstitutes ?? 0}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Status</dt>
                  <dd>
                    <span
                      className={
                        "border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                        (event.registrationOpen
                          ? "border-primary/60 bg-primary/10 text-primary-soft"
                          : "border-edge text-muted")
                      }
                    >
                      {event.registrationOpen ? "Open" : "Closed"}
                    </span>
                  </dd>
                </div>
              </dl>

              {event.registrationOpen ? (
                <Link
                  to={
                    user
                      ? `/register?event=${event.id}`
                      : `/login?next=${encodeURIComponent(`/register?event=${event.id}`)}`
                  }
                  className="clip-angle mt-7 flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
                >
                  {user ? "Register your team" : "Login to register"}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <p className="clip-angle mt-7 flex w-full items-center justify-center border border-edge px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Registration closed
                </p>
              )}

              {!user && (
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  You will be asked to sign in first. Registration takes a few minutes.
                </p>
              )}

              <p className="mt-6 flex items-center gap-2 border-t border-edge pt-5 text-xs text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                SIMATS Campus, Chennai
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
