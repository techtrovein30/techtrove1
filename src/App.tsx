import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PublicLayout } from "./components/layout/PublicLayout";
import { AdminRoute } from "./components/admin/AdminRoute";
import { ToastProvider } from "./components/ui/Toast";
import { getDaysAsync } from "./lib/eventStore";

// Public pages
import { HomePage } from "./pages/HomePage";

import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { SchedulePage } from "./pages/SchedulePage";
import { RulesPage } from "./pages/RulesPage";

import { ContactPage } from "./pages/ContactPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Auth-heavy pages (login/register/profile) are code-split so the main chunk
// stays lean and first paint happens before their heavier bundles arrive.
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage }))
);
const RegisterSuccessPage = lazy(() =>
  import("./pages/RegisterSuccessPage").then((m) => ({ default: m.RegisterSuccessPage }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);

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
const AdminRevenuePage = lazy(() =>
  import("./pages/admin/AdminRevenuePage").then((m) => ({ default: m.AdminRevenuePage }))
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
const AdminCheckinPage = lazy(() =>
  import("./pages/admin/AdminCheckinPage").then((m) => ({ default: m.AdminCheckinPage }))
);
const AdminReuploadPage = lazy(() =>
  import("./pages/admin/AdminReuploadPage").then((m) => ({ default: m.AdminReuploadPage }))
);
const AdminHistoryPage = lazy(() =>
  import("./pages/admin/AdminHistoryPage").then((m) => ({ default: m.AdminHistoryPage }))
);
const AdminEmailQueuePage = lazy(() =>
  import("./pages/admin/AdminEmailQueuePage").then((m) => ({ default: m.AdminEmailQueuePage }))
);
const AdminCoordinatorsPage = lazy(() =>
  import("./pages/admin/AdminCoordinatorsPage").then((m) => ({ default: m.AdminCoordinatorsPage }))
);
const CoordinatorDashboardPage = lazy(() =>
  import("./pages/CoordinatorDashboardPage").then((m) => ({ default: m.CoordinatorDashboardPage }))
);
const AttendancePage = lazy(() =>
  import("./pages/AttendancePage").then((m) => ({ default: m.AttendancePage }))
);
const CoordinatorRoute = lazy(() =>
  import("./components/coordinator/CoordinatorRoute").then((m) => ({ default: m.CoordinatorRoute }))
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
          <ToastProvider>
            <ScrollToTop />
            <Suspense fallback={<PageLoader />}>
              <Routes>
          {/* ── Admin Area ─────────────────────── */}
          <Route path="/wasd4381">
            <Route index element={<AdminLoginPage />} />
            
            <Route element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }>
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="revenue" element={<AdminRevenuePage />} />
              <Route path="coordinators" element={<AdminCoordinatorsPage />} />
              <Route path="students" element={<AdminStudentsPage />} />
              <Route path="registrations" element={<AdminRegistrationsPage />} />
              <Route path="teams" element={<AdminTeamsPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              <Route path="reuploads" element={<AdminReuploadPage />} />
              <Route path="history" element={<AdminHistoryPage />} />
              <Route path="emails" element={<AdminEmailQueuePage />} />
              <Route path="events" element={<AdminEventsPage />} />
              <Route path="checkin" element={<AdminCheckinPage />} />

              <Route path="*" element={<Navigate to="/wasd4381/dashboard" replace />} />
            </Route>
          </Route>

          {/* ── Faculty Admin Area (Strictly View-Only) ──────────── */}
          <Route path="/tswc3020">
            <Route index element={<AdminLoginPage facultyMode={true} />} />
            
            <Route element={
              <AdminRoute loginPath="/tswc3020">
                <AdminLayout viewOnly={true} basePath="/tswc3020" />
              </AdminRoute>
            }>
              <Route path="dashboard" element={<AdminDashboardPage viewOnly={true} basePath="/tswc3020" />} />
              <Route path="coordinators" element={<AdminCoordinatorsPage viewOnly={true} />} />
              <Route path="students" element={<AdminStudentsPage viewOnly={true} />} />
              <Route path="registrations" element={<AdminRegistrationsPage viewOnly={true} />} />
              <Route path="teams" element={<AdminTeamsPage viewOnly={true} />} />
              <Route path="events" element={<AdminEventsPage viewOnly={true} />} />

              <Route path="*" element={<Navigate to="/tswc3020/dashboard" replace />} />
            </Route>
          </Route>

          {/* Admin Aliases */}
          <Route path="/admin/revenue" element={<Navigate to="/wasd4381/revenue" replace />} />
          <Route path="/admin/coordinators" element={<Navigate to="/wasd4381/coordinators" replace />} />
          <Route path="/admin" element={<Navigate to="/wasd4381/dashboard" replace />} />

          {/* Coordinator Portal (Strict role & event assignment check) */}
          <Route
            path="/coordinator"
            element={
              <CoordinatorRoute>
                <CoordinatorDashboardPage />
              </CoordinatorRoute>
            }
          />

          {/* ── Public website (with Navbar + Footer) ──────────────── */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />

            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId" element={<EventDetailPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/rules" element={<RulesPage />} />

            {/* Attendance Scanner (Student side) */}
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/attendance/scan" element={<AttendancePage />} />
            <Route path="/attendance/:token" element={<AttendancePage />} />

            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register/success" element={<RegisterSuccessPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
          </Suspense>
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
