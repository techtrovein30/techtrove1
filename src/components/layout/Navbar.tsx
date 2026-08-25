import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { Brand } from "../site/Brand";

const links = [
  { to: "/", label: "Home" },
  { to: "/events", label: "Events" },
  { to: "/schedule", label: "Schedule" },
  { to: "/rules", label: "Rules" },
  { to: "/sponsors", label: "Sponsors" },
  { to: "/about", label: "About" },
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

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

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
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "border-b border-edge bg-background/80 shadow-[0_10px_40px_-20px_rgba(124,58,237,0.45)] backdrop-blur-xl"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />

          <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
                    isActive ? "text-primary-soft" : "text-muted hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-0 -bottom-px h-px origin-left bg-gradient-to-r from-primary to-primary-soft transition-transform duration-300",
                        isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
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
                <span className="inline-flex items-center gap-2 border border-edge bg-surface/60 px-3 py-1.5 backdrop-blur-sm">
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center bg-primary/20 text-[9px] font-bold tracking-wide text-primary-soft"
                  >
                    {initialsOf(user.fullName)}
                  </span>
                  <span className="max-w-[9rem] truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                    {user.username}
                  </span>
                </span>
                <button
                  onClick={signOut}
                  aria-label={`Sign out ${user.fullName}`}
                  className="flex h-9 w-9 items-center justify-center border border-edge text-muted transition-colors hover:border-primary hover:text-primary-soft"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="group relative px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-foreground"
              >
                Login
                <span
                  aria-hidden
                  className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-gradient-to-r from-primary to-primary-soft transition-transform duration-300 group-hover:scale-x-100"
                />
              </Link>
            )}
            <Link
              to="/register"
              className="clip-angle relative overflow-hidden bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_16px_rgba(124,58,237,0.35)] transition-all hover:bg-primary-soft hover:shadow-[0_0_28px_rgba(124,58,237,0.65)]"
            >
              Register Now
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center border border-edge bg-surface/60 text-foreground backdrop-blur-sm transition-colors hover:border-primary hover:text-primary-soft lg:hidden"
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

      {open && (
        <div
          className="nav-overlay diag-stripes fixed inset-0 z-[60] flex flex-col bg-background lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <img
            src="/images/techtrove-logo.webp"
            alt=""
            loading="lazy"
            className="pointer-events-none absolute -right-12 top-24 h-80 w-auto opacity-[0.05]"
          />
          <div className="relative flex h-16 items-center justify-between border-b border-edge px-4 sm:px-6">
            <Brand />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center border border-edge bg-surface/60 text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobile navigation" className="stagger-nav relative flex-1 overflow-y-auto px-6 py-8">
            <ul className="space-y-1.5">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "display flex items-baseline gap-4 py-1.5 text-4xl transition-colors sm:text-5xl",
                        isActive ? "text-primary-soft" : "text-foreground hover:text-primary-soft",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="relative">
                          {link.label}
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute -bottom-1 left-0 h-0.5 w-full bg-gradient-to-r from-primary to-transparent"
                            />
                          )}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="relative space-y-3 border-t border-edge p-6 pb-8">
            {user ? (
              <button
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
                className="inline-flex w-full items-center justify-center gap-2 border border-edge-strong py-3.5 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out ({user.fullName})
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="inline-flex w-full items-center justify-center border border-edge-strong py-3.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors hover:border-primary hover:text-primary-soft"
              >
                Login
              </Link>
            )}
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="clip-angle inline-flex w-full items-center justify-center bg-primary py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_20px_rgba(124,58,237,0.4)]"
            >
              Register Now
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
