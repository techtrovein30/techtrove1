import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // A03: Escape-to-cancel for the alert dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const titleId = "confirm-dialog-title";
  const descId = "confirm-dialog-desc";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-[#1a1010] p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div>
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <div id={descId} className="mt-2 text-sm text-muted">{description}</div>
            
            <div className="mt-6 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 rounded border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 rounded bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
