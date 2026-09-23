import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Copy, Check } from "lucide-react";
import { useEvent } from "../lib/useEvents";
import { api } from "../lib/api";
import type { Registration } from "../lib/api";
import { formatFee } from "../lib/utils";
import { useToast } from "../components/ui/toastContext";
import { WhatsAppIcon } from "../components/ui/WhatsAppIcon";

const WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/F3ca20zjmVoJcu6FCYGPSZ";

export function RegisterSuccessPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [notFound, setNotFound] = useState(() => !code);
  const [showReceipt, setShowReceipt] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const greetedRef = useRef(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    api
      .getRegistrationByCode(code)
      .then((reg) => {
        if (cancelled) return;
        setRegistration(reg);
        if (!greetedRef.current) {
          greetedRef.current = true;
          toast.success("Registration confirmed — welcome to TechTrove 3.0!");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: registration data cached during redirect by RegisterPage
        try {
          const cached = sessionStorage.getItem("tt:lastRegistration");
          if (cached) {
            const parsed = JSON.parse(cached) as Registration;
            if (parsed.registrationCode === code) {
              setRegistration(parsed);
              return;
            }
          }
        } catch { /* parse error — ignore */ }
        setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, toast]);

  const { event } = useEvent(registration?.eventId);

  // Internal registrations are free and instantly confirmed (keyed off participant type, not fee)
  const isInternal = registration !== null && registration.members[0]?.participantType === "internal";

  function copyCode() {
    if (!registration) return;
    navigator.clipboard.writeText(registration.registrationCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="reveal-up mx-auto max-w-3xl px-4 pb-24 pt-28 text-center sm:px-6 md:pt-36">
      <span className="success-emblem glow-purple mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary bg-primary/15">
        <BadgeCheck className="h-8 w-8 text-primary-soft" aria-hidden />
      </span>

      <p className="eyebrow mt-8">TechTrove 3.0</p>
      <h1 className="display mt-3 text-5xl text-foreground sm:text-7xl">Registration successful</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        {isInternal
          ? "You're registered! Keep your Registration ID safe — it's your reference for all communication with the organising committee."
          : "Your team is in. Keep your registration ID safe — it is your reference for all communication with the organizing committee."}
      </p>

      {!notFound && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Registration ID</p>
          <div className="flex items-center gap-3">
            <p
              id="registration-id-display"
              className="inline-flex border border-primary/60 bg-primary/10 px-5 py-2.5 font-mono text-lg tracking-[0.2em] text-primary-soft"
            >
              {registration ? registration.registrationCode : "TT-…"}
            </p>
            {registration && (
              <button
                type="button"
                onClick={copyCode}
                aria-label="Copy Registration ID"
                className="flex h-10 w-10 items-center justify-center border border-edge text-muted transition-colors hover:border-primary hover:text-primary-soft"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      )}

      {notFound && (
        <p role="alert" className="mx-auto mt-8 max-w-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          We could not find this registration. It may have been created in a
          different session or the registration code is invalid.
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

          <a
            href={WHATSAPP_COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-10 flex flex-col items-center gap-4 rounded-2xl border border-edge-strong bg-background p-6 transition-colors hover:border-emerald-400/50 sm:flex-row sm:text-left"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
              <WhatsAppIcon className="h-7 w-7" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
                Join our WhatsApp community
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Get live updates, event reminders and important announcements. Tap anywhere to join the chat.
              </span>
            </span>
            <span className="clip-angle shrink-0 bg-emerald-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors group-hover:bg-emerald-400 sm:ml-auto">
              Join now
            </span>
          </a>

          {showReceipt && (
            <dl className="reveal-up panel diag-stripes mt-10 p-6 text-left sm:p-8" aria-label="Registration receipt">
              {[
                ["Event", "TechTrove 3.0"],
                ["Category", event?.category ?? "-"],
                ["Venue", "SIMATS Campus, Chennai"],
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
                // Only show fee and UTR rows for external participants
                ...(!isInternal ? [
                  ["Fee", formatFee(registration.fee)],
                  ...(registration.utrNumber ? [["UTR / Txn ID", registration.utrNumber]] : []),
                ] : []),
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col gap-1 border-b border-edge py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-8">
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{term}</dt>
                  <dd className="min-w-0 text-sm sm:text-right">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between pt-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Status</dt>
                <dd>
                  <span className="border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    Confirmed
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
