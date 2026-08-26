import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PublicLayout } from "./components/layout/PublicLayout";
import { AdminRoute } from "./components/admin/AdminRoute";

// Public pages
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { SchedulePage } from "./pages/SchedulePage";
import { RulesPage } from "./pages/RulesPage";
import { SponsorsPage } from "./pages/SponsorsPage";
import { ContactPage } from "./pages/ContactPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RegisterSuccessPage } from "./pages/RegisterSuccessPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Admin pages
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminStudentsPage } from "./pages/admin/AdminStudentsPage";
import { AdminRegistrationsPage } from "./pages/admin/AdminRegistrationsPage";
import { AdminTeamsPage } from "./pages/admin/AdminTeamsPage";
import { AdminPaymentsPage } from "./pages/admin/AdminPaymentsPage";
import { AdminEventsPage } from "./pages/admin/AdminEventsPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          {/* ── Admin Area ─────────────────────── */}
          <Route path="/wch1925">
            <Route index element={<Navigate to="/wch1925/dashboard" replace />} />
            
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
            <Route path="/about" element={<AboutPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId" element={<EventDetailPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/sponsors" element={<SponsorsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register/success" element={<RegisterSuccessPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
