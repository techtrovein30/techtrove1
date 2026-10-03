import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  QrCode,
  Users,
  CheckCircle2,
  UserX,
  Search,
  Maximize2,
  Minimize2,
  X,
  Clock,
  Sparkles,
  Calendar,
  MapPin,
  Loader2,
  ShieldAlert,
  ArrowUpDown,
} from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "../context/AuthContext";
import {
  getAssignedCoordinatorEvent,
  getEventParticipants,
  ensureEventAttendanceToken,
  subscribeToAttendanceUpdates,
  checkCoordinatorTablesReady,
  isMissingTableError,
  type EventCoordinator,
  type CoordinatorParticipant,
} from "../lib/coordinatorApi";
import { buildEventQrPayload } from "../lib/qrToken";
import type { TechEvent } from "../data/techtrove";
import { useToast } from "../components/ui/toastContext";

export function CoordinatorDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [coordinator, setCoordinator] = useState<EventCoordinator | null>(null);
  const [event, setEvent] = useState<TechEvent | null>(null);
  const [participants, setParticipants] = useState<CoordinatorParticipant[]>([]);
  const [attendanceToken, setAttendanceToken] = useState<string>("");

  // Filters and sorting
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");
  const [sortField, setSortField] = useState<"name" | "time" | "reg">("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Presentation / Start Attendance Modal
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check coordinator assignment
  const checkAssignment = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const readyCheck = await checkCoordinatorTablesReady();
      setMigrationRequired(!readyCheck.ready);

      const res = await getAssignedCoordinatorEvent(user);
      if (res) {
        setCoordinator(res.coordinator);
        setEvent(res.event);
        const token = await ensureEventAttendanceToken(res.event.id);
        setAttendanceToken(token);

        const parts = await getEventParticipants(res.event.id);
        setParticipants(parts);
      } else {
        setCoordinator(null);
        setEvent(null);
      }
    } catch (err) {
      if (!isMissingTableError(err)) {
        toast.error(err instanceof Error ? err.message : "Error loading coordinator dashboard.");
      }
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  // Auth & role check, then load the assignment.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/login?next=/coordinator", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const readyCheck = await checkCoordinatorTablesReady();
        if (cancelled) return;
        setMigrationRequired(!readyCheck.ready);

        const res = await getAssignedCoordinatorEvent(user);
        if (cancelled) return;

        if (!res) {
          setCoordinator(null);
          setEvent(null);
          return;
        }

        setCoordinator(res.coordinator);
        setEvent(res.event);
        setAttendanceToken(await ensureEventAttendanceToken(res.event.id));
        if (cancelled) return;
        setParticipants(await getEventParticipants(res.event.id));
      } catch (err) {
        if (cancelled) return;
        if (!isMissingTableError(err)) {
          toast.error(err instanceof Error ? err.message : "Error loading coordinator dashboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate, toast]);

  // Realtime updates subscription
  useEffect(() => {
    if (!event) return;
    const eventId = event.id;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribeToAttendanceUpdates(eventId, async () => {
      // Coalesce burst scans with a 200ms debounce
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const parts = await getEventParticipants(eventId);
        setParticipants(parts);
      }, 200);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [event]);

  // Generate QR code for presentation mode
  useEffect(() => {
    if (!presentationOpen || !attendanceToken) return;

    // The QR is a deep link so a student's phone camera opens the app directly,
    // and the token rides along self-describing as `TTE1:<token>`. Prefixing it
    // matters: the printed page is photographed, screenshotted and retyped, and an
    // unprefixed 32-hex string is indistinguishable from a participant's own
    // personal `TTQ1` pass. With the prefix the scanner takes the event branch
    // explicitly instead of recovering the token from wherever it sits in the URL.
    const payload = buildEventQrPayload(attendanceToken);
    if (!payload) {
      console.error("Refusing to render an event QR for a malformed token");
      return;
    }

    const attendanceUrl = `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`;
    QRCode.toDataURL(attendanceUrl, {
      width: 480,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error("QR generation failed", err));
  }, [presentationOpen, attendanceToken]);

  // Participant counts & stats
  const total = participants.length;
  const attendedCount = participants.filter((p) => p.attended).length;
  const absentCount = total - attendedCount;
  const percentage = total > 0 ? Math.round((attendedCount / total) * 100) : 0;

  // Recent attendance list (last 5 scans)
  const recentAttendance = useMemo(() => {
    return participants
      .filter((p) => p.attended && p.attendedAt)
      .sort((a, b) => new Date(b.attendedAt!).getTime() - new Date(a.attendedAt!).getTime())
      .slice(0, 6);
  }, [participants]);

  // Filtered & sorted participants
  const filteredParticipants = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = participants.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.mobile.includes(q) ||
        p.registrationCode.toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (filter === "present") return p.attended;
      if (filter === "absent") return !p.attended;
      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "reg") {
        comparison = a.registrationCode.localeCompare(b.registrationCode);
      } else if (sortField === "time") {
        const timeA = a.attendedAt ? new Date(a.attendedAt).getTime() : 0;
        const timeB = b.attendedAt ? new Date(b.attendedAt).getTime() : 0;
        comparison = timeA - timeB;
      }
      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [participants, search, filter, sortField, sortAsc]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
        <p className="text-xs uppercase tracking-widest text-muted">
          Loading Coordinator Command Center...
        </p>
      </div>
    );
  }

  // If user is authenticated but not assigned as coordinator for an event
  if (!coordinator || !event) {
    if (migrationRequired) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="display mt-6 text-2xl text-foreground sm:text-3xl">
            Database Setup Required
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The coordinator and attendance tables have not been created in Supabase yet.
          </p>
          <div className="mt-6 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#141414] p-5 text-left text-xs text-muted space-y-2">
            <p className="font-semibold text-foreground">To initialize the Coordinator system:</p>
            <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
              <li>
                Open your Supabase Project Dashboard → <strong>SQL Editor</strong>
              </li>
              <li>
                Paste and run the contents of{" "}
                <code className="text-primary-soft">query_coordinator_attendance.sql</code>
              </li>
              <li>
                Click <strong>Check Again</strong> below
              </li>
            </ol>
          </div>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              to="/profile"
              className="rounded-lg bg-surface border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-white/[0.05]"
            >
              Back to Profile
            </Link>
            <button
              onClick={() => checkAssignment()}
              className="rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-primary-soft"
            >
              Check Again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="display mt-6 text-2xl text-foreground sm:text-3xl">
          Coordinator Access Restricted
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          No event has been assigned to this coordinator.
        </p>
        <p className="mt-1 text-xs text-muted/70">
          Please contact the fest administrators to assign you as the main coordinator for your
          event.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            to="/profile"
            className="rounded-lg bg-surface border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-white/[0.05]"
          >
            Back to Profile
          </Link>
          <button
            onClick={() => checkAssignment()}
            className="rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-primary-soft"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Migration Required Warning Banner */}
      {migrationRequired && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
          <div className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="font-semibold text-sm text-foreground">Database Migration Pending</h3>
              <p className="text-xs text-muted leading-relaxed">
                The{" "}
                <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-amber-300 border border-amber-500/20">
                  event_coordinators
                </code>{" "}
                and{" "}
                <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-amber-300 border border-amber-500/20">
                  attendance
                </code>{" "}
                tables are not yet initialized in Supabase. Please ask an administrator to run{" "}
                <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-primary-soft border border-white/10">
                  query_coordinator_attendance.sql
                </code>{" "}
                in the Supabase SQL Editor.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Event Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#161616] via-[#121212] to-[#0d0d0d] p-6 sm:p-8 shadow-2xl">
        <div className="absolute right-0 top-0 -z-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-primary/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-soft border border-primary/30">
                {event.dayId.toUpperCase()}
              </span>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
                Assigned Event
              </span>
              <span className="text-xs text-muted">
                Coordinator: <strong className="text-white">{coordinator.name}</strong>
              </span>
            </div>

            <h1 className="display text-3xl text-foreground sm:text-4xl lg:text-5xl">
              {event.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
              {event.time && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary-soft" />
                  {event.time} {event.duration ? `(${event.duration})` : ""}
                </span>
              )}
              {event.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary-soft" />
                  {event.venue}
                </span>
              )}
              {event.category && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-primary-soft" />
                  {event.category}
                </span>
              )}
            </div>
          </div>

          {/* Big Start Attendance Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => setPresentationOpen(true)}
              className="group relative flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-primary via-primary-soft to-primary bg-[length:200%_auto] px-8 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-xl shadow-primary/30 transition-all hover:bg-[position:right_center] hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98]"
            >
              <QrCode className="h-6 w-6 transition-transform group-hover:rotate-6" />
              <span>Start Attendance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#141414] p-5 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Total Registered
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-extrabold text-foreground">{total}</p>
            <Users className="h-5 w-5 text-muted/60" />
          </div>
          <p className="mt-2 text-xs text-muted/70">Participants in roster</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Total Attended
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-extrabold text-emerald-400">{attendedCount}</p>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="mt-2 text-xs text-emerald-300/70">Marked present</p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            Total Absent
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-extrabold text-amber-400">{absentCount}</p>
            <UserX className="h-5 w-5 text-amber-400" />
          </div>
          <p className="mt-2 text-xs text-amber-300/70">Yet to mark</p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-soft">
            Attendance Rate
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-extrabold text-primary-soft">{percentage}%</p>
            <Sparkles className="h-5 w-5 text-primary-soft" />
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-soft transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Live Recent Attendance Ticker */}
      {recentAttendance.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#141414] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              Live Recent Attendance
            </h3>
            <span className="text-[11px] text-muted">Auto-updates in real-time</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {recentAttendance.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-muted font-mono truncate">{p.registrationCode}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Present
                  </span>
                  <p className="text-[9px] text-muted font-mono mt-0.5">
                    {p.attendedAt
                      ? new Date(p.attendedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participant List Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Participant Roster</h2>
            <p className="text-xs text-muted">
              Displaying all registered attendees for {event.name}
            </p>
          </div>

          {/* Controls: Search, Filter, Sort */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                type="text"
                placeholder="Search name, email, reg ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#161616] pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-primary-soft focus:outline-none"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center rounded-xl border border-white/10 bg-[#161616] p-1 text-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-3 py-1 font-medium transition-colors ${
                  filter === "all" ? "bg-primary text-white" : "text-muted hover:text-foreground"
                }`}
              >
                All ({total})
              </button>
              <button
                type="button"
                onClick={() => setFilter("present")}
                className={`rounded-lg px-3 py-1 font-medium transition-colors ${
                  filter === "present"
                    ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Present ({attendedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter("absent")}
                className={`rounded-lg px-3 py-1 font-medium transition-colors ${
                  filter === "absent"
                    ? "bg-amber-500/20 text-amber-400 font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Absent ({absentCount})
              </button>
            </div>

            {/* Sort Toggle */}
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              title="Toggle sort direction"
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#161616] px-3 py-2 text-xs text-muted hover:text-foreground"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{sortAsc ? "Asc" : "Desc"}</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/10 bg-[#121212] overflow-hidden shadow-xl">
          {filteredParticipants.length === 0 ? (
            <div className="py-20 text-center text-muted">
              <Users className="h-8 w-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-semibold text-foreground">No participants found</p>
              <p className="text-xs text-muted/70 mt-1">Try clearing filters or search queries</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 bg-[#161616] text-[11px] uppercase tracking-wider text-muted font-semibold">
                  <tr>
                    <th className="py-3.5 px-4 cursor-pointer" onClick={() => setSortField("name")}>
                      Name {sortField === "name" && (sortAsc ? "↑" : "↓")}
                    </th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4">Mobile</th>
                    <th className="py-3.5 px-4 cursor-pointer" onClick={() => setSortField("reg")}>
                      Registration ID {sortField === "reg" && (sortAsc ? "↑" : "↓")}
                    </th>
                    <th className="py-3.5 px-4">Attendance</th>
                    <th className="py-3.5 px-4 cursor-pointer" onClick={() => setSortField("time")}>
                      Time {sortField === "time" && (sortAsc ? "↑" : "↓")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredParticipants.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {p.name}
                        {p.teamName && p.teamName !== "Individual" && (
                          <span className="block text-[10px] font-normal text-muted truncate max-w-[180px]">
                            Team: {p.teamName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted font-mono">{p.email}</td>
                      <td className="py-3.5 px-4 text-muted font-mono">{p.mobile}</td>
                      <td className="py-3.5 px-4 text-muted font-mono">{p.registrationCode}</td>
                      <td className="py-3.5 px-4">
                        {p.attended ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/20">
                            <UserX className="h-3.5 w-3.5" />
                            Absent
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted font-mono text-[11px]">
                        {p.attendedAt
                          ? new Date(p.attendedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── START ATTENDANCE / PRESENTATION MODE MODAL ─── */}
      {presentationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl border border-white/15 bg-[#101010] p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                  Live Attendance Active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title="Fullscreen / Projector Mode"
                  className="rounded-lg p-2 text-muted hover:bg-white/[0.08] hover:text-foreground transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPresentationOpen(false)}
                  className="rounded-lg p-2 text-muted hover:bg-white/[0.08] hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Event Header */}
            <h2 className="display text-3xl sm:text-4xl text-foreground font-bold">{event.name}</h2>
            <p className="text-xs uppercase tracking-widest text-primary-soft font-semibold mt-1">
              Scan to Mark Attendance
            </p>

            {/* Attendance QR in Large Format */}
            <div className="mt-6 rounded-3xl bg-white p-4 sm:p-6 shadow-2xl shadow-primary/20 border-4 border-primary/20">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Attendance QR for ${event.name}`}
                  className="h-64 w-64 sm:h-80 sm:w-80 object-contain"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-black" />
                </div>
              )}
            </div>

            {/* Live Count Display */}
            <div className="mt-6 w-full max-w-md rounded-2xl border border-white/10 bg-[#161616] p-4 flex items-center justify-around">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                  Attendance
                </p>
                <p className="text-2xl font-black text-emerald-400 mt-0.5">
                  {attendedCount}{" "}
                  <span className="text-muted text-base font-normal">/ {total}</span>
                </p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                  Turnout
                </p>
                <p className="text-2xl font-black text-primary-soft mt-0.5">{percentage}%</p>
              </div>
            </div>

            {/* Instruction note */}
            <p className="mt-5 text-xs text-muted/80 max-w-md">
              Participants: Log in on your phone, click{" "}
              <strong className="text-foreground">SCAN QR</strong> on your dashboard, and aim camera
              at this code.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
