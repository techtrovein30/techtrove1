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

export function Navbar() {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-edge bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />

          <nav aria-label="Main navigation" className="hidden items-center gap-6 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
                    isActive ? "text-primary-soft" : "text-muted hover:text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {user ? (
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out
              </button>
            ) : (
              <Link
                to="/login"
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-foreground"
              >
                Login
              </Link>
            )}
            <Link
              to="/register"
              className="clip-angle bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
            >
              Register Now
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center border border-edge text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background lg:hidden" role="dialog" aria-modal="true">
          <div className="flex h-16 items-center justify-between border-b border-edge px-4 sm:px-6">
            <Brand />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center border border-edge text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-6 py-8">
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "display block py-2.5 text-4xl transition-colors",
                        isActive ? "text-primary-soft" : "text-foreground hover:text-primary-soft",
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-edge p-6 pb-8">
            <div className="grid grid-cols-2 gap-3">
              {user ? (
                <button
                  onClick={() => {
                    signOut();
                    setOpen(false);
                  }}
                  className="col-span-2 inline-flex items-center justify-center gap-2 border border-edge-strong py-3.5 text-xs font-semibold uppercase tracking-[0.18em]"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out ({user.fullName})
                </button>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center border border-edge-strong py-3.5 text-xs font-semibold uppercase tracking-[0.18em]"
                >
                  Login
                </Link>
              )}
              <Link
                to="/register"
                className="clip-angle inline-flex items-center justify-center bg-primary py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white"
              >
                Register Now
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
