import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

/**
 * PublicLayout wraps all public-facing pages with the shared Navbar and Footer.
 * Admin routes use AdminLayout instead and must never render this component.
 */
export function PublicLayout() {
  return (
    <>
      <Navbar />
      <main id="main" className="min-h-screen">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
