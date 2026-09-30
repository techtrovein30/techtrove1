import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  ArrowLeft,
  QrCode,
  Loader2,
  XCircle,
  HelpCircle,
  ScanLine,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { markEventAttendance, type MarkAttendanceResult } from "../lib/coordinatorApi";
import { QrScanner } from "../components/qr/QrScanner";
import { useToast } from "../components/ui/toastContext";

export function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { token: routeToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const queryToken = searchParams.get("token");
  const initialToken = routeToken || queryToken;

  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<MarkAttendanceResult | null>(null);
  const processedTokenRef = useRef<string | null>(null);

  // Authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      const returnUrl = window.location.pathname + window.location.search;
      navigate(`/login?next=${encodeURIComponent(returnUrl)}`, { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Handle scanned raw string or token
  const processAttendance = useCallback(
    async (rawCode: string) => {
      if (!user) {
        setResult({
          ok: false,
          reason: "not_logged_in",
          message: "Please login to mark attendance.",
        });
        return;
      }

      setProcessing(true);

      try {
        const res = await markEventAttendance(rawCode, user);
        setResult(res);

        if (res.ok) {
          toast.success(res.eventName ? `Attendance marked for ${res.eventName}` : "Attendance marked successfully");
        } else if (res.reason === "already_attended") {
          toast.info(res.message);
        } else {
          toast.error(res.message);
        }
      } catch (err) {
        setResult({
          ok: false,
          reason: "error",
          message: err instanceof Error ? err.message : "Failed to mark attendance. Please try again.",
        });
      } finally {
        setProcessing(false);
      }
    },
    [user, toast]
  );

  // Auto-process initial token from URL if present (e.g. scanned from native phone camera)
  useEffect(() => {
    if (user && initialToken && processedTokenRef.current !== initialToken) {
      processedTokenRef.current = initialToken;
      processAttendance(initialToken);
    }
  }, [user, initialToken, processAttendance]);

  if (authLoading || (!user && !result)) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
        <p className="text-xs uppercase tracking-widest text-muted">Verifying attendance credentials...</p>
      </div>
    );
  }

  function handleReset() {
    setResult(null);
    setProcessing(false);
    processedTokenRef.current = null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-16 px-4 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Top Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/profile"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <span className="text-[11px] font-mono text-muted/70">
            {user?.fullName}
          </span>
        </div>

        {/* Card Header */}
        <div className="text-center mb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary-soft mb-3 shadow-lg shadow-primary/20">
            <QrCode className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Event Attendance Scanner
          </h1>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Scan the attendance QR code displayed by the event coordinator on the screen or projector.
          </p>
        </div>

        {/* Processing State */}
        {processing && (
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-8 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary-soft mx-auto" />
            <p className="text-sm font-semibold text-foreground">Validating event token...</p>
            <p className="text-xs text-muted">Verifying registration and attendance records</p>
          </div>
        )}

        {/* ─── SCAN RESULTS SCREEN ─── */}
        {!processing && result && (
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-6 sm:p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            {result.ok ? (
              /* Success Screen */
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-emerald-400 sm:text-2xl">
                    Attendance Marked Successfully
                  </h2>
                  {result.eventName && (
                    <p className="text-base font-semibold text-foreground mt-1">
                      {result.eventName}
                    </p>
                  )}
                  {result.markedAt && (
                    <p className="text-xs font-mono text-muted mt-1">
                      Time: {new Date(result.markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs text-emerald-300/90">
                  Your attendance has been verified by the coordinator. You are cleared for this event!
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-primary-soft transition-colors"
                  >
                    Scan Another Event
                  </button>
                  <Link
                    to="/profile"
                    className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-white/[0.08] transition-colors"
                  >
                    View My Attendance
                  </Link>
                </div>
              </div>
            ) : result.reason === "already_attended" ? (
              /* Already Attended Screen */
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Clock className="h-10 w-10" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-sky-400 sm:text-2xl">
                    Attendance Already Marked
                  </h2>
                  {result.eventName && (
                    <p className="text-base font-semibold text-foreground mt-1">
                      {result.eventName}
                    </p>
                  )}
                  {result.markedAt && (
                    <p className="text-xs font-mono text-muted mt-1">
                      You marked attendance for this event at{" "}
                      {new Date(result.markedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3 text-xs text-sky-200">
                  Duplicate attendance is blocked. Your existing record remains active and valid.
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 rounded-xl bg-white/[0.08] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-white/[0.12] transition-colors"
                  >
                    Scan Again
                  </button>
                  <Link
                    to="/profile"
                    className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-primary-soft transition-colors"
                  >
                    Back to Dashboard
                  </Link>
                </div>
              </div>
            ) : (
              /* Specific Error Screen (Not Registered, Invalid QR, Expired Event) */
              <div className="space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  <XCircle className="h-10 w-10" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-red-400 sm:text-2xl">
                    {result.reason === "not_registered"
                      ? "Not Registered"
                      : result.reason === "not_paid"
                      ? "Payment Pending"
                      : result.reason === "no_profile"
                      ? "Complete Your Profile"
                      : result.reason === "invalid_qr"
                      ? "Invalid Attendance QR"
                      : result.reason === "event_disabled"
                      ? "Attendance Unavailable"
                      : "Attendance Error"}
                  </h2>
                  <p className="text-xs text-muted mt-2 leading-relaxed">
                    {result.message}
                  </p>
                </div>

                {result.reason === "not_registered" && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs text-amber-300">
                    You can browse events and register your team from the events catalog.
                  </div>
                )}

                {result.reason === "not_paid" && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs text-amber-300">
                    Attendance unlocks once the payment for your registration is verified. This is
                    checked by the server, so it cannot be marked early from here.
                  </div>
                )}

                {result.reason === "no_profile" && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs text-amber-300">
                    We could not match your signed-in email to a registration. Check that you are
                    logged in with the same email you registered with.
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-primary-soft transition-colors"
                  >
                    Try Again
                  </button>
                  <Link
                    to="/profile"
                    className="flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-white/[0.08] transition-colors"
                  >
                    Cancel
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── SCANNER VIEWPORT ─── */}
        {!processing && !result && (
          <div className="rounded-2xl border border-white/10 bg-[#121212] p-4 shadow-xl">
            <QrScanner
              onScan={(raw) => {
                void processAttendance(raw);
              }}
              disabled={processing}
            />

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <ScanLine className="h-3.5 w-3.5 text-primary-soft" />
                Point camera at coordinator QR
              </span>
              <Link to="/profile" className="hover:text-foreground underline">
                Cancel
              </Link>
            </div>
          </div>
        )}

        {/* Instructions Card */}
        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-muted/80 space-y-1.5">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-primary-soft" />
            How Attendance Works
          </p>
          <p>
            1. The main coordinator displays the event attendance QR on their device/projector screen.
          </p>
          <p>
            2. Scan the code while logged into your TechTrove account.
          </p>
          <p>
            3. The system confirms your registration and immediately marks your attendance for the event.
          </p>
        </div>
      </div>
    </div>
  );
}
