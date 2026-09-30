import { useState, useEffect } from "react";
import { X, UserCheck, Search, AlertCircle, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";
import type { TechEvent } from "../../data/techtrove";
import type { EventCoordinator } from "../../lib/coordinatorApi";
import { adminAssignCoordinator } from "../../lib/coordinatorApi";
import { adminListUsers } from "../../lib/adminApi";
import type { User } from "../../lib/api";
import { useToast } from "../ui/toastContext";

interface EventCoordinatorModalProps {
  event: TechEvent;
  currentCoordinator: EventCoordinator | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EventCoordinatorModal({
  event,
  currentCoordinator,
  onClose,
  onSaved,
}: EventCoordinatorModalProps) {
  const toast = useToast();
  const [name, setName] = useState(currentCoordinator?.name ?? "");
  const [email, setEmail] = useState(currentCoordinator?.email ?? "");
  const [mobile, setMobile] = useState(currentCoordinator?.mobile ?? "");
  const [userId, setUserId] = useState(currentCoordinator?.userId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student autocomplete
  const [students, setStudents] = useState<User[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  // Starts true: the list is requested on mount, so there is nothing to show
  // before that request settles.
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [showStudentPicker, setShowStudentPicker] = useState(false);

  useEffect(() => {
    adminListUsers()
      .then((users) => setStudents(users))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, []);

  const filteredStudents = studentSearch.trim()
    ? students.filter(
        (s) =>
          s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
          s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
          (s.phone && s.phone.includes(studentSearch))
      ).slice(0, 6)
    : students.slice(0, 6);

  function handleSelectStudent(student: User) {
    setName(student.fullName);
    setEmail(student.email);
    setMobile(student.phone ?? "");
    setUserId(student.id);
    setShowStudentPicker(false);
    setStudentSearch("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Coordinator Name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("A valid Coordinator Email is required.");
      return;
    }
    if (!mobile.trim() || mobile.replace(/\D/g, "").length < 10) {
      setError("A valid 10-digit Coordinator Mobile Number is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await adminAssignCoordinator({
        eventId: event.id,
        userId: userId.trim() || `usr_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
      });

      toast.success(
        currentCoordinator
          ? `Coordinator updated for ${event.name}`
          : `Coordinator assigned for ${event.name}`
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign coordinator.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#121212] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary-soft">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Event Coordinator Assignment
              </h2>
              <p className="text-xs text-muted">
                {currentCoordinator ? "Change assigned coordinator" : "Assign main coordinator"} for <span className="font-semibold text-foreground">{event.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-white/[0.06] hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Rule reminder */}
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/90 flex gap-2.5 items-start">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Rule: </span>
            Only <strong className="text-white">ONE main coordinator</strong> can be assigned to each event. The coordinator will only have access to participants registered for this event.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Pick from registered students */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Quick Select Registered Student
              </label>
              <button
                type="button"
                onClick={() => setShowStudentPicker(!showStudentPicker)}
                className="text-[11px] font-medium text-primary-soft hover:underline"
              >
                {showStudentPicker ? "Close Picker" : "Search Students"}
              </button>
            </div>

            {showStudentPicker && (
              <div className="mt-2 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or mobile..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#161616] pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted/60 focus:border-primary-soft focus:outline-none"
                  />
                </div>
                {loadingStudents ? (
                  <div className="flex justify-center py-2 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Loading students...
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <p className="py-1 text-center text-xs text-muted">No students found.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {filteredStudents.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudent(s)}
                        className="w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.06] transition-colors text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{s.fullName}</p>
                          <p className="text-[11px] text-muted truncate">{s.email}</p>
                        </div>
                        {s.phone && (
                          <span className="text-[10px] text-muted font-mono ml-2 shrink-0">{s.phone}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
                Event Name
              </label>
              <input
                type="text"
                disabled
                value={event.name}
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-foreground/80 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
                Event ID
              </label>
              <input
                type="text"
                disabled
                value={event.id}
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-mono text-muted cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
              Coordinator Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Johnson"
              className="w-full rounded-lg border border-white/10 bg-[#161616] px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:border-primary-soft focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
                Coordinator Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coordinator@example.com"
                className="w-full rounded-lg border border-white/10 bg-[#161616] px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:border-primary-soft focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
                Coordinator Mobile Number <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile"
                className="w-full rounded-lg border border-white/10 bg-[#161616] px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted/50 focus:border-primary-soft focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
              Coordinator ID / User ID <span className="text-muted/60">(optional, auto-linked)</span>
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. usr_123 or Supabase Auth User ID"
              className="w-full rounded-lg border border-white/10 bg-[#161616] px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted/50 focus:border-primary-soft focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted hover:bg-white/[0.05] hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-soft px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {currentCoordinator ? "Update Coordinator" : "Assign Coordinator"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
