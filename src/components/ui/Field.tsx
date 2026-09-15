import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
}

export function Field({ label, required, hint, error, className, id, ...rest }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
        {required && <span className="ml-1 text-primary-soft">*</span>}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          "w-full border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/50 focus:border-primary-soft focus:outline-none",
          error ? "border-red-500/70" : "border-edge",
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
