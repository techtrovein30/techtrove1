import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getAssignedCoordinatorEvent } from "../../lib/coordinatorApi";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export function CoordinatorRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasAssignment, setHasAssignment] = useState(false);

  // Admins bypass the assignment lookup entirely. Derived rather than stored,
  // so no effect has to setState synchronously to express "an admin is allowed".
  const isAdmin = user?.role === "admin";
  const allowed = isAdmin || hasAssignment;

  useEffect(() => {
    // An admin never needs the lookup, and short-circuiting here keeps them off
    // the request entirely rather than fetching and then ignoring the answer.
    if (loading || !user || isAdmin) return;

    let cancelled = false;
    getAssignedCoordinatorEvent(user)
      .then((res) => {
        if (!cancelled) setHasAssignment(Boolean(res));
      })
      .catch(() => {
        if (!cancelled) setHasAssignment(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      // Cancelled rather than left uncancelled: this decides whether the roster
      // is shown at all, and a late response must not re-open a gate that a
      // later render has already closed.
      cancelled = true;
    };
  }, [user, loading, isAdmin]);

  if (loading || (checking && !isAdmin)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=/coordinator" replace />;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="display mt-6 text-2xl text-foreground sm:text-3xl">
          Coordinator Access Restricted
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          No event has been assigned to this coordinator.
        </p>
        <p className="mt-1 text-xs text-muted/70">
          Please contact the fest administrators to assign you as the main coordinator for your event.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            to="/profile"
            className="rounded-lg bg-surface border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-white/[0.05]"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
