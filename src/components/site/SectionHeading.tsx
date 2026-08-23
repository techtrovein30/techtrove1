import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SectionHeadingProps {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeading({ eyebrow, title, lead, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-6", className)}>
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display mt-3 text-4xl text-foreground sm:text-5xl lg:text-6xl">{title}</h2>
        {lead && <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{lead}</p>}
        <hr className="rule-line mt-6 w-40" />
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
