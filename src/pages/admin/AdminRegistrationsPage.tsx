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
  Image as ImageIcon,
  Copy,
  Check,
  Loader2,
  RefreshCcw,
  BadgeCheck,
  Wallet,
} from "lucide-react";
import type { PaymentStatus, Registration } from "../../lib/api";


import {
  adminUpdateRegistrationStatusByCode,
  adminDeleteRegistration,
  adminRequestPaymentReupload,
} from "../../lib/adminApi";
import { useAllEvents } from "../../lib/useEvents";
import { useAdminRegistrations } from "../../lib/useAdminRealtime";
import { formatFee } from "../../lib/utils";
import { toCsv, downloadCsv } from "../../lib/csv";
import { buildStudentRosterCsv } from "../../lib/exportRoster";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { ProofModal } from "../../components/admin/ProofModal";
import { ReuploadRequestDialog } from "../../components/admin/ReuploadRequestDialog";
import { useToast } from "../../components/ui/toastContext";

type StatusFilter = "all" | "pending" | "recorded";
type TypeFilter = "all" | "internal" | "external";
type CategoryFilter = "all" | "Technical" | "Non-Technical" | "Sports";

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All Categories" },
  { value: "Technical", label: "Technical" },
  { value: "Non-Technical", label: "Non-Technical" },
  { value: "Sports", label: "Sports" },
];

function eventMatchesCategory(category: string | undefined, filter: CategoryFilter): boolean {
  if (filter === "all") return true;
  const cat = (category ?? "").toLowerCase();
  if (filter === "Sports") return cat.startsWith("sport");
  if (filter === "Technical") return cat === "technical";
  if (filter === "Non-Technical") return cat === "non-technical";
  return true;
}

/** Participant type for a registration, derived from its first member (the captain). */
function regType(reg: Registration): "internal" | "external" {
  return reg.members[0]?.participantType === "internal" ? "internal" : "external";
}

/** One flat-pass batch: every registration row sharing a registration_code. */
interface BatchGroup {
  code: string;
  rows: Registration[];
  totalFee: number;
  eventNames: string[];
  teamName: string;
  captainName: string;
  createdAt: string;
  paymentStatus: PaymentStatus;
}

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
  const [showProofModal, setShowProofModal] = useState(false);
  const [showReuploadDialog, setShowReuploadDialog] = useState(false);
  const [reuploadBusy, setReuploadBusy] = useState(false);
  const [reuploadBanner, setReuploadBanner] = useState<string | null>(null);
  const [copiedUtr, setCopiedUtr] = useState(false);
  const [busyPayment, setBusyPayment] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  function copyUtr() {
    if (!registration.utrNumber) return;
    navigator.clipboard.writeText(registration.utrNumber).then(() => {
      setCopiedUtr(true);
      setTimeout(() => setCopiedUtr(false), 2000);
    });
  }

  async function togglePaymentStatus() {
    const nextStatus =
      registration.paymentStatus === "recorded" ? "pending" : "recorded";

    // Optimistic UI update
    onUpdated({ ...registration, paymentStatus: nextStatus });
    setBusyPayment(true);

    try {
      // A flat pass covers MULTIPLE events under one registration code (all
      // Tech/Non-Tech events share the code), so record the payment across the
      // whole batch — the participant must see "recorded" on every event.
      await adminUpdateRegistrationStatusByCode(registration.registrationCode, nextStatus);
      onUpdated({ ...registration, paymentStatus: nextStatus });
      if (nextStatus === "recorded") setReuploadBanner(null);
    } catch (err) {
      // Revert optimistic update
      onUpdated(registration);
      setDetailError(err instanceof Error ? err.message : "Payment update failed.");
    } finally {
      setBusyPayment(false);
    }
  }

  async function handleRequestReupload(reason: string, note: string) {
    setReuploadBusy(true);
    setDetailError(null);
    try {
      const updated = await adminRequestPaymentReupload(registration.id, {
        reason,
        note,
      });
      onUpdated(updated);
      setReuploadBanner(
        "Screenshot re-upload requested. The participant has been notified to upload a new screenshot.",
      );
      setShowReuploadDialog(false);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Re-upload request could not be saved.",
      );
    } finally {
      setReuploadBusy(false);
    }
  }

  async function handleDelete() {
    try {
      await adminDeleteRegistration(registration.id);
      onDeleted(registration.id);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Delete failed.");
    }
    setConfirmDelete(false);
  }

  const players = registration.members.filter((m) => m.role === "player");
  const substitutes = registration.members.filter((m) => m.role === "substitute");
  const screenshotPath = registration.paymentScreenshotPath ?? registration.paymentScreenshotUrl;
  const hasReuploadRequest = !!registration.paymentReviewNote;
  const reviewNoteLabel = hasReuploadRequest
    ? registration.paymentReviewNote!.replace(/^RE_UPLOAD_REQUESTED\s*—\s*/, "")
    : "";

  return (
    <>
      {detailError && (
        <div role="alert" className="flex items-start justify-between gap-3 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          <span>{detailError}</span>
          <button
            type="button"
            onClick={() => setDetailError(null)}
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

      {showReuploadDialog && (
        <ReuploadRequestDialog
          teamName={registration.teamName}
          registrationCode={registration.registrationCode}
          busy={reuploadBusy}
          onConfirm={handleRequestReupload}
          onCancel={() => setShowReuploadDialog(false)}
        />
      )}

      {showProofModal && (
        <ProofModal
          isOpen={showProofModal}
          onClose={() => setShowProofModal(false)}
          path={screenshotPath}
          title={`Payment Proof · ${registration.teamName}`}
          subtitle={`Registration ${registration.registrationCode} · ${event?.name ?? registration.eventId}`}
          utrNumber={registration.utrNumber}
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
            <div className="rounded-lg border border-white/[0.07] bg-[#1a1a1a] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Payment Status
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground capitalize">
                    {regType(registration) === "internal"
                      ? "Confirmed"
                      : registration.paymentStatus}
                  </p>
                </div>
                {regType(registration) === "internal" ? (
                  <span className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] border border-primary/40 text-primary-soft">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Free · Auto-confirmed
                  </span>
                ) : (
                <button
                  onClick={togglePaymentStatus}
                  disabled={busyPayment}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
                    registration.paymentStatus === "recorded"
                      ? "border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  }`}
                >
                  {busyPayment ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                    </>
                  ) : registration.paymentStatus === "recorded" ? (
                    <>
                      <Clock className="h-3.5 w-3.5" /> Mark Pending
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                    </>
                  )}
                </button>
                )}
              </div>

              {/* Re-upload requested marker */}
              {hasReuploadRequest && (
                <div className="border-t border-amber-500/30 pt-3">
                  <span className="inline-flex items-center gap-1.5 border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                    <RefreshCcw className="h-3 w-3" aria-hidden />
                    Re-upload requested
                  </span>
                  <p className="mt-1.5 text-xs text-muted">{reviewNoteLabel}</p>
                </div>
              )}

              {/* Payment Proof & UTR Actions */}
              {(registration.utrNumber || screenshotPath) && (
                <div className="border-t border-white/[0.06] pt-3 flex flex-wrap items-center justify-between gap-2">
                  {registration.utrNumber ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-muted">UTR:</span>
                      <code className="font-mono text-xs font-bold text-primary-soft">{registration.utrNumber}</code>
                      <button
                        type="button"
                        onClick={copyUtr}
                        className="text-muted hover:text-foreground transition-colors p-1"
                        title="Copy UTR"
                      >
                        {copiedUtr ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    {screenshotPath && (
                      <button
                        type="button"
                        onClick={() => setShowProofModal(true)}
                        className="inline-flex items-center gap-1.5 rounded bg-primary/20 border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary-soft hover:bg-primary/30 transition-colors"
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> View Screenshot
                      </button>
                    )}
                    {screenshotPath && registration.paymentStatus === "pending" && (
                      <button
                        type="button"
                        onClick={() => setShowReuploadDialog(true)}
                        className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" /> Request Re-upload
                      </button>
                    )}
                  </div>
                </div>
              )}
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
                  ...(registration.utrNumber
                    ? [{ term: "UTR / Transaction ID", value: registration.utrNumber }]
                    : []),
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
  const toast = useToast();

  const { events } = useAllEvents();
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // L13: reset to page 1 whenever a filter or the query changes. Resets state
  // during render (React's recommended pattern) instead of in an effect.
  const [filterKey, setFilterKey] = useState("");
  const currentFilterKey = `${query}:${eventFilter}:${statusFilter}:${typeFilter}:${categoryFilter}`;
  if (currentFilterKey !== filterKey) {
    setFilterKey(currentFilterKey);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return registrations.filter((r) => {
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (statusFilter !== "all" && r.paymentStatus !== statusFilter) return false;
      if (typeFilter !== "all" && regType(r) !== typeFilter) return false;
      if (categoryFilter !== "all") {
        const ev = events.find((e) => e.id === r.eventId);
        if (!ev || !eventMatchesCategory(ev.category, categoryFilter)) return false;
      }
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
  }, [registrations, query, eventFilter, statusFilter, typeFilter, categoryFilter, events]);

  // Group registrations into flat-pass batches keyed by registration_code.
  // Each batch is ONE payment that may cover multiple events, so we collapse
  // the per-event rows into a single row showing the batch total fee.
  const grouped = useMemo<BatchGroup[]>(() => {
    const byCode = new Map<string, Registration[]>();
    for (const r of filtered) {
      const list = byCode.get(r.registrationCode) ?? [];
      list.push(r);
      byCode.set(r.registrationCode, list);
    }

    return Array.from(byCode.values()).map((rows) => {
      const first = rows[0];
      const totalFee = rows.reduce((sum, r) => sum + (r.fee ?? 0), 0);
      const eventNames = rows
        .map((r) => events.find((e) => e.id === r.eventId)?.name ?? r.eventId)
        .filter((n, i, arr) => arr.indexOf(n) === i);
      return {
        code: first.registrationCode,
        rows,
        totalFee,
        eventNames,
        teamName: first.teamName,
        captainName: first.captainName,
        createdAt: first.createdAt,
        paymentStatus: first.paymentStatus,
      };
    });
  }, [filtered, events]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const paged = grouped.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDeleted = useCallback(() => {
    refresh();
    setSelected(null);
  }, [refresh]);

  const handleUpdated = useCallback((updated: Registration) => {
    refresh();
    setSelected(updated);
  }, [refresh]);

  // ─── Bulk selection ───────────────────────────────────────────────────────
  function toggleCode(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const pageCodes = useMemo(() => paged.map((g) => g.code), [paged]);
  const allPageSelected =
    pageCodes.length > 0 && pageCodes.every((code) => selectedCodes.has(code));

  function togglePage() {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageCodes.forEach((code) => next.delete(code));
      } else {
        pageCodes.forEach((code) => next.add(code));
      }
      return next;
    });
  }

  async function bulkMarkPaid() {
    const targets = Array.from(selectedCodes)
      .map((code) => grouped.find((g) => g.code === code))
      .filter(
        (g): g is BatchGroup =>
          !!g && regType(g.rows[0]) === "external" && g.paymentStatus === "pending"
      );

    if (targets.length === 0) {
      toast.info("None of the selected entries are pending external payments.");
      return;
    }

    setBulkBusy(true);
    let done = 0;
    for (const g of targets) {
      try {
        await adminUpdateRegistrationStatusByCode(g.code, "recorded");
        done++;
      } catch {
        // Continue marking the rest even if one batch fails.
      }
    }
    setBulkBusy(false);
    setSelectedCodes(new Set());
    await refresh();
    toast.success(
      done > 0
        ? `${done} payment${done === 1 ? "" : "s"} marked as paid.`
        : "No payments could be marked. Check your connection and try again."
    );
  }

  async function exportCSV() {
    const { headers, rows, filename } = await buildStudentRosterCsv(
      registrations,
      events
    );
    if (rows.length === 0) return;
    downloadCsv(filename, toCsv(headers, rows));
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
            {grouped.length} team entr{grouped.length !== 1 ? "ies" : "y"}
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

      {/* Status summary */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#161616] px-3 py-2 text-muted">
          <Wallet className="h-3.5 w-3.5 text-primary-soft" aria-hidden />
          {grouped.length} total
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-amber-300">
          {grouped.filter((g) => regType(g.rows[0]) === "external" && g.paymentStatus === "pending").length} pending
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-emerald-400">
          {grouped.filter((g) => regType(g.rows[0]) === "external" && g.paymentStatus === "recorded").length} paid
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-primary-soft">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {grouped.filter((g) => regType(g.rows[0]) === "internal").length} auto-confirmed
        </span>
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

        {/* Internal / External filter */}
        <div className="flex rounded border border-white/[0.08] bg-[#161616] overflow-hidden">
          {(["all", "internal", "external"] as TypeFilter[]).map((ty) => (
            <button
              key={ty}
              onClick={() => {
                setTypeFilter(ty);
                setPage(1);
              }}
              className={`px-4 py-2 text-xs font-semibold uppercase tracking-[0.13em] transition-colors ${
                typeFilter === ty
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {ty}
            </button>
          ))}
        </div>

        {/* Tech / Non-Tech / Sports category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value as CategoryFilter);
            setPage(1);
          }}
          className="border border-white/[0.08] bg-[#161616] px-3 py-2.5 text-xs text-foreground outline-none"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedCodes.size > 0 && (
        <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-primary/50 bg-[#1d1429] px-4 py-3 shadow-[0_8px_30px_-8px_rgba(124,58,237,0.4)]">
          <span className="text-sm font-semibold text-foreground">
            {selectedCodes.size} selected
          </span>
          <span className="hidden text-xs text-muted sm:inline">
            Only pending external payments will be affected.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={bulkMarkPaid}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              {bulkBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Mark Paid
            </button>
            <button
              type="button"
              onClick={() => setSelectedCodes(new Set())}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table (desktop) */}
      <div className="hidden overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616] sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allPageSelected}
                    onChange={togglePage}
                    className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
                  />
                </th>
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
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <ClipboardList className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No registrations found</p>
                    <p className="mt-1 text-xs text-muted">No team entries match your current filters.</p>
                  </td>
                </tr>
              ) : (
                paged.map((group) => {
                  const isInternalBatch = regType(group.rows[0]) === "internal";
                  const checked = selectedCodes.has(group.code);
                  return (
                    <tr
                      key={group.code}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.025] ${
                        checked ? "bg-primary/[0.07]" : ""
                      }`}
                      onClick={() => setSelected(group.rows[0])}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${group.teamName}`}
                          checked={checked}
                          onChange={() => toggleCode(group.code)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                              isInternalBatch
                                ? "border border-primary/40 text-primary-soft"
                                : "border border-edge-strong text-muted"
                            }`}
                            title={isInternalBatch ? "Internal (SIMATS)" : "External"}
                          >
                            {regType(group.rows[0])}
                          </span>
                          <div>
                            <p className="font-medium text-foreground">
                              {group.teamName}
                            </p>
                            <p className="text-xs font-mono text-primary-soft">
                              {group.code}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {group.eventNames.length > 1 ? (
                          <div>
                            <span className="text-[10px] uppercase tracking-[0.1em]">
                              {group.eventNames.join(" · ")}
                            </span>
                            <span className="ml-2 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted">
                              {group.eventNames.length}
                            </span>
                          </div>
                        ) : (
                          group.eventNames[0] ?? group.rows[0].eventId
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{group.captainName}</td>
                      <td className="px-4 py-3 text-foreground font-medium">
                        {formatFee(group.totalFee)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                            isInternalBatch
                              ? "border-primary/40 text-primary-soft"
                              : group.paymentStatus === "recorded"
                                ? "border-emerald-500/40 text-emerald-400"
                                : "border-amber-500/40 text-amber-400"
                          }`}
                        >
                          {isInternalBatch
                            ? "Confirmed"
                            : group.paymentStatus === "recorded"
                              ? "Paid"
                              : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {new Date(group.createdAt).toLocaleDateString()}
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
              {Math.min(page * PAGE_SIZE, grouped.length)} of {grouped.length}
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

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {paged.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-sm font-medium text-foreground">No registrations found</p>
            <p className="mt-1 text-xs text-muted">No team entries match your current filters.</p>
          </div>
        ) : (
          paged.map((group) => {
            const isInternalBatch = regType(group.rows[0]) === "internal";
            const checked = selectedCodes.has(group.code);
            return (
              <div
                key={group.code}
                className="rounded-xl border border-white/[0.07] bg-[#161616] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setSelected(group.rows[0])}
                  className="block w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {group.teamName}
                        </p>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                            isInternalBatch
                              ? "border border-primary/40 text-primary-soft"
                              : "border border-edge-strong text-muted"
                          }`}
                        >
                          {isInternalBatch ? "Internal" : "External"}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-primary-soft">{group.code}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-muted">
                        {group.eventNames.join(" · ")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                        isInternalBatch
                          ? "border-primary/40 text-primary-soft"
                          : group.paymentStatus === "recorded"
                            ? "border-emerald-500/40 text-emerald-400"
                            : "border-amber-500/40 text-amber-400"
                      }`}
                    >
                      {isInternalBatch
                        ? "Confirmed"
                        : group.paymentStatus === "recorded"
                          ? "Paid"
                          : "Pending"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3 text-xs">
                    <span className="text-muted">{group.captainName}</span>
                    <span className="font-medium text-foreground">{formatFee(group.totalFee)}</span>
                  </div>
                </button>

                <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
                  <input
                    type="checkbox"
                    id={`bulk-${group.code}`}
                    aria-label={`Select ${group.teamName}`}
                    checked={checked}
                    onChange={() => toggleCode(group.code)}
                    className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
                  />
                  <label
                    htmlFor={`bulk-${group.code}`}
                    className="text-[11px] font-medium text-muted"
                  >
                    Select for bulk action
                  </label>
                </div>
              </div>
            );
          })
        )}

        {/* Mobile pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-1 py-2 text-xs text-muted">
            <p>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, grouped.length)} of{" "}
              {grouped.length}
            </p>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] disabled:opacity-30"
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
