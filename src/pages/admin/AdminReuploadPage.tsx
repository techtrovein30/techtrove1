import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  RefreshCcw,
  Copy,
  Check,
  Receipt,
  ArrowRight,
  Clock,
} from "lucide-react";
import type { Registration } from "../../lib/api";
import { useAllEvents } from "../../lib/useEvents";
import { useAdminRegistrations } from "../../lib/useAdminRealtime";

/** Internal registrations are free + auto-confirmed — never re-uploaded. */
function isExternal(r: Registration): boolean {
  return r.members[0]?.participantType !== "internal";
}

/** Strip the "RE_UPLOAD_REQUESTED — " prefix from the stored review note. */
function reasonOf(note: string): string {
  return note.replace(/^RE_UPLOAD_REQUESTED\s*—\s*/, "");
}

/** One flat-pass batch: every registration row sharing a registration_code. */
interface ReuploadBatch {
  code: string;
  rows: Registration[];
  eventNames: string[];
  teamName: string;
  captainName: string;
  utrNumber?: string;
  note: string;
}

/**
 * Admin "Re-uploads" page — a follow-up queue of every payment the admin has
 * asked to be re-uploaded (RE_UPLOAD_REQUESTED review note set, still pending).
 * Rows drop off this list as soon as the participant re-uploads (the note is
 * cleared server-side), at which point the fresh screenshot is verified on the
 * Payments page.
 */
export function AdminReuploadPage() {
  const { registrations } = useAdminRegistrations();
  const { events } = useAllEvents();
  const [query, setQuery] = useState("");
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const flagged = useMemo<ReuploadBatch[]>(() => {
    const byCode = new Map<string, Registration[]>();
    for (const r of registrations) {
      const needsReupload = r.paymentStatus !== "recorded" && !!r.paymentReviewNote;
      if (!isExternal(r) || !needsReupload) continue;
      const list = byCode.get(r.registrationCode) ?? [];
      list.push(r);
      byCode.set(r.registrationCode, list);
    }

    return Array.from(byCode.values()).map((rows) => {
      const eventNames = rows
        .map((r) => events.find((e) => e.id === r.eventId)?.name ?? r.eventId)
        .filter((n, i, arr) => arr.indexOf(n) === i);
      const representative =
        rows.find((r) => r.utrNumber) ?? rows[0];
      return {
        code: rows[0].registrationCode,
        rows,
        eventNames,
        teamName: rows[0].teamName,
        captainName: rows[0].captainName,
        utrNumber: representative.utrNumber,
        note: reasonOf(rows[0].paymentReviewNote ?? ""),
      };
    });
  }, [registrations, events]);

  // Oldest first — the teams stuck the longest surface at the top.
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return [...flagged]
      .sort(
        (a, b) =>
          new Date(a.rows[0].createdAt).getTime() -
          new Date(b.rows[0].createdAt).getTime(),
      )
      .filter((g) => {
        if (!q) return true;
        const evNames = g.eventNames.join(" ").toLowerCase();
        return (
          g.code.toLowerCase().includes(q) ||
          g.teamName.toLowerCase().includes(q) ||
          g.captainName.toLowerCase().includes(q) ||
          (g.utrNumber?.toLowerCase().includes(q) ?? false) ||
          evNames.includes(q) ||
          g.note.toLowerCase().includes(q)
        );
      });
  }, [flagged, query]);

  function copyUtr(utr: string) {
    navigator.clipboard.writeText(utr).then(() => {
      setCopiedUtr(utr);
      setTimeout(() => setCopiedUtr(null), 2000);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Re-uploads</h1>
          <p className="mt-1 text-sm text-muted">
            Follow-up queue for payments awaiting a fresh screenshot from the participant.
          </p>
        </div>
        <Link
          to="/wasd4381/payments"
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06]"
        >
          Open Payments
          <ArrowRight className="h-4 w-4 text-muted" />
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="group relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 transition-all hover:border-amber-500/50 hover:bg-amber-500/10">
          <div className="flex items-center justify-between z-10 relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400">
              Awaiting Participant
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <RefreshCcw className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-amber-400 z-10 relative">
            {flagged.length}
          </p>
          <p className="mt-1 text-xs text-amber-400/70 z-10 relative">
            registrations the participant has not yet re-uploaded
          </p>
        </div>

        <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/20">
          <div className="flex items-center justify-between z-10 relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Next Step
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-muted">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted z-10 relative">
            After the participant re-uploads, the row moves to{" "}
            <Link to="/wasd4381/payments" className="text-primary-soft hover:underline">
              Payments
            </Link>{" "}
            where you verify the new screenshot and mark the payment as paid.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reg code, team name, captain, UTR, reason…"
          className="w-full border border-white/[0.08] bg-[#161616] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none focus:border-primary/60"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Code / Team", "Event", "Captain", "UTR", "Re-upload Reason", "Status"].map(
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
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <Receipt className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">
                      No re-uploads pending
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {query
                        ? "Nothing matches your search."
                        : "Every requested re-upload has been submitted. Verify them on the Payments page."}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((g) => (
                  <tr key={g.code} className="transition-colors hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{g.teamName}</p>
                        <p className="text-xs font-mono text-primary-soft">{g.code}</p>
                        {g.eventNames.length > 1 && (
                          <p className="mt-0.5 text-[10px] text-muted">
                            {g.eventNames.length} events
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {g.eventNames.length > 1 ? (
                        <span className="text-[10px] uppercase tracking-[0.1em]">
                          {g.eventNames.join(" · ")}
                        </span>
                      ) : (
                        g.eventNames[0] ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{g.captainName}</td>
                    <td className="px-4 py-3">
                      {g.utrNumber ? (
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs text-foreground bg-white/[0.05] px-1.5 py-0.5 rounded">
                            {g.utrNumber}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyUtr(g.utrNumber!)}
                            className="text-muted hover:text-foreground transition-colors p-0.5"
                            title="Copy UTR"
                          >
                            {copiedUtr === g.utrNumber ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-[240px]">
                      {g.note || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400">
                        <RefreshCcw className="h-3 w-3" aria-hidden />
                        Awaiting re-upload
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}