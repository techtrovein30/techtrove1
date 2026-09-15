import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { requireAdmin } from "../../lib/adminGuard";

/**
 * AdminRoute
 * ----------
 * Protects all /wasd4381/* management pages.
 *
 * - Loading → show nothing (prevents flash).
 * - No session → redirect to /wasd4381 (admin login).
 * - Session exists but role !== 'admin' → verify once more straight from the
 *   DB before bouncing. This covers the Google-OAuth race where the role was
 *   just promoted by ensure_admin_access() but AuthContext still holds the
 *   pre-promotion role (otherwise a legit admin gets silently kicked to "/").
 * - Role confirmed 'admin' (directly or after re-check) → render children.
 */
export function AdminRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const [rechecking, setRechecking] = useState(false);
  const [recheckOk, setRecheckOk] = useState(false);

  useEffect(() => {
    if (loading || !user || user.role === "admin" || recheckOk) return;
    let cancelled = false;
    // Defer into a microtask so no state is set synchronously inside the
    // effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setRechecking(true);
      requireAdmin()
        .then(() => {
          if (cancelled) return;
          setRecheckOk(true);
          // Sync the context so the rest of the app sees role='admin' too.
          refreshUser();
        })
        .catch(() => {
          if (cancelled) return;
          setRecheckOk(false);
        })
        .finally(() => {
          if (!cancelled) setRechecking(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, refreshUser, recheckOk]);

  if (loading) {
    // Prevent flash of unauthenticated content while session restores
    return null;
  }

  if (!user) {
    return <Navigate to="/wasd4381" replace />;
  }

  if (user.role !== "admin" && !recheckOk) {
    // Verify against the DB before bouncing — a stale role here is usually
    // the OAuth-promotion race, not an actual lack of permissions.
    if (rechecking) return null;
    console.warn("[admin-oauth] AdminRoute bounce: user role =", user.role);
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}