import { useState, useMemo } from "react";
import { Search, Users, X } from "lucide-react";
import type { Registration } from "../../lib/api";
import { useAllEvents } from "../../lib/useEvents";
import { useAdminRegistrations } from "../../lib/useAdminRealtime";
import { formatFee } from "../../lib/utils";

export function AdminTeamsPage() {
  const { registrations } = useAdminRegistrations();

  const { events } = useAllEvents();
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
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              <button
                onClick={() => setSelectedTeam(null)}
                className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-sm font-semibold text-foreground">
                Team Roster · {selectedTeam.teamName}
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="flex flex-col items-center justify-center space-y-3 pb-6 pt-2 border-b border-white/[0.06]">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/10 text-primary-soft">
                  <Users className="h-7 w-7" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-foreground">{selectedTeam.teamName}</h3>
                  <p className="text-xs font-mono text-primary-soft">{selectedTeam.registrationCode}</p>
                </div>
              </div>

              <section>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Registration Details
                </h3>
                <dl className="divide-y divide-white/[0.06]">
                  {[
                    { term: "Event", value: events.find((e) => e.id === selectedTeam.eventId)?.name ?? selectedTeam.eventId },
                    { term: "Captain", value: selectedTeam.captainName },
                    { 
                      term: "Fee Status", 
                      value: <span className={`font-semibold capitalize ${selectedTeam.paymentStatus === "recorded" ? "text-emerald-400" : "text-amber-400"}`}>
                        {selectedTeam.paymentStatus} ({formatFee(selectedTeam.fee)})
                      </span> 
                    },
                  ].map((r) => (
                    <div key={r.term} className="flex justify-between gap-4 py-2.5 text-sm">
                      <dt className="shrink-0 text-muted">{r.term}</dt>
                      <dd className="min-w-0 break-all text-right text-foreground">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Player Roster ({selectedTeam.members.length})
                </h3>
                <div className="space-y-2">
                  {selectedTeam.members.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-[#1a1a1a] border border-white/[0.04] px-3.5 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.05] text-[10px] font-bold text-muted">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
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
              </section>
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
        <div className="flex flex-col items-center justify-center py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
            <Users className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No teams found</p>
          <p className="mt-1 text-xs text-muted">Try adjusting your search or filters.</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-white/[0.01]">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTeam(t)}
                      className="group cursor-pointer rounded-xl border border-white/[0.06] bg-[#1a1a1a] p-4 transition-all hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/20"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-foreground transition-colors group-hover:text-primary-soft">
                            {t.teamName}
                          </h3>
                          <p className="text-xs font-mono text-muted group-hover:text-primary-soft/70">
                            {t.registrationCode}
                          </p>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                            t.paymentStatus === "recorded"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {t.paymentStatus}
                        </span>
                      </div>
                      
                      <div className="mt-4 space-y-1.5 text-xs text-muted">
                        <p>Captain: <span className="font-medium text-foreground">{t.captainName}</span></p>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 opacity-70" />
                          <span>{t.members.length} Members</span>
                        </div>
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
