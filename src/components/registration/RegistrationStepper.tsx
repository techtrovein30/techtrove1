import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export const ALL_STEPS = ["sport", "terms", "team", "members", "review", "payment"] as const;
export type StepId = (typeof ALL_STEPS)[number];

const LABELS: Record<StepId, string> = {
  sport: "Event",
  terms: "Terms",
  team: "Team",
  members: "Members",
  review: "Review",
  payment: "Payment",
};

export function RegistrationStepper({ current, steps }: { current: StepId; steps: StepId[] }) {
  const index = steps.indexOf(current);

  return (
    <nav aria-label="Registration progress">
      {/* Desktop */}
      <ol className="hidden items-center md:flex">
        {steps.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={step} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-8 w-8 items-center justify-center border text-xs font-bold",
                    done && "border-primary bg-primary text-white",
                    active && "border-primary-soft bg-primary/15 text-primary-soft",
                    !done && !active && "border-edge text-muted",
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.16em]",
                    active ? "text-foreground" : done ? "text-primary-soft" : "text-muted",
                  )}
                >
                  {LABELS[step]}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn("mx-3 h-px flex-1", done ? "bg-primary/70" : "bg-edge-strong")}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile compact */}
      <div className="md:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Step {index + 1} of {steps.length} ·{" "}
          <span className="text-primary-soft">{LABELS[current]}</span>
        </p>
        <div className="mt-2.5 flex gap-1.5" aria-hidden>
          {steps.map((step, i) => (
            <span key={step} className={cn("h-1 flex-1", i <= index ? "bg-primary" : "bg-edge-strong")} />
          ))}
        </div>
      </div>
    </nav>
  );
}

interface StepShellProps {
  title: string;
  lead?: string;
  children: ReactNode;
}

export function StepShell({ title, lead, children }: StepShellProps) {
  return (
    <section className="clip-angle diag-stripes border border-edge bg-surface p-6 sm:p-9">
      <h2 className="display text-3xl text-foreground sm:text-4xl">{title}</h2>
      {lead && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{lead}</p>}
      <hr className="rule-line mt-5 w-32" />
      <div className="mt-7">{children}</div>
    </section>
  );
}
