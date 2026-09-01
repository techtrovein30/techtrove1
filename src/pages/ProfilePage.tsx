import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Copy,
  Check,
  CreditCard,
  Users,
  CalendarDays,
  RefreshCcw,
  Loader2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Registration } from "../lib/api";
import { validateUploadFile } from "../lib/storage";
import { useEvent } from "../lib/useEvents";
import type { TechEvent } from "../lib/eventStore";
import { days as staticDays } from "../data/techtrove";
import { formatFee } from "../lib/utils";
import { siteConfig } from "../data/techtrove";

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function reviewNoteLabel(note: string): string {
  return note.replace(/^RE_UPLOAD_REQUESTED\s*—\s*/, "");
}

function dayLabelOf(event: TechEvent | undefined): string {
  if (!event) return "";
  return staticDays.find((d) => d.id === event.dayId)?.label ?? "";
}

function RegStatusBadge({ registration }: { registration: Registration }) {
  const participantType = registration.members[0]?.participantType;

  // Internal participant registrations are free and never carry a payment
  // screenshot, so a Paid/Pending badge would be misleading.
  if (participantType === "internal") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-edge-strong bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        <Users className="h-3 w-3" aria-hidden />
        Free Entry
      </span>
    );
  }

  const isRecorded = registration.paymentStatus === "recorded";
  const needsReupload = !isRecorded && !!registration.paymentReviewNote;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " +
        (isRecorded
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : needsReupload
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-sky-500/40 bg-sky-500/10 text-sky-400")
      }
    >
      <CreditCard className="h-3 w-3" aria-hidden />
      {isRecorded ? "Payment recorded" : needsReupload ? "Re-upload requested" : "Pending payment"}
    </span>
  );
}

function RegistrationCard({
  registration,
  onChanged,
}: {
  registration: Registration;
  onChanged?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);
  const { event }: { event: TechEvent | undefined } = useEvent(registration.eventId);

  const participantType = registration.members[0]?.participantType;
  const screenshotPath = registration.paymentScreenshotPath ?? registration.paymentScreenshotUrl;
  const hasScreenshot = !!screenshotPath;
  const needsReupload =
    participantType === "external" &&
    registration.paymentStatus === "pending" &&
    !!registration.paymentReviewNote;

  function copyCode() {
    navigator.clipboard.writeText(registration.registrationCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) {
      setSelectedFile(null);
      return;
    }
    const validation = validateUploadFile(selected);
    if (!validation.valid) {
      setUploadError(validation.error ?? "Invalid file.");
      setSelectedFile(null);
      return;
    }
    setUploadError(null);
    setSelectedFile(selected);
  }

  async function handleReupload() {
    if (!selectedFile) return;
    setUploadBusy(true);
    setUploadError(null);
    setUploadDone(false);
    try {
      await api.reuploadPaymentScreenshot(registration.id, selectedFile);
      setUploadDone(true);
      setSelectedFile(null);
      onChanged?.();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Re-upload failed. Please try again."
      );
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="glass-panel group relative overflow-hidden p-6 transition-all duration-300 hover:border-primary/40">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-all duration-500 group-hover:bg-primary/10" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {event?.category && (
            <span className="eyebrow inline-block text-primary-soft">{event.category}</span>
          )}
          <h3 className="display mt-1 text-2xl text-foreground sm:text-3xl">
            {event?.name ?? "Unknown Event"}
          </h3>
          {(dayLabelOf(event) || event?.time) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {dayLabelOf(event) && <span>{dayLabelOf(event)}</span>}
              {event?.time && (
                <>
                  <span aria-hidden className="text-muted/50">·</span>
                  <span className="font-mono">{event.time}</span>
                </>
              )}
            </p>
          )}
        </div>
        <RegStatusBadge registration={registration} />
      </div>

      <div className="relative mt-5 grid gap-4 border-t border-edge pt-5 sm:grid-cols-2">
        <div>
          <span className="eyebrow block text-muted">Team</span>
          <p className="mt-1 text-sm font-semibold text-foreground">{registration.teamName}</p>
        </div>
        <div>
          <span className="eyebrow block text-muted">Captain</span>
          <p className="mt-1 text-sm font-semibold text-foreground">{registration.captainName}</p>
        </div>
        <div>
          <span className="eyebrow block text-muted">Registration Code</span>
          <div className="mt-1 flex items-center gap-2">
            <code className="font-mono text-sm font-bold tracking-wider text-primary-soft">
              {registration.registrationCode}
            </code>
            <button
              type="button"
              onClick={copyCode}
              aria-label="Copy registration code"
              className="flex h-6 w-6 items-center justify-center border border-edge text-muted transition-colors hover:border-primary hover:text-primary-soft"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
        <div>
          <span className="eyebrow block text-muted">Fee</span>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {participantType === "internal" ? "Free" : formatFee(registration.fee)}
          </p>
        </div>
        {registration.utrNumber && (
          <div className="sm:col-span-2">
            <span className="eyebrow block text-muted">UTR / Transaction ID</span>
            <code className="mt-1 block font-mono text-xs font-bold text-primary-soft">
              {registration.utrNumber}
            </code>
          </div>
        )}
      </div>

      {/* Payment screenshot state + re-upload (external registrations only) */}
      {participantType === "internal" ? (
        <div className="relative mt-5 border-t border-edge pt-5">
          <span className="eyebrow block text-muted">Payment</span>
          <p className="mt-1 text-xs text-muted">
            Free entry — no payment screenshot is required for internal registrations.
          </p>
        </div>
      ) : registration.paymentStatus === "recorded" ? (
        <div className="relative mt-5 border-t border-edge pt-5">
          <span className="eyebrow block text-muted">Payment screenshot</span>
          <span className="mt-1 inline-flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
            <Check className="h-3 w-3" aria-hidden />
            Payment verified
          </span>
        </div>
      ) : (
        <div className="relative mt-5 border-t border-edge pt-5">
          <span className="eyebrow block text-muted">Payment screenshot</span>

          {needsReupload && registration.paymentReviewNote && (
            <div className="mt-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em]">
                <RefreshCcw className="h-3 w-3" aria-hidden />
                Re-upload requested
              </span>
              <span className="mt-0.5 block">{reviewNoteLabel(registration.paymentReviewNote)}</span>
            </div>
          )}

          {hasScreenshot ? (
            <>
              <p className="mt-1 text-xs text-muted">
                {needsReupload
                  ? "Upload a new screenshot to replace the one under review."
                  : "Screenshot submitted · awaiting admin approval."}
              </p>
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp"
                onChange={handleFileChange}
                className="mt-3 block w-full text-sm text-muted file:mr-4 file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-primary-soft hover:file:bg-primary/30"
              />
              <button
                type="button"
                onClick={handleReupload}
                disabled={uploadBusy || !selectedFile}
                className="clip-angle mt-3 inline-flex items-center gap-2 bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
              >
                {uploadBusy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Uploading…
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Upload new screenshot
                  </>
                )}
              </button>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">
              No payment screenshot is attached to this registration. Please contact support.
            </p>
          )}

          {uploadError && (
            <p role="alert" className="mt-3 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
              {uploadError}
            </p>
          )}
          {uploadDone && (
            <p role="status" className="mt-3 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
              Payment screenshot re-uploaded. Awaiting admin review again.
            </p>
          )}
        </div>
      )}

      {registration.members.length > 0 && (
        <div className="relative mt-5 border-t border-edge pt-5">
          <span className="eyebrow block text-muted">
            <Users className="mr-1 inline h-3 w-3" aria-hidden />
            Team Members ({registration.members.length})
          </span>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {registration.members.map((m, i) => (
              <li
                key={i}
                className="flex flex-col gap-1 border border-edge bg-surface/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-primary/15 text-[9px] font-bold text-primary-soft">
                    {m.position}
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-muted">
                    {m.role}
                  </span>
                </div>
                <div className="ml-7 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                  <span>{m.email}</span>
                  {m.participantType === "internal" && m.regNumber && (
                    <span className="font-mono text-primary-soft">{m.regNumber}</span>
                  )}
                  {m.participantType === "external" && m.phone && <span>{m.phone}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {event && (
        <div className="relative mt-5 border-t border-edge pt-5">
          <Link
            to={`/events/${event.id}`}
            className="group/link inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-primary-soft"
          >
            View event details
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-1" aria-hidden />
          </Link>
        </div>
      )}

      <p className="relative mt-4 text-[11px] text-muted">
        Registered on {formatDate(registration.createdAt)}
      </p>
    </div>
  );
}

function DetailCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-panel p-5">
      <span className="eyebrow block text-muted">{label}</span>
      <p
        className={
          "mt-2 text-sm font-semibold break-all " +
          (accent ? "font-mono tracking-wider text-primary-soft" : "text-foreground")
        }
      >
        {value}
      </p>
    </div>
  );
}

export function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login?next=/profile", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const loadRegistrations = useCallback(() => {
    api
      .listMyRegistrations()
      .then(setRegistrations)
      .catch(() => setRegistrations([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadRegistrations();
    window.addEventListener("focus", loadRegistrations);
    return () => window.removeEventListener("focus", loadRegistrations);
  }, [user, loadRegistrations]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const detailCards = [
    { label: "Email", value: user.email, accent: false },
    ...(user.participantType === "internal" && user.regNumber
      ? [{ label: "Registration Number", value: user.regNumber, accent: true }]
      : []),
    ...(user.participantType === "external" && user.college
      ? [{ label: "College", value: user.college, accent: false }]
      : []),
    ...(user.phone
      ? [{ label: "Phone", value: user.phone, accent: false }]
      : []),
    {
      label: "Participant Type",
      value: user.participantType === "internal" ? "SIMATS Student" : "External Participant",
      accent: false,
    },
    {
      label: "Total Registrations",
      value: String(registrations.length),
      accent: false,
    },
  ];

  return (
    <div className="reveal-up">
      {/* Hero header */}
      <section className="grain relative overflow-hidden border-b border-edge">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-deep/20 via-background/60 to-background" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-32 pb-16 sm:px-6 md:pt-40 md:pb-20">
          <p className="eyebrow text-primary-soft">Your profile</p>
          <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-gradient-to-br from-primary to-primary-deep text-4xl font-bold text-white">
              {initialsOf(user.fullName)}
            </div>
            <div className="min-w-0">
              <h1 className="display text-4xl text-foreground sm:text-5xl">
                {user.fullName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span
                  className={
                    "border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                    (user.participantType === "internal"
                      ? "border-primary/50 bg-primary/10 text-primary-soft"
                      : "border-edge-strong bg-surface text-muted")
                  }
                >
                  {user.participantType === "internal" ? "SIMATS Student" : "External"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Profile details */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <p className="eyebrow">Account details</p>
        <hr className="rule-line mt-4 w-32" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detailCards.map((card) => (
            <DetailCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      {/* Registered events */}
      <section className="border-t border-edge bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">
                <CalendarDays className="mr-1 inline h-3 w-3" aria-hidden />
                Your registrations
              </p>
              <h2 className="display mt-3 text-3xl text-foreground sm:text-4xl">
                Registered events
              </h2>
              <hr className="rule-line mt-4 w-32" />
            </div>
            <Link
              to="/events"
              className="group inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-primary-soft"
            >
              Browse all events
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>

          {loading ? (
            <div className="mt-10 flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : registrations.length === 0 ? (
            <div className="glass-panel mt-10 flex flex-col items-center rounded-sm px-6 py-20 text-center">
              <img
                src="/images/techtrove-logo.webp"
                alt=""
                loading="lazy"
                className="mb-6 h-16 w-auto opacity-20"
              />
              <p className="display text-2xl text-foreground">No registrations yet</p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                You have not registered for any events. Browse the events catalog and register your
                team to get started.
              </p>
              <Link
                to="/events"
                className="clip-angle mt-8 inline-flex items-center gap-2 bg-primary px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all hover:bg-primary-soft"
              >
                Explore events
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {registrations.map((reg) => (
                <RegistrationCard
                  key={reg.id}
                  registration={reg}
                  onChanged={loadRegistrations}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/events"
            className="glass-panel group flex items-center gap-5 p-6 transition-all duration-300 hover:border-primary/40"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10 text-primary-soft">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="display text-xl text-foreground">Browse events</p>
              <p className="mt-1 text-sm text-muted">Discover and register for more events</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary-soft" />
          </Link>
          <Link
            to="/register"
            className="glass-panel group flex items-center gap-5 p-6 transition-all duration-300 hover:border-primary/40"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10 text-primary-soft">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="display text-xl text-foreground">Register a team</p>
              <p className="mt-1 text-sm text-muted">Sign up your team for a new event</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary-soft" />
          </Link>
        </div>
      </section>

      {/* Site footer band */}
      <section className="border-t border-edge bg-surface/30">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 md:py-20">
          <img
            src="/images/techtrove-logo.webp"
            alt="TechTrove 3.0 logo"
            loading="lazy"
            className="h-14 w-auto"
          />
          <p className="display mt-6 text-2xl text-foreground sm:text-3xl">
            {siteConfig.tagline}
          </p>
          <p className="mt-3 max-w-sm text-sm text-muted">
            {siteConfig.eventDate} · {siteConfig.venue}
          </p>
        </div>
      </section>
    </div>
  );
}
