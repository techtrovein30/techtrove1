import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PublicLayout } from "./components/layout/PublicLayout";
import { AdminRoute } from "./components/admin/AdminRoute";
import { getDaysAsync } from "./lib/eventStore";

// Public pages
import { HomePage } from "./pages/HomePage";

import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { SchedulePage } from "./pages/SchedulePage";
import { RulesPage } from "./pages/RulesPage";

import { ContactPage } from "./pages/ContactPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RegisterSuccessPage } from "./pages/RegisterSuccessPage";
import { ProfilePage } from "./pages/ProfilePage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Admin pages (P03: split off the admin bundle)
const AdminLoginPage = lazy(() =>
  import("./pages/admin/AdminLoginPage").then((m) => ({ default: m.AdminLoginPage }))
);
const AdminLayout = lazy(() =>
  import("./pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout }))
);
const AdminDashboardPage = lazy(() =>
  import("./pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage }))
);
const AdminStudentsPage = lazy(() =>
  import("./pages/admin/AdminStudentsPage").then((m) => ({ default: m.AdminStudentsPage }))
);
const AdminRegistrationsPage = lazy(() =>
  import("./pages/admin/AdminRegistrationsPage").then((m) => ({ default: m.AdminRegistrationsPage }))
);
const AdminTeamsPage = lazy(() =>
  import("./pages/admin/AdminTeamsPage").then((m) => ({ default: m.AdminTeamsPage }))
);
const AdminPaymentsPage = lazy(() =>
  import("./pages/admin/AdminPaymentsPage").then((m) => ({ default: m.AdminPaymentsPage }))
);
const AdminEventsPage = lazy(() =>
  import("./pages/admin/AdminEventsPage").then((m) => ({ default: m.AdminEventsPage }))
);
const AdminSettingsPage = lazy(() =>
  import("./pages/admin/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage }))
);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function useWarmEventCache() {
  useEffect(() => {
    // Pre-fetch events from Supabase into memory on app start.
    // This makes the first page render faster since the cache is already warm.
    getDaysAsync().catch(() => {});
  }, []);
}

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default function App() {
  useWarmEventCache();
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
            <Routes>
          {/* ── Admin Area ─────────────────────── */}
          <Route path="/wch1925">
            <Route index element={<AdminLoginPage />} />
            
            <Route element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }>
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="students" element={<AdminStudentsPage />} />
              <Route path="registrations" element={<AdminRegistrationsPage />} />
              <Route path="teams" element={<AdminTeamsPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              <Route path="events" element={<AdminEventsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="*" element={<Navigate to="/wch1925/dashboard" replace />} />
            </Route>
          </Route>

          {/* ── Public website (with Navbar + Footer) ──────────────── */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />

            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId" element={<EventDetailPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/rules" element={<RulesPage />} />

            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register/success" element={<RegisterSuccessPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
          </Suspense>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
