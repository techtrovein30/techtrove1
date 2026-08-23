import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition-colors duration-200 clip-angle disabled:cursor-not-allowed disabled:opacity-40";

export function PrimaryButton({ className, children, ...rest }: ButtonProps) {
  return (
    <button className={cn(base, "bg-primary text-white hover:bg-primary-soft", className)} {...rest}>
      {children}
    </button>
  );
}

export function GhostButton({ className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        base,
        "border border-edge-strong text-foreground hover:border-primary hover:text-primary-soft",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
