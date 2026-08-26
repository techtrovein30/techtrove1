import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminSignIn, seedAdminIfNeeded } from "../../lib/adminApi";
import { seedEventsIfNeeded } from "../../lib/eventStore";

export function AdminLoginPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed admin account and event store on first visit
  useEffect(() => {
    seedAdminIfNeeded();
    seedEventsIfNeeded();
  }, []);

  // If already authenticated as admin, redirect immediately
  useEffect(() => {
    if (user?.role === "admin") {
      navigate("/wch1925/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // If logged in as a normal user, sign them out silently before showing
  // the admin login so we don't accidentally grant admin access
  useEffect(() => {
    if (user && user.role !== "admin") {
      signOut();
    }
  }, [user, signOut]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError("Enter your credentials to continue.");
      return;
    }
    setBusy(true);
    try {
      const admin = await adminSignIn(identifier.trim(), password);
      // Sync to AuthContext by triggering a page refresh — the restored
      // session will pick up the admin role automatically.
      // We write to localStorage directly via adminSignIn, so just reload.
      void admin;
      window.location.replace("/wch1925/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Subtle background glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-center justify-center"
      >
        <div className="h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Icon */}
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center border border-primary/40 bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary-soft" />
        </div>

        <p className="eyebrow text-center">TechTrove 3.0</p>
        <h1 className="display mt-2 text-center text-3xl text-foreground">
          Control Panel
        </h1>
        <hr className="rule-line mx-auto mt-4 w-24" />

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-8 space-y-4"
          aria-label="Admin login"
        >
          <div>
            <label
              htmlFor="admin-identifier"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted"
            >
              Username
            </label>
            <input
              id="admin-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              className="w-full border border-edge bg-surface px-4 py-3 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-primary-soft"
              placeholder="Admin username"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full border border-edge bg-surface px-4 py-3 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-primary-soft"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="clip-angle mt-2 flex w-full items-center justify-center gap-2 bg-primary px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {busy ? "Verifying" : "Access Panel"}
          </button>
        </form>

        <p className="mt-8 text-center text-[11px] text-muted/50">
          Restricted access. Authorised personnel only.
        </p>
      </div>
    </div>
  );
}