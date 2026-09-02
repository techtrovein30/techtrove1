import { useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

const REASONS = [
  "Screenshot is unclear",
  "Payment amount is incorrect",
  "Transaction could not be verified",
  "Other",
] as const;

export function ReuploadRequestDialog({
  teamName,
  registrationCode,
  busy,
  onConfirm,
  onCancel,
}: {
  teamName: string;
  registrationCode: string;
  busy: boolean;
  onConfirm: (reason: string, note: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState("");

  // A03: Escape-to-cancel for the dialog (disabled while submitting).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const titleId = "reupload-dialog-title";
  const descId = "reupload-dialog-desc";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-md rounded-xl border border-amber-500/25 bg-[#1a1508] p-6">
        <div className="flex items-start gap-3">
          <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              Request a new screenshot
            </h2>
            <p id={descId} className="mt-1 text-sm text-muted">
              Ask {teamName} ({registrationCode}) to upload a fresh payment
              screenshot. A reason is required so the participant knows what to fix.
            </p>

            <fieldset className="mt-5">
              <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Reason
              </legend>
              <div className="mt-2 space-y-2">
                {REASONS.map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-2.5 border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-foreground transition-colors hover:border-amber-500/40"
                  >
                    <input
                      type="radio"
                      name="reupload-reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="h-3.5 w-3.5 shrink-0 accent-[#a78bfa]"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Note <span className="normal-case text-muted/60">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="e.g. Please upload a clearer screenshot showing the UTR."
                className="mt-1.5 w-full border border-white/10 bg-[#0f0c05] px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500/60"
              />
            </label>

            <div className="mt-5 flex gap-3">
              <button
                onClick={onCancel}
                disabled={busy}
                className="flex-1 rounded border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-foreground disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(reason, note)}
                disabled={busy || !reason.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded bg-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-amber-500 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Request re-upload
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}