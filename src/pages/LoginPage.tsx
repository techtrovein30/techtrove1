import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { ParticipantType } from "../lib/mockApi";
import { Field } from "../components/ui/Field";

type Mode = "signin" | "signup";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage() {
  const [participantType, setParticipantType] = useState<ParticipantType>("internal");
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    identifier: "",
    fullName: "",
    regNumber: "",
    email: "",
    college: "",
    phone: "",
    password: "",
  });
  const { user, loading, signIn, signUp, signInWithGoogle, googlePendingProfile, completeGoogleProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") ?? "/register";
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);

  useEffect(() => {
    if (googlePendingProfile && !form.fullName) {
      setForm((f) => ({ ...f, fullName: googlePendingProfile.fullName }));
    }
  }, [googlePendingProfile]);

  // After OAuth (or any sign-in), the browser lands back on /login with an
  // active session. Only move the user onward once they have a completed
  // profile. Google users without one must finish the "Complete profile"
  // (internal/external details) form first.
  useEffect(() => {
    if (!loading && user && !googlePendingProfile) {
      navigate(next, { replace: true });
    }
  }, [loading, user, googlePendingProfile, next, navigate]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

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
      if (participantType === "internal") {
        if (!form.regNumber.trim() || !form.phone.trim()) {
          throw new Error("Registration number and phone number are required for SIMATS students.");
        }
      } else {
        if (!form.college.trim() || !form.phone.trim()) {
          throw new Error("College and phone number are required for external participants.");
        }
      }
      if (form.phone && !/^\d{10}$/.test(form.phone.trim())) {
        throw new Error("Phone number must be exactly 10 digits.");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        if (!form.identifier.trim() || !form.password) {
          throw new Error("Enter your credentials to continue.");
        }
        await signIn(form.identifier, form.password);
      } else if (participantType === "internal") {
        if (!form.fullName.trim() || !form.regNumber.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
          throw new Error("Fill in all required fields.");
        }
        if (!/^[^\s@]+@saveetha\.[a-z.]+$/i.test(form.email.trim())) {
          throw new Error("Internal students must register with their Saveetha email (e.g. name@saveetha.com).");
        }
        if (!/^\d{10}$/.test(form.phone.trim())) {
          throw new Error("Phone number must be exactly 10 digits.");
        }
        if (form.password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        const created = await signUp("internal", { ...form });
        setCreatedUsername(created.username);
        return;
      } else {
        if (
          !form.fullName.trim() ||
          !form.email.trim() ||
          !form.college.trim() ||
          !form.phone.trim() ||
          !form.password
        ) {
          throw new Error("Fill in all required fields.");
        }
        if (!/^\S+@\S+\.\S+$/.test(form.email)) {
          throw new Error("Enter a valid email address.");
        }
        if (!/^\d{10}$/.test(form.phone.trim())) {
          throw new Error("Phone number must be exactly 10 digits.");
        }
        if (form.password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        const created = await signUp("external", { ...form });
        setCreatedUsername(created.username);
        return;
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
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

            <div role="tablist" aria-label="Participant type" className="mt-8 grid grid-cols-2 gap-px border border-edge bg-edge">
              {(["internal", "external"] as ParticipantType[]).map((type) => (
                <button
                  key={type}
                  role="tab"
                  aria-selected={participantType === type}
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
            <p className="mt-3 text-xs text-muted">
              {participantType === "internal"
                ? "For SIMATS students. You need your Saveetha registration number."
                : "For participants from other colleges."}
            </p>

            <form onSubmit={handleProfileComplete} noValidate className="mt-6 space-y-5">
              <Field
                label="Full name"
                required
                value={form.fullName}
                onChange={set("fullName")}
                autoComplete="name"
                hint="Please verify your name."
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
                    placeholder="e.g. 230701XXX"
                  />
                  <Field
                    label="Phone number"
                    required
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    autoComplete="tel"
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
        ) : createdUsername ? (
          <div className="clip-angle diag-stripes mt-8 border border-edge bg-surface p-8 text-center sm:p-10">
            <p className="eyebrow">Account created</p>
            <h2 className="display mt-3 text-3xl text-foreground">You are in the pack</h2>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Your username
            </p>
            <p className="display mt-2 border border-primary/50 bg-primary/10 px-4 py-3 text-2xl tracking-wide text-primary-soft">
              {createdUsername}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Generated from your name. Use it — or your email — with the password you created to
              sign in next time.
            </p>
            <button
              type="button"
              onClick={() => navigate(next, { replace: true })}
              className="clip-angle mt-7 w-full bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <h2 className="display mt-6 text-4xl text-foreground sm:text-5xl">
              {mode === "signin" ? "Login" : "Create account"}
            </h2>

            {/* ── Sign-in mode ─────────────────────── */}
            {mode === "signin" && (
              <>
                {/* Google OAuth button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy}
                  className="mt-8 flex w-full items-center justify-center gap-3 border border-edge-strong bg-background px-6 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-surface disabled:opacity-50"
                >
                  <GoogleIcon className="h-5 w-5" />
                  Sign in with Google
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-edge" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-4 text-muted uppercase tracking-[0.14em]">or</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Sign-up mode ─────────────────────── */}
            {mode === "signup" && (
              <>
                {/* Google OAuth button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy}
                  className="mt-8 flex w-full items-center justify-center gap-3 border border-edge-strong bg-background px-6 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-surface disabled:opacity-50"
                >
                  <GoogleIcon className="h-5 w-5" />
                  Sign up with Google
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-edge" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-4 text-muted uppercase tracking-[0.14em]">or</span>
                  </div>
                </div>

                {/* ── Participant type tabs ─────────────────────── */}
                <div role="tablist" aria-label="Participant type" className="grid grid-cols-2 gap-px border border-edge bg-edge">
                  {(["internal", "external"] as ParticipantType[]).map((type) => (
                    <button
                      key={type}
                      role="tab"
                      aria-selected={participantType === type}
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
                <p className="mt-3 text-xs text-muted">
                  {participantType === "internal"
                    ? "For SIMATS students. Register with your Saveetha mail and registration number."
                    : "For participants from other colleges."}
                </p>
              </>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
              {mode === "signup" && (
                <Field
                  label="Full name"
                  required
                  value={form.fullName}
                  onChange={set("fullName")}
                  autoComplete="name"
                />
              )}

              {mode === "signin" ? (
                <Field
                  label="Username, reg no. or email"
                  required
                  value={form.identifier}
                  onChange={set("identifier")}
                  autoComplete="username"
                />
              ) : participantType === "internal" ? (
                <>
                  <Field
                    label="Registration number"
                    required
                    value={form.regNumber}
                    onChange={set("regNumber")}
                    autoComplete="off"
                  />
                  <Field
                    label="Saveetha email"
                    type="email"
                    required
                    value={form.email}
                    onChange={set("email")}
                    autoComplete="email"
                    hint="Your official Saveetha mail id (e.g. name@saveetha.com)."
                  />
                  <Field
                    label="Phone number"
                    type="tel"
                    required
                    value={form.phone}
                    onChange={set("phone")}
                    autoComplete="tel"
                  />
                </>
              ) : (
                <>
                  <Field label="Email" type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
                  <Field label="College" required value={form.college} onChange={set("college")} autoComplete="organization" />
                  <Field label="Phone" type="tel" required value={form.phone} onChange={set("phone")} autoComplete="tel" />
                </>
              )}

              <Field
                label="Password"
                type="password"
                required
                value={form.password}
                onChange={set("password")}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />

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
                {busy ? "Please wait" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </>
        )}

        {/* ── Mode toggle (not shown during Google completion) ─── */}
        {!googlePendingProfile && !createdUsername && (
          <p className="mt-6 text-sm text-muted">
            {mode === "signin" ? "New to TechTrove 3.0?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="font-semibold uppercase tracking-[0.14em] text-primary-soft hover:text-primary"
            >
              {mode === "signin" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        )}

      </section>
    </div>
  );
}
