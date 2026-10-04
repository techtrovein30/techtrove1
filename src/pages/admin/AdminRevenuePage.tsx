import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  ShieldCheck,
  Search,
  ArrowRight,
  TrendingUp,
  RefreshCcw,
  CalendarDays,
} from "lucide-react";
import { getAdminStats, type AdminStats } from "../../lib/adminApi";
import { useAllEvents } from "../../lib/useEvents";
import { formatFee } from "../../lib/utils";
import { StatCard } from "../../components/admin/StatCard";
import { ProofModal } from "../../components/admin/ProofModal";
import { supabase } from "../../lib/supabase";

export function AdminRevenuePage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);
  const [selectedProof, setSelectedProof] = useState<{
    path: string;
    utr: string;
    title: string;
    createdAt?: string;
  } | null>(null);
  const [utrSearch, setUtrSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "duplicates">("overview");

  const { events } = useAllEvents();

  function copyUtr(utr: string) {
    navigator.clipboard.writeText(utr).then(() => {
      setCopiedUtr(utr);
      setTimeout(() => setCopiedUtr(null), 2000);
    });
  }

  function loadStats() {
    return getAdminStats()
      .then((data) => {
        setStats(data);
        setErrorMsg(null);
      })
      .catch((e) => {
        console.error("Revenue page error:", e);
        setErrorMsg("Could not load revenue statistics. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function handleManualRefresh() {
    setRefreshing(true);
    loadStats().finally(() => setRefreshing(false));
  }

  useEffect(() => {
    let lastLoadAt = Date.now();
    const markLoaded = () => {
      lastLoadAt = Date.now();
    };

    loadStats();

    // Same reasoning as the dashboard: refetching on every window focus pulled
    // both registration tables in full each time an admin tabbed away and back.
    // The realtime subscription below keeps these figures current, so focus only
    // needs to cover a socket that dropped while the tab was backgrounded.
    const FOCUS_RELOAD_STALE_MS = 30_000;
    const onFocus = () => {
      if (Date.now() - lastLoadAt >= FOCUS_RELOAD_STALE_MS) {
        markLoaded();
        loadStats();
      }
    };
    window.addEventListener("focus", onFocus);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        markLoaded();
        loadStats();
      }, 500);
    };

    const channel = supabase
      .channel("admin-revenue-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations_external" },
        debouncedLoad
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations_internal" },
        debouncedLoad
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredRepeatedUtrs = useMemo(() => {
    if (!stats) return [];
    const q = utrSearch.trim().toLowerCase();
    if (!q) return stats.repeatedUtrs;
    return stats.repeatedUtrs.filter(
      (g) =>
        g.utrNumber.toLowerCase().includes(q) ||
        g.registrations.some(
          (r) =>
            r.registrationCode.toLowerCase().includes(q) ||
            r.teamName.toLowerCase().includes(q) ||
            r.captainName.toLowerCase().includes(q) ||
            (r.userEmail && r.userEmail.toLowerCase().includes(q))
        )
    );
  }, [stats, utrSearch]);

  const totalFeeAtRisk = useMemo(() => {
    if (!stats?.repeatedUtrs) return 0;
    return stats.repeatedUtrs.reduce((acc, g) => acc + (g.totalFeeAtRisk || 0), 0);
  }, [stats]);

  const totalFlaggedRegistrations = useMemo(() => {
    if (!stats?.repeatedUtrs) return 0;
    return stats.repeatedUtrs.reduce((acc, g) => acc + g.occurrences, 0);
  }, [stats]);

  // Per-event revenue breakdown computation
  const eventRevenueData = useMemo(() => {
    if (!events.length || !stats) return [];
    return events
      .map((ev) => {
        const regCount = stats.perEvent[ev.id] ?? 0;
        // An approximation based on recorded registrations for this event
        const estimatedRevenue = regCount * (ev.registrationFee || 0);
        return {
          id: ev.id,
          name: ev.name,
          category: ev.category,
          fee: ev.registrationFee,
          registrations: regCount,
          estimatedRevenue,
          open: ev.registrationOpen,
        };
      })
      .sort((a, b) => b.registrations - a.registrations);
  }, [events, stats]);

  if (loading && !stats) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">
        <div className="flex flex-col items-center gap-2">
          <RefreshCcw className="h-6 w-6 animate-spin text-primary-soft" />
          <span className="text-sm">Loading Revenue Dashboard...</span>
        </div>
      </div>
    );
  }

  if (errorMsg && !stats) {
    return (
      <div className="flex flex-col h-64 items-center justify-center text-red-500 gap-4">
        <AlertTriangle className="h-8 w-8" />
        <p className="font-bold">Unable to load revenue metrics.</p>
        <p className="font-mono text-sm bg-black/20 p-4 rounded-md">{errorMsg}</p>
        <button
          onClick={handleManualRefresh}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-white/[0.06] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary-soft">
              <TrendingUp className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-soft">
              Financial Management
            </p>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Revenue & UTR Audit
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Track total revenue collected, monitor pending collections, and resolve duplicate
            transaction UTRs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary-soft" : "text-muted"}`}
            />
            Refresh
          </button>
          <Link
            to="/wasd4381/payments"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all hover:bg-primary-soft hover:shadow-[0_0_20px_rgba(124,58,237,0.5)]"
          >
            <CreditCard className="h-4 w-4" />
            View All Payments
          </Link>
        </div>
      </div>

      {/* Primary Revenue Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue Collected"
          value={formatFee(stats.totalRevenue)}
          sub={`${stats.recordedPayments} recorded external payments`}
          icon={CreditCard}
          accent
        />
        <StatCard
          label="Pending Payments"
          value={stats.pendingPayments}
          sub="External payments awaiting review"
          icon={Clock}
        />
        <StatCard
          label="Recorded Payments"
          value={stats.recordedPayments}
          sub={`from ${stats.totalRegistrations} total registrations`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Duplicate UTRs Flagged"
          value={stats.repeatedUtrs.length}
          sub={
            stats.repeatedUtrs.length > 0
              ? `${formatFee(totalFeeAtRisk)} at risk across ${totalFlaggedRegistrations} entries`
              : "0 duplicate UTRs detected"
          }
          icon={AlertTriangle}
          accent={stats.repeatedUtrs.length > 0}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/[0.08] gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "overview"
              ? "border-primary text-primary-soft"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Revenue Overview & Events
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("duplicates")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === "duplicates"
              ? "border-primary text-primary-soft"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Duplicate UTR Audit
          {stats.repeatedUtrs.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              {stats.repeatedUtrs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Revenue Overview & Per-Event Breakdown */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Duplicate UTR Quick Alert Banner if duplicates exist */}
          {stats.repeatedUtrs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Attention: {stats.repeatedUtrs.length} Duplicate UTR{" "}
                    {stats.repeatedUtrs.length === 1 ? "Group" : "Groups"} Flagged
                  </h3>
                  <p className="text-xs text-muted">
                    {totalFlaggedRegistrations} registrations share reused transaction IDs (
                    {formatFee(totalFeeAtRisk)} at risk).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("duplicates")}
                className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-amber-500/40 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30"
              >
                Inspect Duplicates <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Event-Level Revenue Table */}
          <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5 shadow-sm">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary-soft" />
                  Per-Event Revenue Analysis
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Registrations and potential fee generation across all active festival events.
                </p>
              </div>
              <span className="text-xs font-mono text-muted">{events.length} Total Events</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="pb-3 pr-4">Event Name</th>
                    <th className="pb-3 px-4">Category</th>
                    <th className="pb-3 px-4 text-right">Fee / Entry</th>
                    <th className="pb-3 px-4 text-right">Registrations</th>
                    <th className="pb-3 px-4 text-right">Est. Volume</th>
                    <th className="pb-3 pl-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {eventRevenueData.map((ev) => (
                    <tr key={ev.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-semibold text-foreground">
                        <Link
                          to={`/wasd4381/registrations?event=${encodeURIComponent(ev.id)}`}
                          className="hover:text-primary-soft hover:underline transition-colors"
                        >
                          {ev.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-muted capitalize">{ev.category}</td>
                      <td className="py-3 px-4 text-right font-mono text-foreground">
                        {ev.fee ? (
                          formatFee(ev.fee)
                        ) : (
                          <span className="text-emerald-400">Free</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-foreground">
                        {ev.registrations}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-primary-soft">
                        {ev.estimatedRevenue > 0 ? formatFee(ev.estimatedRevenue) : "—"}
                      </td>
                      <td className="py-3 pl-4 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                            ev.open
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}
                        >
                          {ev.open ? "Open" : "Closed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Duplicate UTR Section */}
      {activeTab === "duplicates" && (
        <div className="space-y-6">
          {stats.repeatedUtrs.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/20 text-emerald-400">
                    <ShieldCheck className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-foreground">
                        Transaction UTR Integrity: 100% Unique
                      </h2>
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-300">
                        0 duplicates
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted max-w-xl">
                      Zero duplicate transaction IDs detected across all registrations in the
                      database. Every recorded and pending UTR is verified unique.
                    </p>
                  </div>
                </div>
                <Link
                  to="/wasd4381/payments"
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  View Payments <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.02] p-5 shadow-[0_0_30px_rgba(245,158,11,0.08)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
                <div className="flex items-start sm:items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
                    <AlertTriangle className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-foreground">
                        Duplicate Transaction UTRs Detected
                      </h2>
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                        {stats.repeatedUtrs.length}{" "}
                        {stats.repeatedUtrs.length === 1 ? "group" : "groups"} ·{" "}
                        {totalFlaggedRegistrations} registrations
                      </span>
                      <span className="rounded-full border border-red-500/40 bg-red-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-red-300">
                        {formatFee(totalFeeAtRisk)} at risk
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      These UTR / Transaction IDs were submitted across 2 or more different
                      registrations. Review immediately to prevent duplicate payment approvals.
                    </p>
                  </div>
                </div>
                <Link
                  to="/wasd4381/payments"
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-amber-500/40 bg-amber-500/15 px-3.5 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/25"
                >
                  Go to Payments <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Quick search */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                <input
                  type="text"
                  value={utrSearch}
                  onChange={(e) => setUtrSearch(e.target.value)}
                  placeholder="Search duplicate UTR number, registration code, team, or captain..."
                  className="w-full rounded-lg border border-white/10 bg-black/40 pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-amber-500/50 focus:outline-none"
                />
              </div>

              <div className="mt-4 space-y-3">
                {filteredRepeatedUtrs.map((group) => (
                  <div
                    key={group.utrNumber}
                    className="rounded-lg border border-white/[0.08] bg-black/40 p-4 transition-colors hover:border-amber-500/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          UTR Number:
                        </span>
                        <code className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-mono text-sm font-bold text-amber-300">
                          {group.utrNumber}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyUtr(group.utrNumber)}
                          title="Copy UTR"
                          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-muted transition-colors hover:border-amber-500/40 hover:text-amber-300"
                        >
                          {copiedUtr === group.utrNumber ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-medium text-amber-300">
                          Reused in {group.occurrences} separate registrations
                        </span>
                        <span className="text-xs font-mono font-semibold text-muted">
                          Total: {formatFee(group.totalFeeAtRisk)}
                        </span>
                        <Link
                          to={`/wasd4381/payments?q=${encodeURIComponent(group.utrNumber)}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-soft hover:text-primary transition-colors"
                        >
                          Filter in Payments <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {group.registrations.map((reg) => {
                        const ev = events.find((e) => e.id === reg.eventId);
                        return (
                          <div
                            key={reg.registrationCode}
                            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs transition-colors hover:border-white/[0.12]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-primary-soft">
                                {reg.registrationCode}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                  reg.paymentStatus === "recorded"
                                    ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                    : "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                                }`}
                              >
                                {reg.paymentStatus === "recorded" ? "Paid" : "Pending"}
                              </span>
                            </div>
                            <p className="mt-1 font-semibold text-foreground truncate">
                              {reg.teamName}
                            </p>
                            <p className="text-[11px] text-muted truncate">
                              Captain: {reg.captainName} · {ev?.name ?? reg.eventId}
                            </p>
                            {(reg.userEmail || reg.userPhone) && (
                              <p className="text-[10px] text-muted/80 truncate mt-0.5 font-mono">
                                {[reg.userEmail, reg.userPhone].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-1.5 text-[11px] text-muted">
                              <span className="font-medium text-foreground">
                                {formatFee(reg.totalFee)}
                              </span>
                              <div className="flex items-center gap-2">
                                <span>{new Date(reg.createdAt).toLocaleDateString()}</span>
                                {reg.paymentScreenshotPath && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedProof({
                                        path: reg.paymentScreenshotPath!,
                                        utr: group.utrNumber,
                                        title: `${reg.teamName} (${reg.registrationCode})`,
                                        createdAt: reg.createdAt,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[10px] font-medium text-primary-soft hover:bg-white/[0.12] hover:text-foreground transition-colors"
                                  >
                                    <Eye className="h-3 w-3" /> Proof
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Proof Modal */}
      <ProofModal
        isOpen={Boolean(selectedProof)}
        path={selectedProof?.path}
        utrNumber={selectedProof?.utr}
        createdAt={selectedProof?.createdAt}
        title={selectedProof?.title}
        subtitle="Payment Screenshot Review"
        onClose={() => setSelectedProof(null)}
      />
    </div>
  );
}
