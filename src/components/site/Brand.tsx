import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

export function Brand({
  className,
  logoClass = "h-9 w-auto",
}: {
  className?: string;
  logoClass?: string;
}) {
  return (
    <Link to="/" className={cn("group flex items-center gap-2.5", className)} aria-label="TechTrove 3.0 home">
      <img
        src="/images/techtrove-logo.jpg"
        alt=""
        className={cn("w-auto object-contain", logoClass)}
      />
      <span className="display text-xl tracking-wide text-foreground group-hover:text-primary-soft transition-colors">
        TechTrove 3.0
      </span>
    </Link>
  );
}
