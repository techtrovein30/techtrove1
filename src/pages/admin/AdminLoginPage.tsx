import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  adminSignIn,
  adminSignOut,
  adminSignInWithGoogle,
  adminResolveOAuthAccess,
} from "../../lib/adminApi";

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

export function AdminLoginPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthMode = searchParams.get("oauth") === "google";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Guard against StrictMode double-invoking the OAuth resolution effect
  const oauthAttempted = useRef(false);

  // If already authenticated as admin, redirect immediately.
  // Skipped during the post-Google round-trip — the OAuth resolution below
  // handles navigation so a not-yet-promoted admin isn't bounced away.
  useEffect(() => {
    if (oauthMode) return;
    if (user?.role === "admin") {
      navigate("/wch1925/dashboard", { replace: true });
    }
  }, [user, navigate, oauthMode]);

  // If logged in as a normal user, sign them out silently before showing
  // the admin login so we don't accidentally grant admin access.
  // Skipped while the Google allowlist check is running below.
  useEffect(() => {
    if (oauthMode) return;
    if (user && user.role !== "admin") {
      signOut();
    }
  }, [user, signOut, oauthMode]);

  // ── Post Google OAuth round-trip ─────────────────────────────────────────
  // The allowlist is checked server-side via ensure_admin_access(). If the
  // email is allowed, the participant row is promoted to admin and we enter
  // the panel. Otherwise we sign out and reject.
  useEffect(() => {
    if (!oauthMode || oauthAttempted.current) return;
    oauthAttempted.current = true;
    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        const allowed = await adminResolveOAuthAccess();
        if (allowed) {
          window.location.replace("/wch1925/dashboard");
          return;
        }
        adminSignOut();
        if (!cancelled) {
          setError("This Google account is not authorised for admin access.");
          setBusy(false);
          navigate("/wch1925", { replace: true });
        }
      } catch (err) {
        adminSignOut();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Admin sign-in failed. Try again.");
          setBusy(false);
          navigate("/wch1925", { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [oauthMode, navigate]);

  async function handleGoogleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await adminSignInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Try again.");
      setBusy(false);
    }
  }

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
      void admin;
      window.location.replace("/wch1925/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  const showVerifying = oauthMode && !error;

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

        {showVerifying ? (
          <div className="mt-10 flex flex-col items-center gap-4 pb-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary-soft" aria-hidden />
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Verifying authorised access…
            </p>
          </div>
        ) : (
          <>
            {/* ── Google OAuth button ─────────────────────────────── */}
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
                <span className="bg-background px-4 text-muted uppercase tracking-[0.14em]">
                  or
                </span>
              </div>
            </div>

            {/* Login form */}
            <form
              onSubmit={handleSubmit}
              noValidate
              className="space-y-4"
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
          </>
        )}

        <p className="mt-8 text-center text-[11px] text-muted/50">
          Restricted access. Authorised personnel only.
        </p>
      </div>
    </div>
  );
}