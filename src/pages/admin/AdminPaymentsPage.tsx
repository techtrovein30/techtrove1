import { useState, useMemo } from "react";
import { Search, CreditCard, Clock, CheckCircle2, Download, Receipt, Image as ImageIcon, Copy, Check, Loader2, RefreshCcw } from "lucide-react";
import type { Registration } from "../../lib/api";
import {
  adminUpdateRegistration,
  adminRequestPaymentReupload,
} from "../../lib/adminApi";
import { useAllEvents } from "../../lib/useEvents";
import { useAdminRegistrations } from "../../lib/useAdminRealtime";
import { formatFee } from "../../lib/utils";
import { toCsv, downloadCsv } from "../../lib/csv";
import { ProofModal } from "../../components/admin/ProofModal";
import { ReuploadRequestDialog } from "../../components/admin/ReuploadRequestDialog";

type StatusFilter = "all" | "pending" | "recorded";

export function AdminPaymentsPage() {
  const { registrations, setRegistrations, refresh } = useAdminRegistrations();

  const { events } = useAllEvents();
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedProof, setSelectedProof] = useState<Registration | null>(null);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [reuploadTarget, setReuploadTarget] = useState<Registration | null>(null);
  const [reuploadBusy, setReuploadBusy] = useState(false);
  const [reuploadBanner, setReuploadBanner] = useState<string | null>(null);

  function copyUtr(utr: string) {
    navigator.clipboard.writeText(utr).then(() => {
      setCopiedUtr(utr);
      setTimeout(() => setCopiedUtr(null), 2000);
    });
  }

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
        (r.utrNumber && r.utrNumber.toLowerCase().includes(q)) ||
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

  async function togglePaymentStatus(reg: Registration) {
    const nextStatus =
      reg.paymentStatus === "recorded" ? "pending" : "recorded";

    // Optimistic UI update
    setRegistrations((prev) =>
      prev.map((r) => (r.id === reg.id ? { ...r, paymentStatus: nextStatus } : r))
    );
    setBusyId(reg.id);

    try {
      await adminUpdateRegistration(reg.id, {
        paymentStatus: nextStatus,
      });
      await refresh();
    } catch (err) {
      // Revert optimistic update
      setRegistrations((prev) =>
        prev.map((r) => (r.id === reg.id ? { ...r, paymentStatus: reg.paymentStatus } : r))
      );
      setRowError(err instanceof Error ? err.message : "Payment update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestReupload(reason: string, note: string) {
    const reg = reuploadTarget;
    if (!reg) return;
    setReuploadBusy(true);
    setRowError(null);
    try {
      const updated = await adminRequestPaymentReupload(reg.id, { reason, note });
      if (updated.paymentReviewNote) {
        setRegistrations((prev) =>
          prev.map((r) => (r.id === reg.id ? updated : r))
        );
      }
      setReuploadBanner(
        "Screenshot re-upload requested. The participant has been notified to upload a new screenshot.",
      );
      setReuploadTarget(null);
    } catch (err) {
      setRowError(
        err instanceof Error ? err.message : "Re-upload request could not be saved.",
      );
    } finally {
      setReuploadBusy(false);
    }
  }

  function exportCSV() {
    if (filtered.length === 0) return;
    const headers = ["Registration Code", "Team Name", "Event", "Captain", "Fee Amount", "Status", "UTR Number", "Proof Path"];
    const rows = filtered.map(r => {
      const ev = events.find(e => e.id === r.eventId);
      return [
        r.registrationCode,
        r.teamName,
        ev?.name ?? r.eventId,
        r.captainName,
        r.fee,
        r.paymentStatus,
        r.utrNumber ?? "",
        r.paymentScreenshotPath ?? r.paymentScreenshotUrl ?? ""
      ];
    });

    downloadCsv(
      `techtrove_payments_${new Date().toISOString().split('T')[0]}.csv`,
      toCsv(headers, rows)
    );
  }

  return (
    <div className="space-y-6">
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
      {reuploadBanner && (
        <div role="status" className="flex items-start justify-between gap-3 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          <span>{reuploadBanner}</span>
          <button
            type="button"
            onClick={() => setReuploadBanner(null)}
            className="text-muted transition-colors hover:text-foreground"
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      )}
      {reuploadTarget && (
        <ReuploadRequestDialog
          teamName={reuploadTarget.teamName}
          registrationCode={reuploadTarget.registrationCode}
          busy={reuploadBusy}
          onConfirm={handleRequestReupload}
          onCancel={() => setReuploadTarget(null)}
        />
      )}
      {selectedProof && (
        <ProofModal
          isOpen={!!selectedProof}
          onClose={() => setSelectedProof(null)}
          path={selectedProof.paymentScreenshotPath ?? selectedProof.paymentScreenshotUrl}
          title={`Payment Proof · ${selectedProof.teamName}`}
          subtitle={`Registration ${selectedProof.registrationCode} · UTR: ${selectedProof.utrNumber ?? "N/A"}`}
          utrNumber={selectedProof.utrNumber}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="mt-1 text-sm text-muted">
            Manage event registration fees, review payment proofs, and verify UTR numbers.
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <Download className="h-4 w-4 text-muted" />
          Export Payments
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="group relative overflow-hidden rounded-xl border border-primary/30 bg-primary/10 p-5 transition-all hover:border-primary/50 hover:bg-primary/20">
          <div className="flex items-center justify-between z-10 relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-soft">
              Total Revenue Collected
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary-soft">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-primary-soft drop-shadow-[0_0_12px_rgba(167,139,250,0.3)] z-10 relative">
            {formatFee(summary.totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-primary-soft/70 z-10 relative">
            {summary.recordedCount} Recorded Payments
          </p>
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl transition-opacity duration-300 group-hover:bg-primary/30" aria-hidden="true" />
        </div>

        <div className="group relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 transition-all hover:border-amber-500/50 hover:bg-amber-500/10">
          <div className="flex items-center justify-between z-10 relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400">
              Pending Payments
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-amber-400 z-10 relative">
            {summary.pendingCount}
          </p>
          <p className="mt-1 text-xs text-amber-400/70 z-10 relative">
            {formatFee(summary.pendingRevenue)} pending
          </p>
        </div>

        <div className="group relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10">
          <div className="flex items-center justify-between z-10 relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
              Recorded Rate
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-400 z-10 relative">
            {registrations.length > 0
              ? `${Math.round(
                  (summary.recordedCount / registrations.length) * 100
                )}%`
              : "0%"}
          </p>
          <p className="mt-1 text-xs text-emerald-400/70 z-10 relative">
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
            placeholder="Search reg code, team name, captain, UTR…"
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
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Code / Team", "Event", "Captain", "Fee Amount", "UTR / Proof", "Status", "Action"].map(
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
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <Receipt className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No payments found</p>
                    <p className="mt-1 text-xs text-muted">No payment records match your current filters.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const ev = events.find((e) => e.id === r.eventId);
                  const proofPath = r.paymentScreenshotPath ?? r.paymentScreenshotUrl;

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
                        <div className="flex flex-col gap-1">
                          {r.utrNumber ? (
                            <div className="flex items-center gap-1.5">
                              <code className="font-mono text-xs text-foreground bg-white/[0.05] px-1.5 py-0.5 rounded">
                                {r.utrNumber}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyUtr(r.utrNumber!)}
                                className="text-muted hover:text-foreground transition-colors p-0.5"
                                title="Copy UTR"
                              >
                                {copiedUtr === r.utrNumber ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                          {proofPath && (
                            <button
                              type="button"
                              onClick={() => setSelectedProof(r)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-soft hover:underline w-fit"
                            >
                              <ImageIcon className="h-3 w-3" /> View Proof
                            </button>
                          )}
                        </div>
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
                        <div className="flex flex-col gap-1.5 items-start">
                          <button
                            onClick={() => togglePaymentStatus(r)}
                            disabled={busyId === r.id}
                            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
                              r.paymentStatus === "recorded"
                                ? "border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                                : "border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                            }`}
                          >
                            {busyId === r.id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" /> Updating…
                              </>
                            ) : r.paymentStatus === "recorded" ? (
                              "Mark Pending"
                            ) : (
                              "Mark Paid"
                            )}
                          </button>
                          {r.paymentStatus === "pending" && proofPath && (
                            <button
                              type="button"
                              onClick={() => setReuploadTarget(r)}
                              disabled={busyId === r.id}
                              className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                            >
                              <RefreshCcw className="h-3 w-3" /> Request Re-upload
                            </button>
                          )}
                        </div>
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

