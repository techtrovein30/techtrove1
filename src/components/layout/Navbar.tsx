import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Menu, X, User, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { Brand } from "../site/Brand";

const links = [
  { to: "/", label: "Home" },
  { to: "/events", label: "Events" },
  { to: "/schedule", label: "Schedule" },
  { to: "/rules", label: "Rules" },
  { to: "/contact", label: "Contact" },
];

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu whenever the route changes. This resets state during
  // render (React's recommended "adjust state when props change" pattern) so we
  // don't call setState synchronously inside an effect (react-hooks rule).
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setOpen(false);
  }

  // A01: focus trap + Escape-to-close for the modal mobile nav dialog.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialog.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(window.scrollY > 24);
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-primary/10 bg-background/60 shadow-[0_8px_40px_-12px_rgba(124,58,237,0.3)] backdrop-blur-2xl"
            : "border-b border-transparent bg-transparent",
        )}
      >
        {/* Top gradient accent line */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-500",
            scrolled ? "opacity-60" : "opacity-0",
          )}
        />

        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />

          <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-300",
                    isActive
                      ? "text-primary-soft"
                      : "text-muted hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative z-10">{link.label}</span>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-primary via-primary-soft to-primary"
                      />
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-0 -z-0 rounded-sm bg-primary/5 transition-opacity duration-300",
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {user ? (
              <>
                <Link
                  to="/profile"
                  className="group relative flex items-center gap-2.5 rounded-sm border border-edge/60 bg-surface/40 px-3.5 py-2 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:shadow-[0_0_20px_rgba(124,58,237,0.12)]"
                >
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center bg-gradient-to-br from-primary/20 to-primary-soft/10 text-[10px] font-bold tracking-wide text-primary-soft ring-1 ring-primary/20 transition-all duration-300 group-hover:ring-primary/40"
                  >
                    {initialsOf(user.fullName)}
                  </span>
                  <span className="max-w-[9rem] truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                    {user.fullName}
                  </span>
                </Link>
                <button
                  onClick={signOut}
                  aria-label={`Sign out ${user.fullName}`}
                  className="flex h-9 w-9 items-center justify-center rounded-sm border border-edge/60 bg-surface/40 text-muted backdrop-blur-sm transition-all duration-300 hover:border-red-500/40 hover:bg-red-500/5 hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="group relative flex items-center gap-2 rounded-sm border border-edge/60 bg-surface/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                <User className="h-3.5 w-3.5" aria-hidden />
                Login
              </Link>
            )}
            <Link
              to="/register"
              className="clip-angle group relative overflow-hidden bg-gradient-to-r from-primary to-primary-soft px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(124,58,237,0.55)]"
            >
              <span className="relative z-10">Register Now</span>
              <span className="absolute inset-0 bg-gradient-to-r from-primary-soft to-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-sm border border-edge/60 bg-surface/40 text-foreground backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-primary-soft lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Scroll progress beam */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-[2px] origin-left bg-gradient-to-r from-primary via-primary-soft to-transparent transition-opacity duration-300",
            scrolled ? "opacity-100" : "opacity-0",
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </header>

      {/* Mobile overlay */}
      {open && (
        <div
          ref={dialogRef}
          className="nav-overlay fixed inset-0 z-[60] flex flex-col bg-background/98 backdrop-blur-xl lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          tabIndex={-1}
        >
          {/* Decorative background */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">

            <img
              src="/images/techtrove-logo.webp"
              alt=""
              loading="lazy"
              className="absolute -right-12 top-28 h-80 w-auto opacity-[0.03]"
            />
          </div>

          {/* Header */}
          <div className="relative flex h-16 items-center justify-between border-b border-edge/50 px-4 sm:px-6">
            <Brand />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-sm border border-edge/60 bg-surface/40 text-foreground backdrop-blur-sm transition-all duration-300 hover:border-red-500/40 hover:text-red-400"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Nav links */}
          <nav aria-label="Mobile navigation" className="stagger-nav relative flex-1 overflow-y-auto px-6 py-8">
            <ul className="space-y-1">
              {links.map((link, i) => (
                <li
                  key={link.to}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="stagger-nav-item"
                >
                  <NavLink
                    to={link.to}
                    end={link.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center justify-between py-3 text-4xl transition-colors sm:text-5xl",
                        isActive ? "text-primary-soft" : "text-foreground hover:text-primary-soft",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="relative font-display">
                          {link.label}
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute -bottom-1 left-0 h-0.5 w-full bg-gradient-to-r from-primary to-transparent"
                            />
                          )}
                        </span>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 text-muted opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100 group-hover:text-primary-soft"
                          aria-hidden
                        />
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Bottom actions */}
          <div className="relative space-y-3 border-t border-edge/50 p-6 pb-8">
            {user ? (
              <>
                <Link
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="group flex items-center gap-3 border border-edge/60 bg-surface/30 px-5 py-4 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-gradient-to-br from-primary/20 to-primary-soft/10 text-sm font-bold text-primary-soft ring-1 ring-primary/20">
                    {initialsOf(user.fullName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary-soft" />
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    setOpen(false);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 border border-edge/60 bg-surface/30 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur-sm transition-all duration-300 hover:border-red-500/40 hover:bg-red-500/5 hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="inline-flex w-full items-center justify-center border border-edge/60 bg-surface/30 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                Login
              </Link>
            )}
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="clip-angle group relative inline-flex w-full items-center justify-center overflow-hidden bg-gradient-to-r from-primary to-primary-soft py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_20px_rgba(124,58,237,0.3)]"
            >
              <span className="relative z-10">Register Now</span>
              <span className="absolute inset-0 bg-gradient-to-r from-primary-soft to-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
