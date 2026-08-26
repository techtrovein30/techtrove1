import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  getDays,
  getAllEvents,
  adminToggleRegistration,
  adminUpdateEvent,
  adminAddEvent,
  adminDeleteEvent,
} from "../../lib/eventStore";
import type { TechEvent } from "../../lib/eventStore";
import { adminListRegistrations } from "../../lib/adminApi";
import { formatFee } from "../../lib/utils";
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

  function handleSave() {
    if (!name.trim()) {
      setError("Event name is required.");
      return;
    }

    try {
      if (event) {
        adminUpdateEvent(event.id, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          registrationFee: Number(fee),
          requiredPlayers: Number(players),
          maxSubstitutes: Number(subs),
        });
      } else {
        adminAddEvent(dayId, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          registrationOpen: true,
          registrationType: "team",
          registrationFee: Number(fee),
          requiredPlayers: Number(players),
          maxSubstitutes: Number(subs),
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
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-white/10 bg-[#0f0a0a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
                Fee (₹)
              </label>
              <input
                type="number"
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
              onChange={(e) => setDescription(e.target.value)}
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
            Save Event
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminEventsPage() {
  const [days, setDays] = useState(() => getDays());
  const [editingEvent, setEditingEvent] = useState<TechEvent | null>(null);
  const [addingDayId, setAddingDayId] = useState<string | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<TechEvent | null>(null);

  const registrations = useMemo(() => {
    try {
      return adminListRegistrations();
    } catch {
      return [];
    }
  }, []);

  function refresh() {
    setDays([...getDays()]);
    setEditingEvent(null);
    setAddingDayId(null);
    setDeletingEvent(null);
  }

  function handleToggleOpen(eventId: string) {
    try {
      adminToggleRegistration(eventId);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Toggle failed.");
    }
  }

  function handleDeleteConfirm() {
    if (!deletingEvent) return;
    try {
      adminDeleteEvent(deletingEvent.id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const allEvents = useMemo(() => getAllEvents(), [days]);

  return (
    <div className="space-y-6">
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
                </div>
                <h2 className="mt-1 text-lg font-bold text-foreground">
                  {day.name}
                </h2>
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
              <div className="p-8 text-center text-sm text-muted">
                No events in {day.label} yet.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {day.events.map((event) => {
                  const regCount = registrations.filter(
                    (r) => r.eventId === event.id
                  ).length;
                  return (
                    <div
                      key={event.id}
                      className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-foreground">
                            {event.name}
                          </h3>
                          <span className="border border-white/10 px-2 py-0.5 text-[9px] text-muted">
                            {event.category}
                          </span>
                          <span
                            className={`border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                              event.registrationOpen
                                ? "border-emerald-500/40 text-emerald-400"
                                : "border-red-500/40 text-red-400"
                            }`}
                          >
                            {event.registrationOpen ? "Registration Open" : "Closed"}
                          </span>
                        </div>
                        <p className="text-xs text-muted max-w-xl">
                          {event.description}
                        </p>
                        <p className="text-xs text-muted">
                          Fee:{" "}
                          <strong className="text-foreground">
                            {formatFee(event.registrationFee)}
                          </strong>{" "}
                          · Players: {event.requiredPlayers ?? "TBA"} · Subs:{" "}
                          {event.maxSubstitutes ?? 0} · Registrations:{" "}
                          <strong className="text-primary-soft">{regCount}</strong>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleToggleOpen(event.id)}
                          className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] border transition-colors ${
                            event.registrationOpen
                              ? "border-red-500/40 text-red-300 hover:bg-red-500/10"
                              : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                          }`}
                        >
                          {event.registrationOpen ? "Close Reg." : "Open Reg."}
                        </button>
                        <button
                          onClick={() => setEditingEvent(event)}
                          className="flex items-center gap-1 rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground hover:border-white/20"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setDeletingEvent(event)}
                          className="flex items-center gap-1 rounded border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
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
