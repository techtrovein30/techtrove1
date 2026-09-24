import { useEffect, useMemo, useState } from "react";
import { Search, Trash2, Users, ClipboardList, ExternalLink } from "lucide-react";
import { adminListDeleteHistory, type DeleteAuditEntry } from "../../lib/adminApi";
import { supabase } from "../../lib/supabase";

type Filter = "all" | "student" | "registration";

const PAGE_SIZE = 20;

function formatWhen(iso: string): string {
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

export function AdminHistoryPage() {
  const [entries, setEntries] = useState<DeleteAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  function fetchHistory() {
    adminListDeleteHistory()
      .then((rows) => {
        setEntries(rows);
        setErrorMsg(null);
      })
      .catch((e) => {
        console.error("[admin] Failed to load deletion history:", e);
        setErrorMsg(
          e instanceof Error
            ? e.message
            : "Could not load deletion history.",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchHistory();
    // Live-update when an admin deletes something in another tab.
    const channel = supabase
      .channel(`admin-delete-audit-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_delete_audit" },
        () => void fetchHistory(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return entries.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!q) return true;
      return (
        e.label.toLowerCase().includes(q) ||
        e.detail.some((d) => d.toLowerCase().includes(q)) ||
        (e.deletedBy?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, query, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 whenever query/filter change (render-phase reset).
  const [filterKey, setFilterKey] = useState("");
  const currentKey = `${query}:${filter}`;
  if (currentKey !== filterKey) {
    setFilterKey(currentKey);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deleted History</h1>
          <p className="mt-1 text-sm text-muted">
            Recently deleted participants and registrations (captured by DB
            audit triggers — this is a live record, so past values stay visible
            even after the rows are gone).
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-muted">
          <Trash2 className="h-3.5 w-3.5 text-red-400/70" aria-hidden />
          {entries.length} deleted {entries.length === 1 ? "record" : "records"}
        </div>
      </div>

      {/* Search + type filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, team, email, code, deleted by…"
            className="w-full border border-white/[0.08] bg-[#161616] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex rounded border border-white/[0.08] bg-[#161616] overflow-hidden">
          {(["all", "student", "registration"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-xs font-semibold uppercase tracking-[0.13em] transition-colors ${
                filter === f
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && !loading && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Type", "Deleted", "Details", "Deleted By", "When"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted">
                    Loading…
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <Trash2 className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">
                      No deletion history
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Nothing has been deleted yet, or nothing matches your filters.
                    </p>
                  </td>
                </tr>
              ) : (
                paged.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                          e.kind === "student"
                            ? "border-primary/40 text-primary-soft"
                            : "border-red-500/40 text-red-400"
                        }`}
                      >
                        {e.kind === "student" ? (
                          <Users className="h-3 w-3" aria-hidden />
                        ) : (
                          <ClipboardList className="h-3 w-3" aria-hidden />
                        )}
                        {e.kind === "student" ? "Student" : "Registration"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{e.label}</p>
                      {e.kind === "student" && !!e.snapshot.username && (
                        <p className="text-xs text-muted">@{String(e.snapshot.username)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {e.detail.length > 0 ? (
                          e.detail.map((d) => (
                            <span
                              key={d}
                              className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5"
                            >
                              {d}
                            </span>
                          ))
                        ) : (
                          <span>—</span>
                        )}
                        {e.kind === "registration" && !!e.snapshot.payment_status && (
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                              String(e.snapshot.payment_status) === "recorded"
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {String(e.snapshot.payment_status)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                        {e.deletedBy ?? "Direct / SQL"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {formatWhen(e.deletedAt)}
                    </td>
                  </tr>
                ))
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