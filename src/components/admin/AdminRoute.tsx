import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * AdminRoute
 * ----------
 * Protects all /wch1925/* management pages.
 *
 * - Loading → show nothing (prevents flash).
 * - No session → redirect to /wch1925 (admin login).
 * - Session exists but role !== 'admin' → redirect to / (silent, does not
 *   confirm the admin URL exists to normal users).
 * - Admin confirmed → render children / <Outlet />.
 *
 * "children" prop is used when wrapping individual page components;
 * <Outlet /> is used when nested inside a React Router <Route>.
 */
export function AdminRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    // Prevent flash of unauthenticated content while session restores
    return null;
  }

  if (!user) {
    return <Navigate to="/wch1925" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
