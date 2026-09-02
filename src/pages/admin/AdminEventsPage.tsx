import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Calendar,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  getDaysAsync,
  adminToggleRegistration,
  adminUpdateEvent,
  adminAddEvent,
  adminDeleteEvent,
  adminUpdateDay,
} from "../../lib/eventStore";
import type { TechEvent, Day } from "../../lib/eventStore";
import type { Registration } from "../../lib/api";
import { adminListRegistrations } from "../../lib/adminApi";
import { formatPerPerson } from "../../lib/utils";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";

function EventModal({
  dayId,
  event,
  onClose,
  onSaved,
}: {
  dayId: string;
  event?: TechEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(event?.name ?? "");
  const [category, setCategory] = useState(event?.category ?? "Sports");
  const [description, setDescription] = useState(event?.description ?? "");
  const [fee, setFee] = useState(event?.registrationFee ?? 500);
  const [players, setPlayers] = useState(event?.requiredPlayers ?? 7);
  const [subs, setSubs] = useState(event?.maxSubstitutes ?? 3);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      setError("Event name is required.");
      return;
    }

    // M16: reject NaN / out-of-range numerics before persisting.
    const feeNum = Number(fee);
    const playersNum = Number(players);
    const subsNum = Number(subs);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setError("Enter a valid fee.");
      return;
    }
    if (!Number.isFinite(playersNum) || playersNum < 1) {
      setError("Required players must be at least 1.");
      return;
    }
    if (!Number.isFinite(subsNum) || subsNum < 0) {
      setError("Max substitutes must be 0 or more.");
      return;
    }

    setSaving(true);
    try {
      if (event) {
        await adminUpdateEvent(event.id, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          registrationFee: feeNum,
          requiredPlayers: playersNum,
          maxSubstitutes: subsNum,
        });
      } else {
        await adminAddEvent(dayId, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          registrationOpen: true,
          registrationType: "team",
          registrationFee: feeNum,
          requiredPlayers: playersNum,
          maxSubstitutes: subsNum,
          rules: [
            "Team size must match the published player limits.",
            "All players must carry valid college ID cards.",
            "The decision of the organizing committee is final.",
          ],
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#161616] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <h2 className="text-base font-semibold text-foreground">
            {event ? `Edit ${event.name}` : "Add New Event"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              Event Name
            </label>
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                maxLength={50}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
                Fee per person (₹)
              </label>
              <input
                type="number"
                min={0}
                value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
                className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
                Required Players
              </label>
              <input
                type="number"
                min={1}
                value={players}
                onChange={(e) => setPlayers(Number(e.target.value))}
                className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
                Max Substitutes
              </label>
              <input
                type="number"
                min={0}
                value={subs}
                onChange={(e) => setSubs(Number(e.target.value))}
                className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-primary-soft disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Event
          </button>
        </div>
      </div>
    </div>
  );
}

function DayModal({
  day,
  onClose,
  onSaved,
}: {
  day: Day;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(day.name);
  const [description, setDescription] = useState(day.description);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Day name is required.");
      return;
    }
    try {
      await adminUpdateDay(day.id, { name: name.trim(), description: description.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#161616] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <h2 className="text-base font-semibold text-foreground">Edit {day.label}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              Day Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tech Events"
              maxLength={80}
              className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description shown on the public site."
              maxLength={500}
              className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-primary-soft"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminEventsPage() {
  const [days, setDays] = useState<Day[]>([]);
  const [editingEvent, setEditingEvent] = useState<TechEvent | null>(null);
  const [addingDayId, setAddingDayId] = useState<string | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<TechEvent | null>(null);
  const [editingDay, setEditingDay] = useState<Day | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [closingEvent, setClosingEvent] = useState<TechEvent | null>(null);

  useEffect(() => {
    getDaysAsync().then(setDays).catch(() => {});
    adminListRegistrations().then(setRegistrations).catch(() => {});
  }, []);

  // Auto-dismiss success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  async function refresh() {
    const newDays = await getDaysAsync();
    setDays(newDays);
    setEditingEvent(null);
    setAddingDayId(null);
    setDeletingEvent(null);
    setEditingDay(null);
    setClosingEvent(null);
  }

  async function handleToggleOpen(event: TechEvent) {
    // If registration is currently open, confirm before closing
    if (event.registrationOpen) {
      setClosingEvent(event);
      return;
    }
    // Otherwise open directly
    await doToggle(event.id, "opened");
  }

  async function doToggle(eventId: string, action: "opened" | "closed") {
    setBusyEventId(eventId);
    setRowError(null);
    try {
      await adminToggleRegistration(eventId);
      await refresh();
      setSuccessMsg(`Registration ${action} successfully.`);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Toggle failed.");
    } finally {
      setBusyEventId(null);
    }
  }

  async function handleConfirmClose() {
    if (!closingEvent) return;
    await doToggle(closingEvent.id, "closed");
  }

  async function handleToggleDayStatus(dayId: string, currentStatus: string) {
    try {
      await adminUpdateDay(dayId, {
        status: currentStatus === "active" ? "coming-soon" : "active",
      });
      await refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingEvent) return;
    try {
      await adminDeleteEvent(deletingEvent.id);
      await refresh();
      setSuccessMsg(`"${deletingEvent.name}" deleted.`);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const allEvents = useMemo(() => days.flatMap((d) => d.events), [days]);

  return (
    <div className="space-y-6">
      {/* Success banner */}
      {successMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 animate-in fade-in duration-300"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {successMsg}
          </span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-muted transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error banner */}
      {rowError && (
        <div role="alert" className="flex items-start justify-between gap-3 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          <span>{rowError}</span>
          <button
            type="button"
            onClick={() => setRowError(null)}
            className="text-muted transition-colors hover:text-foreground"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal dialogs */}
      {(editingEvent || addingDayId) && (
        <EventModal
          dayId={addingDayId ?? editingEvent?.dayId ?? "day-1"}
          event={editingEvent}
          onClose={() => {
            setEditingEvent(null);
            setAddingDayId(null);
          }}
          onSaved={refresh}
        />
      )}

      {editingDay && (
        <DayModal
          day={editingDay}
          onClose={() => setEditingDay(null)}
          onSaved={refresh}
        />
      )}

      {deletingEvent && (
        <ConfirmDialog
          title="Delete Event"
          description={
            <>
              <p>
                Are you sure you want to delete{" "}
                <strong className="text-foreground">{deletingEvent.name}</strong>?
              </p>
              {registrations.filter((r) => r.eventId === deletingEvent.id).length > 0 && (
                <p className="mt-2 text-xs font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 p-2.5 rounded">
                  WARNING: There are {registrations.filter((r) => r.eventId === deletingEvent.id).length} existing registrations
                  for this event.
                </p>
              )}
            </>
          }
          confirmLabel="Delete Event"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingEvent(null)}
        />
      )}

      {/* Confirm close registration dialog */}
      {closingEvent && (
        <ConfirmDialog
          title="Close Registration"
          description={
            <>
              <p>
                Are you sure you want to close registration for{" "}
                <strong className="text-foreground">{closingEvent.name}</strong>?
              </p>
              <p className="mt-2 text-xs text-muted">
                Students will no longer be able to register for this event. You can re-open it later.
              </p>
            </>
          }
          confirmLabel="Close Registration"
          onConfirm={handleConfirmClose}
          onCancel={() => setClosingEvent(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Event Management</h1>
          <p className="mt-1 text-sm text-muted">
            {allEvents.length} events across {days.length} days
          </p>
        </div>
      </div>

      {/* Days & Events List */}
      <div className="space-y-8">
        {days.map((day) => (
          <div
            key={day.id}
            className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]"
          >
            {/* Day Header */}
            <div className="border-b border-white/[0.07] bg-white/[0.02] px-5 py-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-soft">
                    {day.label}
                  </span>
                  <span
                    className={`border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                      day.status === "active"
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-amber-500/40 text-amber-400"
                    }`}
                  >
                    {day.status}
                  </span>
                  <button
                    onClick={() => handleToggleDayStatus(day.id, day.status)}
                    title={day.status === "active" ? "Set to Coming Soon" : "Set to Active"}
                    className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                      day.status === "active"
                        ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    }`}
                  >
                    {day.status === "active" ? "→ Coming Soon" : "→ Set Active"}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{day.name}</h2>
                  <button
                    onClick={() => setEditingDay(day)}
                    title="Edit day name & description"
                    className="flex items-center justify-center rounded border border-white/10 p-1 text-muted hover:text-foreground hover:bg-white/[0.05] transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted">{day.description}</p>
              </div>
              <button
                onClick={() => setAddingDayId(day.id)}
                className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-primary-soft"
              >
                <Plus className="h-3.5 w-3.5" /> Add Event
              </button>
            </div>

            {/* Event List */}
            {day.events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                  <Calendar className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">No events scheduled</p>
                <p className="mt-1 text-xs text-muted">Add events to this day to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5 bg-white/[0.01]">
                {day.events.map((event) => {
                  const regCount = registrations.filter(
                    (r) => r.eventId === event.id
                  ).length;
                  const isBusy = busyEventId === event.id;
                  return (
                    <div
                      key={event.id}
                      className="group flex flex-col justify-between rounded-xl border border-white/[0.06] bg-[#1a1a1a] p-5 transition-all hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/20"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="truncate font-bold text-lg text-foreground transition-colors group-hover:text-primary-soft">
                              {event.name}
                            </h3>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <span className="rounded bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                                {event.category}
                              </span>
                              <span
                                className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                                  event.registrationOpen
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-red-500/10 text-red-400"
                                }`}
                              >
                                {event.registrationOpen ? "Registration Open" : "Closed"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-primary-soft">{formatPerPerson(event.registrationFee)}</p>
                            <p className="text-[10px] uppercase tracking-[0.1em] text-muted">Fee per person</p>
                          </div>
                        </div>

                        <p className="mt-4 line-clamp-2 text-sm text-muted">
                          {event.description}
                        </p>

                        <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-xs">
                          <div>
                            <p className="text-muted">Team Size</p>
                            <p className="font-semibold text-foreground mt-0.5">
                              {event.requiredPlayers ?? "TBA"} <span className="text-muted font-normal text-[10px]">+ {event.maxSubstitutes ?? 0} subs</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-muted">Registrations</p>
                            <p className="font-semibold text-foreground mt-0.5">
                              {regCount} <span className="text-muted font-normal text-[10px]">teams</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-2 pt-4 border-t border-white/[0.06]">
                        <button
                          onClick={() => handleToggleOpen(event)}
                          disabled={isBusy}
                          className={`flex-1 flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
                            event.registrationOpen
                              ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          }`}
                        >
                          {isBusy ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Updating…
                            </>
                          ) : event.registrationOpen ? (
                            "Close Reg."
                          ) : (
                            "Open Reg."
                          )}
                        </button>
                        <button
                          onClick={() => setEditingEvent(event)}
                          disabled={isBusy}
                          className="flex items-center justify-center rounded border border-white/10 px-3 py-2 text-muted hover:text-foreground hover:bg-white/[0.05] disabled:opacity-50"
                          title="Edit Event"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingEvent(event)}
                          disabled={isBusy}
                          className="flex items-center justify-center rounded border border-red-500/20 px-3 py-2 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          title="Delete Event"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
