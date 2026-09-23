import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  ClipboardList,
  CreditCard,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
  Plus,
  UsersRound,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getAdminStats, type AdminStats } from "../../lib/adminApi";
import { useAllEvents } from "../../lib/useEvents";
import { formatFee } from "../../lib/utils";
import { StatCard } from "../../components/admin/StatCard";
import { supabase } from "../../lib/supabase";

export function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  function copyUtr(utr: string) {
    navigator.clipboard.writeText(utr).then(() => {
      setCopiedUtr(utr);
      setTimeout(() => setCopiedUtr(null), 2000);
    });
  }

  function fetchStats() {
    getAdminStats()
      .then(setStats)
      .catch((e) => {
        console.error("Dashboard error:", e);
        setErrorMsg("Could not load dashboard statistics. Check your connection and try again.");
        setStats(null);
      });
  }

  // ... (keep useEffect and useAllEvents the same)
  useEffect(() => {
    fetchStats();

    // Listen to changes on participant and registration tables
    const channel = supabase
      .channel("admin-dashboard-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_participants" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "external_participants" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations_internal" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations_external" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "registration_members" }, fetchStats)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const { events } = useAllEvents();

  if (errorMsg) {
    return (
      <div className="flex flex-col h-64 items-center justify-center text-red-500 gap-4">
        <p className="font-bold">Unable to load statistics.</p>
        <p className="font-mono text-sm bg-black/20 p-4 rounded-md">{errorMsg}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">
        Loading statistics...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-soft mb-1">
            Command Center
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {user?.fullName?.split(" ")[0] ?? "Admin"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Here's what's happening with TechTrove 3.0 today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/wasd4381/students"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06]"
          >
            <UsersRound className="h-4 w-4 text-muted" />
            Students
          </Link>
          <Link
            to="/wasd4381/events"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all hover:bg-primary-soft hover:shadow-[0_0_20px_rgba(124,58,237,0.5)]"
          >
            <Plus className="h-4 w-4" />
            Manage Events
          </Link>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Students"
          value={stats.totalUsers}
          sub={`${stats.internalUsers} internal · ${stats.externalUsers} external`}
          icon={Users}
        />
        <StatCard
          label="Registrations"
          value={stats.totalRegistrations}
          sub="Total team entries"
          icon={ClipboardList}
        />
        <StatCard
          label="Pending Payments"
          value={stats.pendingPayments}
          sub="Awaiting confirmation"
          icon={Clock}
        />
        <StatCard
          label="Checked In"
          value={stats.checkedInMembers}
          sub={`of ${stats.totalMembers} registered members`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Revenue Collected"
          value={formatFee(stats.totalRevenue)}
          sub={`${stats.recordedPayments} paid registrations`}
          icon={CreditCard}
          accent
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Internal Students"
          value={stats.internalUsers}
          icon={Users}
        />
        <StatCard
          label="External Students"
          value={stats.externalUsers}
          icon={Users}
        />
        <StatCard
          label="Recorded Payments"
          value={stats.recordedPayments}
          icon={CheckCircle2}
        />
        <StatCard
          label="Open Events"
          value={events.filter((e) => e.registrationOpen).length}
          sub={`of ${events.length} total`}
          icon={TrendingUp}
        />
        <StatCard
          label="Repeated UTRs"
          value={stats.repeatedUtrs.length}
          sub={
            stats.repeatedUtrs.length > 0
              ? `${stats.repeatedUtrs.reduce((acc, g) => acc + g.occurrences, 0)} registrations flagged`
              : "0 duplicate UTRs"
          }
          icon={AlertTriangle}
          accent={stats.repeatedUtrs.length > 0}
        />
      </div>

      {/* Repeated UTR Numbers Section (Displayed prominently if duplicates exist) */}
      {stats.repeatedUtrs.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.02] p-5 shadow-[0_0_30px_rgba(245,158,11,0.08)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
            <div className="flex items-start sm:items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">
                    Repeated UTR Numbers Detected
                  </h2>
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                    {stats.repeatedUtrs.length} {stats.repeatedUtrs.length === 1 ? "group" : "groups"} · {stats.repeatedUtrs.reduce((acc, g) => acc + g.occurrences, 0)} registrations
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  These UTR / Transaction IDs were submitted across 2 or more different registrations. Review immediately to avoid duplicate payment approvals.
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

          <div className="mt-4 space-y-3">
            {stats.repeatedUtrs.map((group) => (
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
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-amber-300">
                      Reused in {group.occurrences} separate registrations
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
                        <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-1.5 text-[11px] text-muted">
                          <span className="font-medium text-foreground">{formatFee(reg.totalFee)}</span>
                          <span>{new Date(reg.createdAt).toLocaleDateString()}</span>
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

      {/* Per-event breakdown + Recent registrations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per-event registration counts */}
        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Registrations by Event
            </h2>
            <Link
              to="/wasd4381/events"
              className="flex items-center gap-1 text-[11px] text-primary-soft hover:text-primary"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted">No events configured.</p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => {
                const count = stats.perEvent[ev.id] ?? 0;
                return (
                  <div key={ev.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {ev.name}
                    </span>
<div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width:
                              stats.totalEventRegistrations > 0
                                ? `${Math.min(
                                    100,
                                    (count / stats.totalEventRegistrations) * 100
                                  )}%`
                                : "0%",
                          }}
                        />
                      </div>
                      <span className="w-4 text-right text-sm font-semibold text-foreground">
                        {count}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                        ev.registrationOpen
                          ? "border-primary/40 text-primary-soft"
                          : "border-white/10 text-muted"
                      }`}
                    >
                      {ev.registrationOpen ? "Open" : "Closed"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent registrations */}
        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Recent Registrations
            </h2>
            <Link
              to="/wasd4381/registrations"
              className="flex items-center gap-1 text-[11px] text-primary-soft hover:text-primary"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {stats.recentRegistrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] text-muted">
                <ClipboardList className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">No recent registrations</p>
              <p className="mt-1 text-xs text-muted">Registrations will appear here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.recentRegistrations.map((reg) => {
                const ev = events.find((e) => e.id === reg.eventId);
                return (
                  <div
                    key={reg.id}
                    className="group flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 transition-colors hover:border-white/[0.08] hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary-soft">
                        {reg.teamName}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {ev?.name ?? reg.eventId} <span className="mx-1 opacity-50">·</span>{" "}
                        <span className="font-mono">{reg.registrationCode}</span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                        reg.members[0]?.participantType === "internal" ||
                        reg.paymentStatus === "recorded"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {reg.members[0]?.participantType === "internal"
                        ? "Confirmed"
                        : reg.paymentStatus === "recorded"
                        ? "Paid"
                        : "Pending"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
