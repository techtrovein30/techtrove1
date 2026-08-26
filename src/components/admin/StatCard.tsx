export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-5 ${
        accent
          ? "border-primary/30 bg-primary/10"
          : "border-white/[0.07] bg-[#161616]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {label}
          </p>
          <p
            className={`mt-2 text-3xl font-bold ${
              accent ? "text-primary-soft" : "text-foreground"
            }`}
          >
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            accent ? "bg-primary/20" : "bg-white/[0.05]"
          }`}
        >
          <Icon
            className={`h-4 w-4 ${accent ? "text-primary-soft" : "text-muted"}`}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
