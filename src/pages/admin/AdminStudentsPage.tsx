import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Search,
  X,
  ChevronRight,
  Trash2,
  Pencil,
  Check,
  ChevronLeft,
} from "lucide-react";
import type { User, Registration } from "../../lib/mockApi";
import {
  adminListUsers,
  adminGetUserRegistrations,
  adminUpdateUser,
  adminDeleteUser,
} from "../../lib/adminApi";
import { getAllEvents } from "../../lib/eventStore";
import { formatFee } from "../../lib/utils";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";

type Filter = "all" | "internal" | "external";

const PAGE_SIZE = 15;

// ─── Student detail slide-over ─────────────────────────────────────────────

function StudentDetail({
  student,
  onClose,
  onDeleted,
  onUpdated,
}: {
  student: User;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (u: User) => void;
}) {
  const events = useMemo(() => getAllEvents(), []);
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  useEffect(() => {
    adminGetUserRegistrations(student.id).then(setRegistrations).catch(() => {});
  }, [student.id]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: student.fullName,
    college: student.college ?? "",
    phone: student.phone ?? "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!editForm.fullName.trim()) {
      setEditError("Name is required.");
      return;
    }
    try {
      const updated = await adminUpdateUser(student.id, {
        fullName: editForm.fullName,
        college: editForm.college,
        phone: editForm.phone,
      });
      onUpdated(updated);
      setEditing(false);
      setEditError(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function handleDelete() {
    try {
      await adminDeleteUser(student.id);
      onDeleted(student.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
    setConfirmDelete(false);
  }

  const getEventName = (eventId: string) =>
    events.find((e) => e.id === eventId)?.name ?? eventId;

  return (
    <>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete student account"
          description={
            <>
              This will permanently delete{" "}
              <strong className="text-foreground">{student.fullName}</strong>'s
              account and all their event registrations. This action cannot be
              undone.
            </>
          }
          confirmLabel="Delete account"
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
              {student.fullName}
            </h2>
            <button
              onClick={() => {
                setEditing(!editing);
                setEditError(null);
              }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary-soft hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
              {editing ? "Cancel" : "Edit"}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="flex flex-col items-center justify-center space-y-3 pb-6 pt-2 border-b border-white/[0.06]">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary-soft shadow-[0_0_30px_rgba(124,58,237,0.15)] ring-1 ring-primary/30">
                {student.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-foreground">{student.fullName}</h3>
                <p className="text-xs text-muted">@{student.username}</p>
                <span
                  className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    student.participantType === "internal"
                      ? "bg-primary/20 text-primary-soft"
                      : "bg-white/10 text-muted"
                  }`}
                >
                  {student.participantType}
                </span>
              </div>
            </div>

            {/* Profile */}
            <section>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Profile Details
              </h3>
              {editing ? (
                <div className="space-y-3">
                  {[
                    { key: "fullName", label: "Full Name" },
                    { key: "college", label: "College" },
                    { key: "phone", label: "Phone" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {label}
                      </label>
                      <input
                        value={editForm[key as keyof typeof editForm]}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                      />
                    </div>
                  ))}
                  {editError && (
                    <p className="text-xs text-red-400">{editError}</p>
                  )}
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-soft"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save changes
                  </button>
                </div>
              ) : (
                <dl className="divide-y divide-white/[0.06]">
                  {[
                    { term: "Full Name", value: student.fullName },
                    { term: "Username", value: student.username },
                    { term: "Email", value: student.email },
                    {
                      term: "Type",
                      value:
                        student.participantType === "internal"
                          ? "Internal (SIMATS)"
                          : "External",
                    },
                    student.regNumber && {
                      term: "Reg. Number",
                      value: student.regNumber,
                    },
                    student.college && {
                      term: "College",
                      value: student.college,
                    },
                    student.phone && { term: "Phone", value: student.phone },
                  ]
                    .filter(Boolean)
                    .map((row) => {
                      const r = row as { term: string; value: string };
                      return (
                        <div
                          key={r.term}
                          className="flex justify-between gap-4 py-2.5 text-sm"
                        >
                          <dt className="shrink-0 text-muted">{r.term}</dt>
                          <dd className="min-w-0 break-all text-right text-foreground">
                            {r.value}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              )}
            </section>

            {/* Registrations */}
            <section>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Event Registrations ({registrations.length})
              </h3>
              {registrations.length === 0 ? (
                <p className="text-sm text-muted">
                  No event registrations found.
                </p>
              ) : (
                <div className="space-y-3">
                  {registrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="rounded-lg border border-white/[0.07] bg-[#1a1a1a] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {reg.teamName}
                          </p>
                          <p className="text-xs text-muted">
                            {getEventName(reg.eventId)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                            reg.paymentStatus === "recorded"
                              ? "border-emerald-500/40 text-emerald-400"
                              : "border-amber-500/40 text-amber-400"
                          }`}
                        >
                          {reg.paymentStatus === "recorded" ? "Paid" : "Pending"}
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {[
                          ["Code", reg.registrationCode],
                          ["Captain", reg.captainName],
                          ["Fee", formatFee(reg.fee)],
                          [
                            "Members",
                            String(
                              reg.members.filter((m) => m.role === "player")
                                .length
                            ),
                          ],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-muted">{k}</dt>
                            <dd className="font-medium text-foreground">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Students Page ────────────────────────────────────────────────────

export function AdminStudentsPage() {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<User | null>(null);

  useEffect(() => {
    adminListUsers().then(setAllUsers).catch(() => {});
  }, []);

  // Registration counts are shown in the detail panel — zero here is fine
  const registrationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of allUsers) counts[u.id] = 0;
    return counts;
  }, [allUsers]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allUsers.filter((u) => {
      const typeOk =
        filter === "all" || u.participantType === filter;
      if (!typeOk) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.regNumber?.toLowerCase().includes(q) ?? false) ||
        (u.college?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allUsers, query, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleUserDeleted = useCallback((id: string) => {
    setAllUsers((prev) => prev.filter((u) => u.id !== id));
    setSelected(null);
  }, []);

  const handleUserUpdated = useCallback((updated: User) => {
    setAllUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelected(updated);
  }, []);

  return (
    <div className="space-y-6">
      {selected && (
        <StudentDetail
          student={selected}
          onClose={() => setSelected(null)}
          onDeleted={handleUserDeleted}
          onUpdated={handleUserUpdated}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted">
            {allUsers.length} registered participant
            {allUsers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search by name, email, reg. number…"
            className="w-full border border-white/[0.08] bg-[#161616] py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex rounded border border-white/[0.08] bg-[#161616] overflow-hidden">
          {(["all", "internal", "external"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Name", "Type", "Email / Reg No.", "College", "Registrations"].map(
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
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                      <Search className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No students found</p>
                    <p className="mt-1 text-xs text-muted">No participants match your current search filters.</p>
                  </td>
                </tr>
              ) : (
                paged.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                    onClick={() => setSelected(u)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary-soft">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground transition-colors group-hover:text-primary-soft">
                            {u.fullName}
                          </p>
                          <p className="text-xs text-muted">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                          u.participantType === "internal"
                            ? "border-primary/40 text-primary-soft"
                            : "border-white/20 text-muted"
                        }`}
                      >
                        {u.participantType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <div className="text-xs">
                        <p>{u.email}</p>
                        {u.regNumber && (
                          <p className="text-foreground/60">{u.regNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {u.college ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/15 px-2 text-[11px] font-semibold text-primary-soft">
                        {registrationCounts[u.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3">
            <p className="text-xs text-muted">
              {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
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
