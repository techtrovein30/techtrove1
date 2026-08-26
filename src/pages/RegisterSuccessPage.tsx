import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { getEvent } from "../lib/eventStore";
import { formatFee } from "../lib/utils";
import { api } from "../lib/mockApi";
import type { Registration } from "../lib/mockApi";

export function RegisterSuccessPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setNotFound(true);
      return;
    }
    api
      .getRegistrationByCode(code)
      .then((reg) => {
        if (!cancelled) setRegistration(reg);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const event = registration ? getEvent(registration.eventId) : undefined;

  return (
    <div className="reveal-up mx-auto max-w-3xl px-4 pb-24 pt-28 text-center sm:px-6 md:pt-36">
      <span className="glow-purple mx-auto flex h-16 w-16 items-center justify-center border border-primary bg-primary/15">
        <BadgeCheck className="h-8 w-8 text-primary-soft" aria-hidden />
      </span>

      <p className="eyebrow mt-8">TechTrove 3.0</p>
      <h1 className="display mt-3 text-5xl text-foreground sm:text-7xl">Registration successful</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        Your team is in. Keep your registration ID safe — it is your reference for all
        communication with the organizing committee.
      </p>

      {!notFound && (
        <p className="mt-6 inline-flex border border-primary/60 bg-primary/10 px-5 py-2.5 font-mono text-lg tracking-[0.2em] text-primary-soft">
          {registration ? registration.registrationCode : "TT-...."}
        </p>
      )}

      {notFound && (
        <p role="alert" className="mx-auto mt-8 max-w-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          We could not find this registration in this browser. Demo registrations are stored
          locally, so they disappear if browser data is cleared.
        </p>
      )}

      {registration && (
        <>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowReceipt((v) => !v)}
              aria-expanded={showReceipt}
              className="clip-angle inline-flex items-center gap-2 bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
            >
              {showReceipt ? "Hide registration" : "View registration"}
            </button>
            <Link
              to="/events"
              className="clip-angle inline-flex items-center gap-2 border border-edge-strong px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors hover:border-primary hover:text-primary-soft"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to events
            </Link>
          </div>

          {showReceipt && (
            <dl className="reveal-up clip-angle diag-stripes mt-10 border border-edge bg-surface p-6 text-left sm:p-8" aria-label="Registration receipt">
              {[
                ["Sport", event?.name ?? registration.eventId],
                ["Category", event?.category ?? "-"],
                [
                  "Event",
                  `${event ? `Day ${event.dayId.slice(-1)}` : "-"} · SIMATS Campus, Chennai`,
                ],
                ["Team name", registration.teamName],
                ["Captain", registration.captainName],
                ["Players", registration.members.filter((m) => m.role === "player").map((m) => m.name).join(", ")],
                [
                  "Substitutes",
                  (() => {
                    const subs = registration.members.filter((m) => m.role === "substitute").map((m) => m.name);
                    return subs.length > 0 ? subs.join(", ") : "None";
                  })(),
                ],
                ["Fee", formatFee(registration.fee)],
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col gap-1 border-b border-edge py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-8">
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{term}</dt>
                  <dd className="min-w-0 text-sm sm:text-right">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between pt-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Payment status</dt>
                <dd>
                  <span
                    className={
                      "border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                      (registration.paymentStatus === "recorded"
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/50 bg-amber-500/10 text-amber-300")
                    }
                  >
                    {registration.paymentStatus === "recorded" ? "Recorded (demo)" : "Pending"}
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </>
      )}
    </div>
  );
}
