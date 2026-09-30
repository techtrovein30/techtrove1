import { useState, useEffect } from "react";
import { X, Search, CheckCircle2, Users, UserX, Loader2 } from "lucide-react";
import type { TechEvent } from "../../data/techtrove";
import type { EventCoordinator, CoordinatorParticipant } from "../../lib/coordinatorApi";
import { getEventParticipants } from "../../lib/coordinatorApi";

interface EventParticipantsModalProps {
  event: TechEvent;
  coordinator: EventCoordinator | null;
  onClose: () => void;
}

export function EventParticipantsModal({
  event,
  coordinator,
  onClose,
}: EventParticipantsModalProps) {
  const [participants, setParticipants] = useState<CoordinatorParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");

  // Re-fetched whenever the modal is pointed at a different event. `loading` is
  // not reset here: it already starts true, and setting it synchronously would
  // render the stale roster from the previous event for a frame.
  useEffect(() => {
    getEventParticipants(event.id)
      .then(setParticipants)
      .catch(() => setParticipants([]))
      .finally(() => setLoading(false));
  }, [event.id]);

  const filtered = participants.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      p.mobile.includes(search) ||
      p.registrationCode.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === "present") return p.attended;
    if (filter === "absent") return !p.attended;
    return true;
  });

  const total = participants.length;
  const attendedCount = participants.filter((p) => p.attended).length;
  const absentCount = total - attendedCount;
  const percentage = total > 0 ? Math.round((attendedCount / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#121212] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 bg-[#161616]">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-soft">
                {event.dayId}
              </span>
              <h2 className="text-lg font-bold text-foreground">{event.name}</h2>
            </div>
            <p className="text-xs text-muted mt-1">
              Main Coordinator:{" "}
              {coordinator ? (
                <span className="font-semibold text-primary-soft">
                  {coordinator.name} ({coordinator.email} · {coordinator.mobile})
                </span>
              ) : (
                <span className="italic text-muted">Unassigned</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-white/[0.08] hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/10 bg-white/[0.02]">
          <div className="p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Registered</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{total}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Present</p>
            <p className="text-lg font-bold text-emerald-400 mt-0.5">{attendedCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Absent</p>
            <p className="text-lg font-bold text-amber-400 mt-0.5">{absentCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-soft">Attendance</p>
            <p className="text-lg font-bold text-primary-soft mt-0.5">{percentage}%</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/10 bg-[#141414]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search participants by name, email, mobile, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#181818] pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-primary-soft focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-1 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                filter === "all" ? "bg-primary text-white" : "text-muted hover:text-foreground"
              }`}
            >
              All ({total})
            </button>
            <button
              onClick={() => setFilter("present")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                filter === "present" ? "bg-emerald-500/20 text-emerald-400 font-semibold" : "text-muted hover:text-foreground"
              }`}
            >
              Present ({attendedCount})
            </button>
            <button
              onClick={() => setFilter("absent")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                filter === "absent" ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-muted hover:text-foreground"
              }`}
            >
              Absent ({absentCount})
            </button>
          </div>
        </div>

        {/* Participant Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="mt-2 text-xs">Loading participants and attendance records...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted">
              <Users className="h-8 w-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-medium">No participants found</p>
              <p className="text-xs text-muted/70 mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted font-semibold">
                  <tr>
                    <th className="py-3 px-4">Participant Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4">Reg Code</th>
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-muted font-mono">{p.email}</td>
                      <td className="py-3 px-4 text-muted font-mono">{p.mobile}</td>
                      <td className="py-3 px-4 text-muted font-mono">{p.registrationCode}</td>
                      <td className="py-3 px-4 text-muted">{p.teamName}</td>
                      <td className="py-3 px-4">
                        {p.attended ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/20">
                            <UserX className="h-3 w-3" />
                            Absent
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted font-mono text-[11px]">
                        {p.attendedAt ? (
                          new Date(p.attendedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 p-4 bg-[#141414] text-xs text-muted">
          <span>Showing {filtered.length} of {total} participants</span>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-1.5 font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
