import { useState, useMemo } from "react";
import { Search, Users, ChevronRight, X } from "lucide-react";
import type { Registration } from "../../lib/mockApi";
import { adminListRegistrations } from "../../lib/adminApi";
import { getAllEvents } from "../../lib/eventStore";
import { formatFee } from "../../lib/utils";

export function AdminTeamsPage() {
  const [registrations] = useState<Registration[]>(() => {
    try {
      return adminListRegistrations();
    } catch {
      return [];
    }
  });

  const events = useMemo(() => getAllEvents(), []);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [selectedTeam, setSelectedTeam] = useState<Registration | null>(null);

  const filteredTeams = useMemo(() => {
    const q = query.toLowerCase().trim();
    return registrations.filter((r) => {
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (!q) return true;

      const evName = events.find((e) => e.id === r.eventId)?.name.toLowerCase() ?? "";
      return (
        r.teamName.toLowerCase().includes(q) ||
        r.captainName.toLowerCase().includes(q) ||
        r.registrationCode.toLowerCase().includes(q) ||
        evName.includes(q) ||
        r.members.some((m) => m.name.toLowerCase().includes(q))
      );
    });
  }, [registrations, query, eventFilter, events]);

  const eventGrouped = useMemo(() => {
    const groups: Record<string, Registration[]> = {};
    for (const r of filteredTeams) {
      if (!groups[r.eventId]) groups[r.eventId] = [];
      groups[r.eventId].push(r);
    }
    return groups;
  }, [filteredTeams]);

  return (
    <div className="space-y-6">
      {/* Team Details Slide-Over */}
      {selectedTeam && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-white/[0.07] bg-[#121212]">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
              <h2 className="text-sm font-semibold text-foreground">
                Team Roster · {selectedTeam.teamName}
              </h2>
              <button
                onClick={() => setSelectedTeam(null)}
                className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="rounded-lg border border-white/[0.07] bg-[#1a1a1a] p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Registration Code</span>
                  <span className="font-mono text-primary-soft font-semibold">
                    {selectedTeam.registrationCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Event</span>
                  <span>
                    {events.find((e) => e.id === selectedTeam.eventId)?.name ??
                      selectedTeam.eventId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Captain</span>
                  <span>{selectedTeam.captainName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Fee Status</span>
                  <span
                    className={`font-semibold capitalize ${
                      selectedTeam.paymentStatus === "recorded"
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {selectedTeam.paymentStatus} ({formatFee(selectedTeam.fee)})
                  </span>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Player Roster ({selectedTeam.members.length})
                </h3>
                <div className="space-y-2">
                  {selectedTeam.members.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded bg-[#1a1a1a] px-3.5 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted" />
                        <span className="font-medium text-foreground">{m.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          m.role === "player"
                            ? "text-primary-soft"
                            : "text-muted"
                        }`}
                      >
                        {m.role} #{m.position}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Teams</h1>
          <p className="mt-1 text-sm text-muted">
            {filteredTeams.length} registered team
            {filteredTeams.length !== 1 ? "s" : ""} across events
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams, captains, players…"
            className="w-full border border-white/[0.08] bg-[#161616] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none focus:border-primary/60"
          />
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="border border-white/[0.08] bg-[#161616] px-3 py-2.5 text-xs text-foreground outline-none"
        >
          <option value="all">All Events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped Team List */}
      {Object.keys(eventGrouped).length === 0 ? (
        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-12 text-center text-muted">
          No teams found matching your query.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(eventGrouped).map(([eventId, teams]) => {
            const ev = events.find((e) => e.id === eventId);
            return (
              <div
                key={eventId}
                className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]"
              >
                <div className="border-b border-white/[0.07] bg-white/[0.02] px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-foreground">
                      {ev?.name ?? eventId}
                    </h2>
                    <span className="border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-muted">
                      {ev?.category ?? "Sports"}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {teams.length} Team{teams.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTeam(t)}
                      className="flex cursor-pointer items-center justify-between px-5 py-3.5 transition-colors hover:bg-white/[0.025]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">
                            {t.teamName}
                          </p>
                          <span className="font-mono text-xs text-primary-soft">
                            ({t.registrationCode})
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          Captain: {t.captainName} · {t.members.length} Members
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className={`border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                            t.paymentStatus === "recorded"
                              ? "border-emerald-500/40 text-emerald-400"
                              : "border-amber-500/40 text-amber-400"
                          }`}
                        >
                          {t.paymentStatus}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
