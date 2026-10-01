import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isCoreAdminUser, requireAdmin } from "../../lib/adminGuard";

/**
 * AdminRoute
 * ----------
 * Protects management pages (/wasd4381/* and /tswc3020/*).
 *
 * - Loading → show nothing (prevents flash).
 * - No session → redirect to loginPath.
 * - Session exists but role !== 'admin' → verify once more straight from the
 *   DB before bouncing.
 * - If requireCore is true (/wasd4381/*): checks admin_allowlist.
 *   Non-core admins (Faculty Admins) are automatically redirected to /tswc3020/dashboard.
 * - Role confirmed 'admin' (and core if required) → render children.
 */
export function AdminRoute({
  children,
  loginPath = "/wasd4381",
  requireCore = false,
}: {
  children?: React.ReactNode;
  loginPath?: string;
  requireCore?: boolean;
}) {
  const { user, loading, refreshUser } = useAuth();
  const [rechecking, setRechecking] = useState(false);
  const [recheckOk, setRecheckOk] = useState(false);
  const [coreChecking, setCoreChecking] = useState(requireCore);
  const [isCore, setIsCore] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || !user || user.role === "admin" || recheckOk) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setRechecking(true);
      requireAdmin()
        .then(() => {
          if (cancelled) return;
          setRecheckOk(true);
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

  useEffect(() => {
    if (!requireCore || !user || (user.role !== "admin" && !recheckOk)) {
      setCoreChecking(false);
      return;
    }
    let cancelled = false;
    isCoreAdminUser(user.email)
      .then((res) => {
        if (!cancelled) {
          setIsCore(res);
          setCoreChecking(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsCore(false);
          setCoreChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requireCore, user, recheckOk]);

  if (loading || (requireCore && coreChecking)) {
    return null;
  }

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  if (user.role !== "admin" && !recheckOk) {
    if (rechecking) return null;
    console.warn("[admin-oauth] AdminRoute bounce: user role =", user.role);
    return <Navigate to="/" replace />;
  }

  // If this route strictly requires Core Admin, bounce non-core faculty admins to /tswc3020/dashboard
  if (requireCore && isCore === false) {
    console.warn("[admin-route] Non-core admin redirected to /tswc3020/dashboard");
    return <Navigate to="/tswc3020/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}