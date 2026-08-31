import { useState, useMemo, useCallback } from "react";
import {
  Search,
  X,
  ChevronRight,
  Trash2,
  CheckCircle2,
  Clock,
  ChevronLeft,
  Download,
  ClipboardList,
} from "lucide-react";
import type { Registration } from "../../lib/api";
import {
  adminUpdateRegistration,
  adminDeleteRegistration,
} from "../../lib/adminApi";
import { useAllEvents } from "../../lib/useEvents";
import { useAdminRegistrations } from "../../lib/useAdminRealtime";
import { formatFee } from "../../lib/utils";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";

type StatusFilter = "all" | "pending" | "recorded";

const PAGE_SIZE = 15;

function RegistrationDetail({
  registration,
  onClose,
  onDeleted,
  onUpdated,
}: {
  registration: Registration;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (r: Registration) => void;
}) {
  const { events } = useAllEvents();
  const event = events.find((e) => e.id === registration.eventId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function togglePaymentStatus() {
    try {
      const nextStatus =
        registration.paymentStatus === "recorded" ? "pending" : "recorded";
      const updated = await adminUpdateRegistration(registration.id, {
        paymentStatus: nextStatus,
      });
      onUpdated(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function handleDelete() {
    try {
      await adminDeleteRegistration(registration.id);
      onDeleted(registration.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
    setConfirmDelete(false);
  }

  const players = registration.members.filter((m) => m.role === "player");
  const substitutes = registration.members.filter((m) => m.role === "substitute");

  return (
    <>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete registration"
          description={
            <>
              This will permanently delete team{" "}
              <strong className="text-foreground">{registration.teamName}</strong>'s registration (
              <code className="text-foreground">{registration.registrationCode}</code>).
            </>
          }
          confirmLabel="Delete registration"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-white/[0.07] bg-[#121212]">
          {/* Header */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="flex-1 truncate text-sm font-semibold text-foreground">
              {registration.registrationCode} · {registration.teamName}
            </h2>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Payment banner */}
            <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#1a1a1a] p-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Payment Status
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground capitalize">
                  {registration.paymentStatus}
                </p>
              </div>
              <button
                onClick={togglePaymentStatus}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  registration.paymentStatus === "recorded"
                    ? "border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                }`}
              >
                {registration.paymentStatus === "recorded" ? (
                  <>
                    <Clock className="h-3.5 w-3.5" /> Mark Pending
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                  </>
                )}
              </button>
            </div>

            {/* Overview */}
            <section>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Registration Summary
              </h3>
              <dl className="divide-y divide-white/[0.06]">
                {[
                  { term: "Registration Code", value: registration.registrationCode },
                  { term: "Event", value: event?.name ?? registration.eventId },
                  { term: "Team Name", value: registration.teamName },
                  { term: "Captain Name", value: registration.captainName },
                  { term: "Fee Amount", value: formatFee(registration.fee) },
                  {
                    term: "Created At",
                    value: new Date(registration.createdAt).toLocaleString(),
                  },
                ].map((r) => (
                  <div key={r.term} className="flex justify-between gap-4 py-2.5 text-sm">
                    <dt className="shrink-0 text-muted">{r.term}</dt>
                    <dd className="min-w-0 break-all text-right text-foreground">
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Roster */}
            <section>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Team Players ({players.length})
              </h3>
              <div className="space-y-1.5">
                {players.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded bg-[#1a1a1a] px-3 py-2 text-sm text-foreground"
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-soft">
                      Player {p.position}
                    </span>
                  </div>
                ))}
              </div>

              {substitutes.length > 0 && (
                <>
                  <h3 className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Substitutes ({substitutes.length})
                  </h3>
                  <div className="space-y-1.5">
                    {substitutes.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded bg-[#1a1a1a] px-3 py-2 text-sm text-muted"
                      >
                        <span>{s.name}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em]">
                          Sub {s.position}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminRegistrationsPage() {
  const { registrations, refresh } = useAdminRegistrations();

  const { events } = useAllEvents();
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Registration | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return registrations.filter((r) => {
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (statusFilter !== "all" && r.paymentStatus !== statusFilter) return false;
      if (!q) return true;

      const evName = events.find((e) => e.id === r.eventId)?.name.toLowerCase() ?? "";
      return (
        r.registrationCode.toLowerCase().includes(q) ||
        r.teamName.toLowerCase().includes(q) ||
        r.captainName.toLowerCase().includes(q) ||
        evName.includes(q) ||
        r.members.some((m) => m.name.toLowerCase().includes(q))
      );
    });
  }, [registrations, query, eventFilter, statusFilter, events]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDeleted = useCallback(() => {
    refresh();
    setSelected(null);
  }, [refresh]);

  const handleUpdated = useCallback((updated: Registration) => {
    refresh();
    setSelected(updated);
  }, [refresh]);

  function exportCSV() {
    if (filtered.length === 0) return;
    const headers = ["Registration Code", "Event", "Team Name", "Captain", "Fee", "Status", "Date"];
    const rows = filtered.map(r => {
      const ev = events.find(e => e.id === r.eventId);
      return [
        r.registrationCode,
        ev?.name ?? r.eventId,
        r.teamName,
        r.captainName,
        r.fee.toString(),
        r.paymentStatus,
        new Date(r.createdAt).toISOString()
      ].map(field => `"${field}"`).join(",");
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `techtrove_registrations_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {selected && (
        <RegistrationDetail
          registration={selected}
          onClose={() => setSelected(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Registrations</h1>
          <p className="mt-1 text-sm text-muted">
            {registrations.length} team entry
            {registrations.length !== 1 ? "ies" : ""}
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <Download className="h-4 w-4 text-muted" />
          Export CSV
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search code, team, captain, member…"
            className="w-full border border-white/[0.08] bg-[#161616] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none focus:border-primary/60"
          />
        </div>

        {/* Event filter */}
        <select
          value={eventFilter}
          onChange={(e) => {
            setEventFilter(e.target.value);
            setPage(1);
          }}
          className="border border-white/[0.08] bg-[#161616] px-3 py-2.5 text-xs text-foreground outline-none"
        >
          <option value="all">All Events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <div className="flex rounded border border-white/[0.08] bg-[#161616] overflow-hidden">
          {(["all", "pending", "recorded"] as StatusFilter[]).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-4 py-2 text-xs font-semibold uppercase tracking-[0.13em] transition-colors ${
                statusFilter === st
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Code / Team", "Event", "Captain", "Fee", "Status", "Date"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
                    >
                      {h}
                    </th>
                  )
                )}
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <ClipboardList className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No registrations found</p>
                    <p className="mt-1 text-xs text-muted">No team entries match your current filters.</p>
                  </td>
                </tr>
              ) : (
                paged.map((r) => {
                  const ev = events.find((e) => e.id === r.eventId);
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                      onClick={() => setSelected(r)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">
                            {r.teamName}
                          </p>
                          <p className="text-xs font-mono text-primary-soft">
                            {r.registrationCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {ev?.name ?? r.eventId}
                      </td>
                      <td className="px-4 py-3 text-muted">{r.captainName}</td>
                      <td className="px-4 py-3 text-foreground font-medium">
                        {formatFee(r.fee)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                            r.paymentStatus === "recorded"
                              ? "border-emerald-500/40 text-emerald-400"
                              : "border-amber-500/40 text-amber-400"
                          }`}
                        >
                          {r.paymentStatus === "recorded" ? "Paid" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3">
            <p className="text-xs text-muted">
              {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] text-muted disabled:opacity-30 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] text-muted disabled:opacity-30 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
