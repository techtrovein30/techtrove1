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
      className={`group relative overflow-hidden rounded-xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 ${
        accent
          ? "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10"
          : "border-white/[0.07] bg-[#161616] hover:border-white/[0.15]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="z-10 relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors group-hover:text-foreground/80">
            {label}
          </p>
          <p
            className={`mt-2 text-3xl font-bold tracking-tight ${
              accent ? "text-primary-soft drop-shadow-[0_0_12px_rgba(167,139,250,0.15)]" : "text-foreground"
            }`}
          >
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted/80">{sub}</p>}
        </div>
        <div
          className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${
            accent ? "bg-primary/20 shadow-[0_0_15px_rgba(167,139,250,0.2)]" : "bg-white/[0.05]"
          }`}
        >
          <Icon
            className={`h-4 w-4 ${accent ? "text-primary-soft" : "text-muted group-hover:text-foreground/80"}`}
            aria-hidden
          />
        </div>
      </div>
      
      {/* Decorative gradient blob */}
      {accent && (
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/20 blur-2xl transition-opacity duration-300 group-hover:bg-primary/30" aria-hidden="true" />
      )}
    </div>
  );
}
