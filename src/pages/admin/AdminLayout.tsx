import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  History,
  LogOut,
  Mail,
  Menu,
  RefreshCcw,
  ShieldCheck,
  Users,
  ClipboardList,
  UsersRound,
  UserCheck,
  TrendingUp,
  Eye,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminSignOut } from "../../lib/adminApi";
import { seedEventsIfNeeded } from "../../lib/eventStore";
import { cn } from "../../lib/utils";

interface AdminNavItemDef {
  page: string;
  label: string;
  icon: React.ElementType;
}

const ALL_NAV_DEFS: AdminNavItemDef[] = [
  { page: "dashboard", label: "Dashboard", icon: BarChart3 },
  { page: "revenue", label: "Revenue", icon: TrendingUp },
  { page: "coordinators", label: "Coordinators", icon: UserCheck },
  { page: "students", label: "Students", icon: Users },
  { page: "registrations", label: "Registrations", icon: ClipboardList },
  { page: "teams", label: "Teams", icon: UsersRound },
  { page: "payments", label: "Payments", icon: CreditCard },
  { page: "reuploads", label: "Re-uploads", icon: RefreshCcw },
  { page: "history", label: "Deleted History", icon: History },
  { page: "emails", label: "Email Queue", icon: Mail },
  { page: "events", label: "Events", icon: CalendarDays },
];

const FACULTY_PAGES = new Set(["dashboard", "coordinators", "students", "registrations", "teams", "events"]);

function NavItem({
  to,
  label,
  icon: Icon,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
          isActive
            ? "bg-primary/10 text-primary-soft shadow-[inset_3px_0_0_0_#7c3aed]"
            : "text-muted hover:bg-white/[0.03] hover:text-foreground"
        )
      }
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
          "group-[.active]:text-primary-soft"
        )}
        aria-hidden
      />
      {label}
    </NavLink>
  );
}

export function AdminLayout({
  viewOnly = false,
  basePath = "/wasd4381",
}: {
  viewOnly?: boolean;
  basePath?: string;
} = {}) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter navigation items: faculty admin only gets the 6 requested pages
  const navItems = ALL_NAV_DEFS
    .filter((def) => !viewOnly || FACULTY_PAGES.has(def.page))
    .map((def) => ({
      to: `${basePath}/${def.page}`,
      label: def.label,
      icon: def.icon,
    }));

  // Seed the event store once — this layout is only mounted behind AdminRoute,
  // so seeding (a DB write) never runs for unauthenticated visitors (H04).
  useEffect(() => {
    seedEventsIfNeeded().catch(() => {
      // Seeding is best-effort; the events table may already be populated.
    });
  }, []);

  const handleSignOut = useCallback(() => {
    void adminSignOut();
    window.location.replace(basePath);
  }, [basePath]);

  // L15: auto sign-out after 15 minutes of inactivity in the admin panel.
  useEffect(() => {
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    function resetIdle() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => handleSignOut(), IDLE_TIMEOUT_MS);
    }

    const activityEvents = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, resetIdle, { passive: true })
    );
    resetIdle();

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetIdle));
    };
  }, [handleSignOut]);

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <div className={`flex h-7 w-7 items-center justify-center ${viewOnly ? "bg-sky-500/20 text-sky-400" : "bg-primary/20 text-primary-soft"}`}>
          {viewOnly ? (
            <Eye className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            TechTrove 3.0
          </p>
          <p className={`text-[10px] uppercase tracking-[0.14em] font-semibold ${viewOnly ? "text-sky-400" : "text-muted"}`}>
            {viewOnly ? "Faculty View" : "Admin Panel"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Admin navigation"
        className="flex-1 overflow-y-auto p-3 space-y-1"
      >
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            onClick={() => setSidebarOpen(false)}
          />
        ))}
      </nav>

      {/* System Status */}
      <div className="px-3 pb-3">
        <div className="rounded-lg border border-white/[0.05] bg-[#161616] p-3 text-xs transition-colors hover:border-white/[0.1]">
          <div className="flex items-center gap-2 font-semibold text-emerald-400">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            {viewOnly ? "FACULTY READ-ONLY" : "SYSTEM ACTIVE"}
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {viewOnly ? "Observation & Audit Portal" : "Event Command Center"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted/70">
            build {__APP_VERSION__}
          </p>
        </div>
      </div>

      {/* Admin user + sign-out */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-bold uppercase ${viewOnly ? "bg-sky-500/20 text-sky-400" : "bg-primary/20 text-primary-soft"}`}>
            {(user?.fullName ?? "F")
              .trim()
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-foreground">
              {user?.fullName ?? (viewOnly ? "Faculty Admin" : "Admin")}
            </p>
            <p className={`text-[10px] uppercase tracking-[0.12em] ${viewOnly ? "text-sky-400" : "text-primary-soft"}`}>
              {viewOnly ? "Faculty (View Only)" : "Administrator"}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-surface hover:text-red-400"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#111111] lg:flex">
        {sidebar}
      </aside>

      {/* ── Mobile sidebar overlay ───────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-white/[0.06] bg-[#111111]">
            {sidebar}
          </aside>
        </div>
      )}

      {/* ── Main content area ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#111111] px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] text-muted transition-colors hover:text-foreground lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>

          <div className="flex-1 flex items-center">
            <div className="hidden sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                {viewOnly ? "Faculty Oversight" : "Admin Console"}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {viewOnly ? "Read-Only Dashboard" : "Command Center"}
              </p>
            </div>
          </div>

          {/* Quick sign-out on desktop header */}
          <button
            onClick={handleSignOut}
            className="hidden items-center gap-1.5 text-[11px] font-medium text-muted transition-colors hover:text-red-400 lg:flex"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet context={{ viewOnly, basePath }} />
        </main>
      </div>
    </div>
  );
}
