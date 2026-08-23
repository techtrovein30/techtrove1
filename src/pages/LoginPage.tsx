import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { ParticipantType } from "../lib/mockApi";
import { Field } from "../components/ui/Field";

type Mode = "signin" | "signup";

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
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") ?? "/register";

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

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
        if (!form.fullName.trim() || !form.regNumber.trim() || !form.password) {
          throw new Error("Fill in all required fields.");
        }
        if (form.password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        await signUp("internal", {
          fullName: form.fullName,
          regNumber: form.regNumber,
          password: form.password,
        });
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
        if (form.password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        await signUp("external", { ...form });
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
          src="/images/arena.jpg"
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background/60 to-primary-deep/30" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <p className="eyebrow">{`TechTrove · SIMATS`}</p>
          <div>
            <img
              src="/images/techtrove-logo.png"
              alt="TechTrove wolf emblem"
              loading="lazy"
              className="glow-purple h-44 w-auto"
            />
            <h1 className="display mt-8 text-5xl text-foreground">Welcome to the pack</h1>
            <hr className="rule-line mt-6 w-40" />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
              One account for the whole symposium. Register teams, track entries and manage your
              TechTrove participation.
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

        <h2 className="display mt-6 text-4xl text-foreground sm:text-5xl">
          {mode === "signin" ? "Login" : "Create account"}
        </h2>

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
            ? "For SIMATS students. Sign in with your registration number."
            : "For participants from other colleges."}
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          {mode === "signup" && (
            <Field
              label={participantType === "internal" ? "Full name" : "Full name"}
              required
              value={form.fullName}
              onChange={set("fullName")}
              autoComplete="name"
            />
          )}

          {mode === "signin" ? (
            <Field
              label="Registration number or email"
              required
              value={form.identifier}
              onChange={set("identifier")}
              autoComplete="username"
            />
          ) : participantType === "internal" ? (
            <Field
              label="Registration number"
              required
              value={form.regNumber}
              onChange={set("regNumber")}
              autoComplete="off"
            />
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

        <p className="mt-6 text-sm text-muted">
          {mode === "signin" ? "New to TechTrove?" : "Already have an account?"}{" "}
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

        <p className="mt-8 flex items-start gap-2 border-t border-edge pt-6 text-xs leading-relaxed text-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Demo mode: accounts are stored only in this browser. No real authentication is performed.
        </p>
      </section>
    </div>
  );
}
