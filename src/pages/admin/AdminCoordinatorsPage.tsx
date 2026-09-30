import { useEffect, useState, useMemo } from "react";
import {
  UserCheck,
  Search,
  UserX,
  Eye,
  RefreshCw,
  Users,
  Phone,
  Mail,
  Loader2,
} from "lucide-react";
import {
  adminGetCoordinatorSummaries,
  adminRemoveCoordinator,
  type CoordinatorEventSummary,
} from "../../lib/coordinatorApi";
import type { TechEvent } from "../../data/techtrove";
import { EventCoordinatorModal } from "../../components/admin/EventCoordinatorModal";
import { EventParticipantsModal } from "../../components/admin/EventParticipantsModal";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { useToast } from "../../components/ui/toastContext";

export function AdminCoordinatorsPage() {
  const toast = useToast();
  const [summaries, setSummaries] = useState<CoordinatorEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals state
  const [assignEvent, setAssignEvent] = useState<TechEvent | null>(null);
  const [inspectEvent, setInspectEvent] = useState<CoordinatorEventSummary | null>(null);
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);
  const [removingEventName, setRemovingEventName] = useState<string>("");
  const [removingBusy, setRemovingBusy] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await adminGetCoordinatorSummaries();
      setSummaries(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load coordinators data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSummaries = useMemo(() => {
    return summaries.filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch =
        item.event.name.toLowerCase().includes(q) ||
        item.event.id.toLowerCase().includes(q) ||
        (item.coordinator?.name.toLowerCase().includes(q) ?? false) ||
        (item.coordinator?.email.toLowerCase().includes(q) ?? false) ||
        (item.coordinator?.mobile.includes(q) ?? false);

      if (!matchesSearch) return false;
      if (dayFilter !== "all" && item.event.dayId !== dayFilter) return false;
      if (statusFilter === "assigned" && !item.coordinator) return false;
      if (statusFilter === "unassigned" && item.coordinator) return false;
      if (statusFilter === "active" && item.status !== "Active") return false;
      return true;
    });
  }, [summaries, search, dayFilter, statusFilter]);

  // Aggregate stats
  const totalEvents = summaries.length;
  const assignedEvents = summaries.filter((s) => s.coordinator !== null).length;
  const unassignedEvents = totalEvents - assignedEvents;
  const totalParticipantsAcross = summaries.reduce((acc, s) => acc + s.totalParticipants, 0);
  const totalAttendedAcross = summaries.reduce((acc, s) => acc + s.attendedCount, 0);
  const overallPercentage = totalParticipantsAcross > 0
    ? Math.round((totalAttendedAcross / totalParticipantsAcross) * 100)
    : 0;

  async function handleConfirmRemove() {
    if (!removingEventId) return;
    setRemovingBusy(true);
    try {
      await adminRemoveCoordinator(removingEventId);
      toast.success(`Coordinator removed from ${removingEventName}`);
      setRemovingEventId(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove coordinator.");
    } finally {
      setRemovingBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary-soft">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Event Coordinators
              </h1>
              <p className="text-xs text-muted">
                Manage single-coordinator assignments, monitor live event attendance & permissions
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#161616] px-3.5 py-2 text-xs font-semibold text-muted hover:bg-white/[0.05] hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary-soft" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Total Events</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalEvents}</p>
          <p className="text-[11px] text-muted/80 mt-1">Across all festival days</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">Assigned Coordinators</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{assignedEvents}</p>
          <p className="text-[11px] text-muted/80 mt-1">{unassignedEvents} unassigned</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-soft">Total Checked-In</p>
          <p className="mt-1 text-2xl font-bold text-primary-soft">{totalAttendedAcross}</p>
          <p className="text-[11px] text-muted/80 mt-1">of {totalParticipantsAcross} participants</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Attendance Rate</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{overallPercentage}%</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-soft transition-all duration-500"
              style={{ width: `${overallPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#141414] p-3.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search events, coordinators, emails, phones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#181818] pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-primary-soft focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={dayFilter}
            onChange={(e) => setDayFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#181818] px-3 py-2 text-xs text-foreground focus:border-primary-soft focus:outline-none"
          >
            <option value="all">All Days</option>
            <option value="day-1">Day 1 (Sports)</option>
            <option value="day-2">Day 2 (Tech & Non-Tech)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#181818] px-3 py-2 text-xs text-foreground focus:border-primary-soft focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="active">Active (Scans Recorded)</option>
          </select>
        </div>
      </div>

      {/* Coordinator Table */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#121212] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
            <p className="mt-3 text-sm">Loading event coordinators & attendance data...</p>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="py-20 text-center text-muted">
            <UserX className="h-10 w-10 mx-auto opacity-30 mb-2" />
            <p className="text-base font-semibold text-foreground">No matching events or coordinators</p>
            <p className="text-xs text-muted mt-1">Try resetting search filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-[#161616] text-[11px] uppercase tracking-wider text-muted font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Event</th>
                  <th className="py-3.5 px-4">Assigned Coordinator</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4 text-center">Participants</th>
                  <th className="py-3.5 px-4">Attendance</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredSummaries.map((summary) => {
                  const { event, coordinator, totalParticipants, attendedCount, attendancePercentage, status } = summary;

                  return (
                    <tr key={event.id} className="hover:bg-white/[0.02] transition-colors group">
                      {/* Event Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0 rounded-md bg-white/[0.05] border border-white/10 px-2 py-0.5 text-[10px] font-mono text-muted uppercase">
                            {event.dayId}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate max-w-[200px]">
                              {event.name}
                            </p>
                            <p className="text-[10px] text-muted truncate">
                              {event.category ?? "General"} {event.venue ? `· ${event.venue}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Coordinator Column */}
                      <td className="py-3.5 px-4">
                        {coordinator ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary-soft font-bold text-xs uppercase">
                              {coordinator.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate max-w-[170px]">
                                {coordinator.name}
                              </p>
                              <p className="text-[10px] font-mono text-muted truncate">
                                ID: {coordinator.userId.slice(0, 14)}...
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Contact Column */}
                      <td className="py-3.5 px-4">
                        {coordinator ? (
                          <div className="space-y-0.5 font-mono text-[11px] text-muted">
                            <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                              <Mail className="h-3 w-3 shrink-0 text-muted/70" />
                              <span className="truncate">{coordinator.email}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 shrink-0 text-muted/70" />
                              <span>{coordinator.mobile}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted/50">—</span>
                        )}
                      </td>

                      {/* Participants Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <Users className="h-3.5 w-3.5 text-muted" />
                          {totalParticipants}
                        </span>
                      </td>

                      {/* Attendance Count & Percentage */}
                      <td className="py-3.5 px-4">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-semibold text-foreground">
                              {attendedCount} / {totalParticipants}
                            </span>
                            <span className="font-mono text-primary-soft font-semibold">
                              {attendancePercentage}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-primary-soft transition-all duration-300"
                              style={{ width: `${Math.min(100, attendancePercentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Coordinator Status */}
                      <td className="py-3.5 px-4">
                        {status === "Active" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        ) : status === "Pending" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-sky-400">
                            Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-[10px] font-medium text-muted">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Attendance & Participants */}
                          <button
                            type="button"
                            title="View participants and attendance"
                            onClick={() => setInspectEvent(summary)}
                            className="rounded-lg p-1.5 text-muted hover:bg-white/[0.08] hover:text-foreground transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Assign / Change Coordinator */}
                          <button
                            type="button"
                            onClick={() => setAssignEvent(event)}
                            className="rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary-soft hover:bg-primary/20 transition-colors"
                          >
                            {coordinator ? "Change" : "Assign"}
                          </button>

                          {/* Remove Coordinator */}
                          {coordinator && (
                            <button
                              type="button"
                              title="Remove coordinator"
                              onClick={() => {
                                setRemovingEventId(event.id);
                                setRemovingEventName(event.name);
                              }}
                              className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              <UserX className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {assignEvent && (
        <EventCoordinatorModal
          event={assignEvent}
          currentCoordinator={
            summaries.find((s) => s.event.id === assignEvent.id)?.coordinator ?? null
          }
          onClose={() => setAssignEvent(null)}
          onSaved={() => {
            setAssignEvent(null);
            loadData();
          }}
        />
      )}

      {/* Participants & Attendance Inspection Modal */}
      {inspectEvent && (
        <EventParticipantsModal
          event={inspectEvent.event}
          coordinator={inspectEvent.coordinator}
          onClose={() => setInspectEvent(null)}
        />
      )}

      {/* Confirm Removal Dialog */}
      {removingEventId && (
        <ConfirmDialog
          title="Remove Coordinator"
          description={`Are you sure you want to remove the coordinator from "${removingEventName}"? They will lose access to the coordinator dashboard for this event.`}
          confirmLabel={removingBusy ? "Removing..." : "Remove Coordinator"}
          onConfirm={handleConfirmRemove}
          onCancel={() => setRemovingEventId(null)}
        />
      )}
    </div>
  );
}
