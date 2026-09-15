import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  ToastContext,
  type ToastItem,
  type ToastKind,
  type ToastContextValue,
} from "./toastContext";

const TOAST_ICON: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" aria-hidden />,
  error: <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-red-400" aria-hidden />,
  info: <Info className="h-4.5 w-4.5 shrink-0 text-primary-soft" aria-hidden />,
};

const TOAST_LIFETIME: Record<ToastKind, number> = {
  success: 3500,
  info: 3500,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    // Fade out first, then remove from the tree.
    setToasts((list) =>
      list.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 240);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, kind, message, leaving: false }]);
      window.setTimeout(() => dismiss(id), TOAST_LIFETIME[kind]);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    success: useCallback((m) => push("success", m), [push]),
    error: useCallback((m) => push("error", m), [push]),
    info: useCallback((m) => push("info", m), [push]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-20 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "panel pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3",
              t.leaving ? "toast-out" : "toast-in",
              t.kind === "error" && "toast-error"
            )}
          >
            <span className="mt-0.5">{TOAST_ICON[t.kind]}</span>
            <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-muted transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}