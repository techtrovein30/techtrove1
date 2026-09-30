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

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin") {
        setHasAssignment(true);
        setChecking(false);
        return;
      }

      getAssignedCoordinatorEvent(user)
        .then((res) => {
          setHasAssignment(Boolean(res));
        })
        .catch(() => setHasAssignment(false))
        .finally(() => setChecking(false));
    } else if (!loading && !user) {
      setChecking(false);
    }
  }, [user, loading]);

  if (loading || checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=/coordinator" replace />;
  }

  if (!hasAssignment) {
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
