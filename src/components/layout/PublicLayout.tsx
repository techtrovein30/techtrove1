import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { SocialFloater } from "./SocialFloater";

/**
 * PublicLayout wraps all public-facing pages with the shared Navbar and Footer.
 * Admin routes use AdminLayout instead and must never render this component.
 */
export function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <>
      <Navbar />
      <main id="main" className="min-h-screen">
        {/* Keyed on route so navigating between pages animates the view. */}
        <div key={pathname} className="page-in">
          <Outlet />
        </div>
      </main>
      <Footer />
      <SocialFloater />
    </>
  );
}
