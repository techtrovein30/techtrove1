import { useState, useMemo } from "react";
import { Search, CreditCard, Clock, CheckCircle2 } from "lucide-react";
import type { Registration } from "../../lib/mockApi";
import {
  adminListRegistrations,
  adminUpdateRegistration,
} from "../../lib/adminApi";
import { getAllEvents } from "../../lib/eventStore";
import { formatFee } from "../../lib/utils";

type StatusFilter = "all" | "pending" | "recorded";

export function AdminPaymentsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>(() => {
    try {
      return adminListRegistrations();
    } catch {
      return [];
    }
  });

  const events = useMemo(() => getAllEvents(), []);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
        evName.includes(q)
      );
    });
  }, [registrations, query, eventFilter, statusFilter, events]);

  const summary = useMemo(() => {
    let pendingCount = 0;
    let recordedCount = 0;
    let totalRevenue = 0;
    let pendingRevenue = 0;

    for (const r of registrations) {
      if (r.paymentStatus === "recorded") {
        recordedCount++;
        totalRevenue += r.fee;
      } else {
        pendingCount++;
        pendingRevenue += r.fee;
      }
    }

    return { pendingCount, recordedCount, totalRevenue, pendingRevenue };
  }, [registrations]);

  function togglePaymentStatus(reg: Registration) {
    try {
      const nextStatus =
        reg.paymentStatus === "recorded" ? "pending" : "recorded";
      const updated = adminUpdateRegistration(reg.id, {
        paymentStatus: nextStatus,
      });
      setRegistrations((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payments</h1>
        <p className="mt-1 text-sm text-muted">
          Manage event registration fees and record payments.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Total Revenue Collected
            </p>
            <CreditCard className="h-4 w-4 text-primary-soft" />
          </div>
          <p className="mt-2 text-3xl font-bold text-primary-soft">
            {formatFee(summary.totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {summary.recordedCount} Recorded Payments
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Pending Payments
            </p>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {summary.pendingCount}
          </p>
          <p className="mt-1 text-xs text-amber-400">
            {formatFee(summary.pendingRevenue)} pending
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Recorded Rate
            </p>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {registrations.length > 0
              ? `${Math.round(
                  (summary.recordedCount / registrations.length) * 100
                )}%`
              : "0%"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {summary.recordedCount} of {registrations.length} total entries
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
            placeholder="Search reg code, team name, captain…"
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

        <div className="flex rounded border border-white/[0.08] bg-[#161616] overflow-hidden">
          {(["all", "pending", "recorded"] as StatusFilter[]).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
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

      {/* Payment Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Code / Team", "Event", "Captain", "Fee Amount", "Status", "Action"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    No payment records match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const ev = events.find((e) => e.id === r.eventId);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-white/[0.025]">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{r.teamName}</p>
                          <p className="text-xs font-mono text-primary-soft">
                            {r.registrationCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{ev?.name ?? r.eventId}</td>
                      <td className="px-4 py-3 text-muted">{r.captainName}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">
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
                          {r.paymentStatus === "recorded" ? "Recorded" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => togglePaymentStatus(r)}
                          className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                            r.paymentStatus === "recorded"
                              ? "border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                              : "border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                          }`}
                        >
                          {r.paymentStatus === "recorded"
                            ? "Mark Pending"
                            : "Mark Paid"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
