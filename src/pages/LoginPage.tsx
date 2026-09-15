import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { ParticipantType } from "../lib/api";
import { Field } from "../components/ui/Field";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { validateRegisterNumber, validateEmail, validatePhoneNumber } from "../lib/validation";

export function LoginPage() {
  const [participantType, setParticipantType] = useState<ParticipantType>("internal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    regNumber: "",
    college: "",
    phone: "",
  });
  const { user, loading, signInWithGoogle, googlePendingProfile, completeGoogleProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // L17: only accept same-origin relative `next` targets. Parse with a real
  // URL so protocol-relative/hostile values are rejected, fragments are
  // dropped (a stale OAuth `#` must never land us on “/#”), and only the
  // pathname + query survive. Default to /register so a signed-in user who
  // clicks “Login” lands straight on registration (Day 1 / Day 2 events)
  // instead of a stranger page.
  const rawNext = searchParams.get("next");
  const next = (() => {
    if (!rawNext) return "/register";
    try {
      const target = new URL(rawNext, window.location.origin);
      if (target.origin !== window.location.origin) return "/register";
      return target.pathname + target.search || "/";
    } catch {
      return "/register";
    }
  })();

  // Backfill the full name from the Google profile once it arrives. This
  // adjusts state during render (React's recommended pattern) rather than
  // calling setState synchronously inside an effect.
  const [autoFilledEmail, setAutoFilledEmail] = useState<string | null>(null);
  if (googlePendingProfile && !form.fullName && autoFilledEmail !== googlePendingProfile.email) {
    setAutoFilledEmail(googlePendingProfile.email);
    setForm((f) => ({ ...f, fullName: googlePendingProfile.fullName }));
  }

  // After OAuth (or any sign-in), the browser lands back on /login with an
  // active session. Only move the user onward once they have a completed
  // profile. Google users without one must finish the "Complete profile"
  // (internal/external details) form first.
  useEffect(() => {
    if (!loading && user && !googlePendingProfile) {
      navigate(next, { replace: true });
    }
  }, [loading, user, googlePendingProfile, next, navigate]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (key === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10);
    }
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function handleGoogleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Try again.");
      setBusy(false);
    }
  }

  async function handleProfileComplete(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!form.fullName.trim()) {
        throw new Error("Full name is required.");
      }
      if (googlePendingProfile?.email) {
        const emailErr = validateEmail(googlePendingProfile.email, participantType);
        if (emailErr) throw new Error(emailErr);
      }
      if (participantType === "internal") {
        const regErr = validateRegisterNumber(form.regNumber, "internal");
        if (regErr) throw new Error(regErr);
        if (form.phone && form.phone.trim()) {
          const phoneErr = validatePhoneNumber(form.phone, false);
          if (phoneErr) throw new Error(phoneErr);
        }
      } else {
        if (!form.college.trim()) {
          throw new Error("College name is required for external participants.");
        }
        const phoneErr = validatePhoneNumber(form.phone, true);
        if (phoneErr) throw new Error(phoneErr);
      }
      await completeGoogleProfile({
        participantType,
        fullName: form.fullName.trim(),
        regNumber: form.regNumber || undefined,
        college: form.college || undefined,
        phone: form.phone || undefined,
      });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // While the session is being restored from Supabase, show a loading spinner.
  // Without this guard the user sees the login form briefly then it navigates
  // away — causing the "click login → loads → click again" double-click issue.
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <div className="reveal-up mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl lg:grid-cols-2">
      {/* Brand panel */}
      <section className="grain relative hidden overflow-hidden border-r border-edge lg:block">
        <img
          src="/images/arena.webp"
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background/60 to-primary-deep/30" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <p className="eyebrow">{`TechTrove 3.0 · SIMATS`}</p>
          <div>
            <img
              src="/images/techtrove-logo.webp"
              alt="TechTrove 3.0 wolf emblem"
              loading="lazy"
              className="glow-purple h-44 w-auto"
            />
            <h1 className="display mt-8 text-5xl text-foreground">Welcome to the pack</h1>
            <hr className="rule-line mt-6 w-40" />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
              One account for the whole symposium. Register teams, track entries and manage your
              TechTrove 3.0 participation.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Innovate. Compete. Conquer.
          </p>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex flex-col justify-center px-4 py-28 sm:px-10 lg:px-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-primary-soft"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
        </Link>

        {/* ── Google profile completion ─────────────────────── */}
        {googlePendingProfile ? (
          <>
            <h2 className="display mt-6 text-4xl text-foreground sm:text-5xl">Complete profile</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              You signed in with Google as <strong className="text-foreground">{googlePendingProfile.email}</strong>.
              Fill in a few more details to finish setting up your account.
            </p>

            <div
              role="tablist"
              aria-label="Participant type"
              className="mt-8 grid grid-cols-2 gap-px border border-edge bg-edge"
              onKeyDown={(e) => {
                const order = ["internal", "external"] as ParticipantType[];
                const idx = order.indexOf(participantType);
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const dir = e.key === "ArrowRight" ? 1 : -1;
                  setParticipantType(order[(idx + dir + order.length) % order.length]);
                }
              }}
            >
              {(["internal", "external"] as ParticipantType[]).map((type) => (
                <button
                  key={type}
                  role="tab"
                  id={`tab-${type}`}
                  aria-selected={participantType === type}
                  aria-controls="participant-type-panel"
                  tabIndex={participantType === type ? 0 : -1}
                  onClick={() => setParticipantType(type)}
                  className={
                    "clip-angle px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors " +
                    (participantType === type
                      ? "bg-primary text-white"
                      : "bg-background text-muted hover:text-foreground")
                  }
                >
                  {type}
                </button>
              ))}
            </div>
            <div
              id="participant-type-panel"
              role="tabpanel"
              aria-labelledby={`tab-${participantType}`}
            >
              <p className="mt-3 text-xs text-muted">
                {participantType === "internal"
                  ? "For SIMATS students. You need your Saveetha registration number."
                  : "For participants from other colleges."}
              </p>
            </div>

            <form onSubmit={handleProfileComplete} noValidate className="mt-6 space-y-5">
              <Field
                label="Full name"
                required
                value={form.fullName}
                onChange={set("fullName")}
                autoComplete="name"
                hint="This name will be reflected on the certificate."
              />
              <Field
                label="Email"
                value={googlePendingProfile.email}
                readOnly
                className="cursor-not-allowed text-muted"
                hint="From your Google account."
              />

              {participantType === "internal" ? (
                <>
                  <Field
                    label="Registration number"
                    required
                    value={form.regNumber}
                    onChange={set("regNumber")}
                    autoComplete="off"
                    placeholder="e.g. 19xxxxxxxx"
                  />
                  <Field
                    label="Phone number"
                    required
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    autoComplete="tel"
                    maxLength={10}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="College"
                    required
                    value={form.college}
                    onChange={set("college")}
                    autoComplete="organization"
                  />
                  <Field
                    label="Phone number"
                    required
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    autoComplete="tel"
                    maxLength={10}
                  />
                </>
              )}

              {error && (
                <p role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="clip-angle w-full bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
              >
                {busy ? "Please wait" : "Complete registration"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="display mt-6 text-4xl text-foreground sm:text-5xl">Sign in</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Sign in with your Google account to register teams and manage your TechTrove 3.0
              participation.
            </p>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="mt-8 flex w-full items-center justify-center gap-3 border border-edge-strong bg-background px-6 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-surface disabled:opacity-50"
            >
              <GoogleIcon className="h-5 w-5" />
              Sign in with Google
            </button>

            <p className="mt-5 text-center text-xs text-muted">
              New here?{" "}
              <Link
                to="/register"
                className="font-semibold text-primary-soft underline-offset-4 transition-colors hover:text-primary"
              >
                Start your registration
              </Link>
            </p>

            {error && (
              <p role="alert" className="mt-5 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-300">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
