import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  ClipboardList,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminSignOut } from "../../lib/adminApi";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/wch1925/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/wch1925/students", label: "Students", icon: Users },
  { to: "/wch1925/registrations", label: "Registrations", icon: ClipboardList },
  { to: "/wch1925/teams", label: "Teams", icon: UsersRound },
  { to: "/wch1925/payments", label: "Payments", icon: CreditCard },
  { to: "/wch1925/events", label: "Events", icon: CalendarDays },
  { to: "/wch1925/settings", label: "Settings", icon: Settings },
];

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
          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
          isActive
            ? "bg-primary/15 text-primary-soft shadow-[inset_0_0_0_1px_rgba(124,58,237,0.25)]"
            : "text-muted hover:bg-surface hover:text-foreground"
        )
      }
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          "group-[.active]:text-primary-soft"
        )}
        aria-hidden
      />
      {label}
    </NavLink>
  );
}

export function AdminLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleSignOut() {
    adminSignOut();
    window.location.replace("/wch1925");
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <div className="flex h-7 w-7 items-center justify-center bg-primary/20">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-soft" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            TechTrove 3.0
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
            Admin Panel
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Admin navigation"
        className="flex-1 overflow-y-auto p-3 space-y-0.5"
      >
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            onClick={() => setSidebarOpen(false)}
          />
        ))}
      </nav>

      {/* Admin user + sign-out */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-primary/20 text-[10px] font-bold uppercase text-primary-soft">
            {(user?.fullName ?? "A")
              .trim()
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-foreground">
              {user?.fullName ?? "Admin"}
            </p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-primary-soft">
              Administrator
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

          <div className="flex-1" />

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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
