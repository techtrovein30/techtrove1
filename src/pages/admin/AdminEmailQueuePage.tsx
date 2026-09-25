import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Zap,
} from "lucide-react";
import {
  adminEmailQueueCounts,
  adminEmailQueueControl,
  adminEmailQueueRetry,
  adminEmailQueueSetPaused,
  adminKickEmailBatch,
  adminListEmailQueue,
  type EmailQueueCounts,
  type EmailQueueRow,
} from "../../lib/emailQueue";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { formatFee } from "../../lib/utils";

const PAGE_SIZE = 25;

const STATUS_META: Record<EmailQueueRow["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-amber-500/40 bg-amber-500/15 text-amber-300" },
  sending: { label: "Sending", cls: "border-sky-500/40 bg-sky-500/15 text-sky-300" },
  sent: { label: "Sent", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  failed: { label: "Failed", cls: "border-red-500/40 bg-red-500/15 text-red-300" },
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminEmailQueuePage() {
  const [rows, setRows] = useState<EmailQueueRow[]>([]);
  const [counts, setCounts] = useState<EmailQueueCounts | null>(null);
  const [paused, setPaused] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [kickMsg, setKickMsg] = useState<string | null>(null);

  function fetchAll(): Promise<void> {
    return Promise.all([
      adminListEmailQueue(),
      adminEmailQueueCounts(),
      adminEmailQueueControl(),
    ])
      .then(([mailRows, mailCounts, control]) => {
        setRows(mailRows);
        setCounts(mailCounts);
        setPaused(control.paused);
        setErrorMsg(null);
      })
      .catch((e) => {
        setErrorMsg(
          e instanceof Error
            ? `${e.message} — the email system SQL (query_email_system.txt) may not be applied yet.`
            : "Could not load the email queue.",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel(`admin-email-queue-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_outbox" },
        () => void fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_queue_control" },
        () => void fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function togglePause() {
    setBusy(true);
    try {
      const result = await adminEmailQueueSetPaused(!paused);
      setPaused(result);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not update pause state.");
    } finally {
      setBusy(false);
    }
  }

  async function retryRow(id: number) {
    setBusy(true);
    try {
      await adminEmailQueueRetry(id);
      await fetchAll();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not retry the job.");
    } finally {
      setBusy(false);
    }
  }

  async function kickBatch() {
    setBusy(true);
    setKickMsg(null);
    try {
      const r = await adminKickEmailBatch();
      if (r.enabled === false) {
        setKickMsg(
          "Sending is disabled server-side (EMAIL_SENDING_ENABLED is not true) — nothing was sent.",
        );
      } else if (r.paused === true) {
        setKickMsg("The queue is paused — nothing was sent. Resume first.");
      } else if (r.stopped) {
        setKickMsg(`Stopped: ${r.stopped} — batch not sent.`);
      } else if (r.sent === 0 && r.failed === 0 && r.skipped === 0) {
        setKickMsg("No email was sent (batch was empty).");
      } else {
        setKickMsg(
          `Batch result: attempted ${r.batchAttempted ?? 0}, sent ${r.sent ?? 0}, ` +
            `failed ${r.failed ?? 0}, skipped ${r.skipped ?? 0}. ` +
            `Today: ${r.sentToday ?? 0}/${r.dailyLimit ?? 200}. ` +
            `Pending now: ${r.counts?.pending ?? "?"}.`,
        );
      }
      await fetchAll();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not trigger the email batch.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.registrationCode.toLowerCase().includes(q) ||
        (r.recipientEmail ?? "").toLowerCase().includes(q) ||
        (r.teamName ?? "").toLowerCase().includes(q) ||
        r.eventNames.some((e) => e.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [filterKey, setFilterKey] = useState("");
  const currentKey = query;
  if (currentKey !== filterKey) {
    setFilterKey(currentKey);
    setPage(1);
  }

  const summary = [
    { key: "pending" as const, label: "Pending", value: counts?.pending ?? 0 },
    { key: "sending" as const, label: "Sending", value: counts?.sending ?? 0 },
    { key: "sent" as const, label: "Sent", value: counts?.sent ?? 0 },
    { key: "failed" as const, label: "Failed", value: counts?.failed ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Queue</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Confirmation emails queued by the payment trigger. Sending is capped
            at 200 participant emails / 24 hours and is disabled until the
            server-side <code className="text-primary-soft">EMAIL_SENDING_ENABLED</code>{" "}
            flag and Gmail credentials are configured.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchAll()}
            className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#161616] px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-foreground"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void kickBatch()}
            disabled={busy || loading}
            className="flex items-center gap-1.5 rounded border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary-soft transition-colors hover:bg-primary/25 disabled:opacity-40"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden /> Send next batch
          </button>
          <button
            type="button"
            onClick={() => void togglePause()}
            disabled={busy || loading}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40",
              paused
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
            )}
          >
            {paused ? (
              <>
                <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Resume sending
              </>
            ) : (
              <>
                <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Pause sending
              </>
            )}
          </button>
        </div>
      </div>

      {/* Hint when paused */}
      {paused && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          The queue is <strong>paused</strong>. Jobs stay queued and nothing is
          sent. Resuming only lifts this pause — production sending additionally
          requires <code>EMAIL_SENDING_ENABLED=true</code> and Gmail credentials.
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {kickMsg && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary-soft">
          {kickMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div
            key={s.key}
            className={cn(
              "rounded-xl border border-white/[0.07] bg-[#161616] px-4 py-3",
              s.key === "failed" && s.value > 0 && "border-red-500/40",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              {s.label}
            </p>
            <p
              className={cn(
                "mt-1 font-mono text-2xl font-bold",
                s.key === "failed"
                  ? s.value > 0
                    ? "text-red-400"
                    : "text-foreground"
                  : "text-foreground",
              )}
            >
              {loading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by registration code, email, team, event…"
            className="w-full border border-white/[0.08] bg-[#161616] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none focus:border-primary/60"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Status", "Registration", "Recipient", "Events", "Attempts / Error", "Provider ID", "Queue / Sent"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted">
                    Loading…
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <Mail className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">
                      No email jobs
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Queued confirmations will appear here (also via the existing-user backfill).
                    </p>
                  </td>
                </tr>
              ) : (
                paged.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.id} className="align-top transition-colors hover:bg-white/[0.025]">
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                            meta.cls,
                          )}
                        >
                          <Send className="h-3 w-3" aria-hidden />
                          {meta.label}
                        </span>
                        {r.status === "failed" && (
                          <button
                            type="button"
                            onClick={() => void retryRow(r.id)}
                            disabled={busy}
                            className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary-soft transition-colors hover:text-primary disabled:opacity-40"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden /> Retry
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-primary-soft">
                          {r.registrationCode}
                        </p>
                        {r.teamName && (
                          <p className="mt-0.5 text-xs text-muted">
                            {r.teamName}
                            {r.totalFee > 0 ? ` · ${formatFee(r.totalFee)}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="text-foreground">{r.recipientEmail ?? "—"}</p>
                        {r.recipientName && (
                          <p className="text-muted">{r.recipientName}</p>
                        )}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.eventNames.length > 0 ? (
                            r.eventNames.map((e) => (
                              <span
                                key={e}
                                className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5"
                              >
                                {e}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="text-muted">{r.attempts}</p>
                        {r.lastError && (
                          <p
                            className="mt-1 max-w-[220px] text-[11px] leading-snug text-red-300/90"
                            title={r.lastError}
                          >
                            {r.lastError}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted">
                        {r.providerMessageId ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[11px] text-muted">
                        <p>Queued {formatWhen(r.createdAt)}</p>
                        {r.sentAt && <p>Sent {formatWhen(r.sentAt)}</p>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
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
                ‹
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] text-muted disabled:opacity-30 hover:text-foreground"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}