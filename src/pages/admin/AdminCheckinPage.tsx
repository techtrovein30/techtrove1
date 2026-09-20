import { useState } from "react";
import {
  Search,
  CheckCircle2,
  Undo2,
  Loader2,
  UserCheck,
  CalendarDays,
} from "lucide-react";
import { useAllEvents } from "../../lib/useEvents";
import {
  useCheckinMembers,
  adminTogglePlayerCheckin,
  adminToggleCheckin,
  type CheckinMember,
} from "../../lib/checkin";
import { cn } from "../../lib/utils";
import { useToast } from "../../components/ui/toastContext";

export function AdminCheckinPage() {
  const { events, loading: eventsLoading } = useAllEvents();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "external">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "checked" | "pending">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const { players, loading, refresh } = useCheckinMembers(
    eventId || undefined,
    search
  );

  const statusFor = (player: (typeof players)[number]) =>
    player.attended ? "checked" : "pending";

  const typedPlayers =
    typeFilter === "all"
      ? players
      : players.filter((p) =>
          p.members.some((m) => m.participantType === typeFilter)
        );

  const filteredPlayers =
    statusFilter === "all"
      ? typedPlayers
      : typedPlayers.filter((p) => statusFor(p) === statusFilter);

  const total = filteredPlayers.length;
  const attendedCount = filteredPlayers.filter((p) => p.attended).length;

  const eventNamesById = new Map(events.map((ev) => [ev.id, ev.name]));
  const eventNameFor = (member: CheckinMember) =>
    member.eventName ?? eventNamesById.get(member.eventId) ?? "";

  async function toggle(player: (typeof filteredPlayers)[number]) {
    setBusy(player.key);
    try {
      await adminTogglePlayerCheckin(player.email, !player.attended);
      await refresh();
      toast.success(
        player.attended
          ? `Check-in undone for ${player.playerName}`
          : `${player.playerName} checked in`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setBusy(null);
    }
  }

  // Toggle check-in for ONE membership (a single member × event), keyed by
  // the member row id so only that registration_members row is touched.
  async function toggleMember(m: CheckinMember) {
    setBusy(m.id);
    try {
      await adminToggleCheckin(m.id, !m.attended);
      await refresh();
      toast.success(
        m.attended
          ? `Check-in undone for ${m.memberName}`
          : `${m.memberName} checked in`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setBusy(null);
    }
  }

  const allCheckedIn = total > 0 && attendedCount === total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-soft mb-1">
            Attendance
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Check-in Desk
          </h1>
          <p className="mt-2 text-sm text-muted">
            Tap Check In when a participant arrives. Only checked-in members are
            eligible for certificates.
          </p>
        </div>

        {/* Progress summary */}
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Checked In
            </p>
            <p className="text-xl font-bold text-emerald-400">
              {attendedCount}
              <span className="text-sm font-medium text-muted"> / {total}</span>
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Remaining
            </p>
            <p className="text-xl font-bold text-amber-400">{total - attendedCount}</p>
          </div>
          {allCheckedIn && total > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
                All done
              </p>
              <p className="text-xl font-bold text-emerald-400">100%</p>
            </div>
          )}
        </div>
      </div>

      {/* Search + event filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, team, or registration code…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        >
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
          {(["all", "internal", "external"] as const).map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setTypeFilter(ty)}
              className={cn(
                "px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors",
                typeFilter === ty
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              )}
            >
              {ty === "all" ? "All" : ty}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-emerald-500/20 bg-white/[0.03] overflow-hidden">
          {(
            [
              ["all", "All"],
              ["checked", "Checked In"],
              ["pending", "Not Checked In"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={cn(
                "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.13em] transition-colors",
                statusFilter === val
                  ? "bg-emerald-500/90 text-white"
                  : "text-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / empty states */}
      {loading || eventsLoading ? (
        <div className="flex h-48 items-center justify-center text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Loading attendees…
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-[#161616] p-12 text-center">
          <UserCheck className="h-10 w-10 text-muted" aria-hidden />
          <p className="mt-4 text-sm font-medium text-foreground">No attendees found</p>
          <p className="mt-1 text-xs text-muted">
            {search
              ? "No name, team, or code matches your search."
              : "Registered participants will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPlayers.map((player) => {
            const m = player.members[0];
            const isCaptain = player.members.some((x) => x.position === 1);
            const isSub = player.members.every((x) => x.memberRole === "substitute");
            const playerEventNames = Array.from(
              new Set(
                player.members.map((x) => eventNameFor(x)).filter(Boolean)
              )
            );
            return (
              <div
                key={player.key}
                className="rounded-xl border border-white/[0.07] bg-[#161616]"
              >
                {/* Player header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {player.playerName}
                      </p>
                      {isCaptain && (
                        <span className="shrink-0 border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary-soft">
                          Captain
                        </span>
                      )}
                      {isSub && (
                        <span className="shrink-0 border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                          Substitute
                        </span>
                      )}
                    </div>
                    {playerEventNames.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <CalendarDays
                          className="h-3 w-3 shrink-0 text-muted"
                          aria-hidden
                        />
                        {playerEventNames.map((name) => (
                          <span
                            key={name}
                            className="shrink-0 border border-primary/30 bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-primary-soft"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {m.participantType === "internal" ? "SIMATS" : "External"}
                      {m.college ? ` · ${m.college}` : ""}
                      {m.regNumber ? ` · ${m.regNumber}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => toggle(player)}
                    disabled={busy === player.key}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-all",
                      player.attended
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-primary text-white hover:bg-primary-soft shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                    )}
                  >
                    {busy === player.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : player.attended ? (
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {player.attended ? "Uncheck" : "Check In"}
                  </button>
                </div>

                {/* Memberships across events */}
                <ul>
                  {player.members.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-4 border-b border-white/[0.03] px-4 py-2.5 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[13px] font-semibold text-foreground">
                              {member.memberName}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                                member.position === 1
                                  ? "border-primary/40 bg-primary/10 text-primary-soft"
                                  : "border-white/10 text-muted"
                              )}
                            >
                              {member.position === 1
                                ? "Captain"
                                : member.memberRole === "substitute"
                                  ? `Sub ${member.position}`
                                  : `Player ${String(member.position).padStart(2, "0")}`}
                            </span>
                          </p>
                          <p className="truncate text-[11px] text-muted">
                            {eventNameFor(member)}
                            <span className="mx-1.5 opacity-50">·</span>
                            {member.teamName}
                            <span className="mx-1.5 opacity-50">·</span>
                            <span className="font-mono">{member.registrationCode}</span>
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleMember(member)}
                        disabled={busy === member.id}
                        className={cn(
                          "shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all disabled:opacity-50",
                          member.attended
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "border-white/10 text-muted hover:border-primary/50 hover:text-primary-soft"
                        )}
                      >
                        {busy === member.id ? (
                          <Loader2 className="mx-auto h-3 w-3 animate-spin" aria-hidden />
                        ) : member.attended ? (
                          "Uncheck"
                        ) : (
                          "Check In"
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}