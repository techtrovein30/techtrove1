import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Users,
  ClipboardList,
  Clock,
  CheckCircle2,
  ArrowRight,
  Plus,
  UsersRound,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getAdminStats, type AdminStats } from "../../lib/adminApi";
import { useAllEvents } from "../../lib/useEvents";
import { formatFee } from "../../lib/utils";
import { StatCard } from "../../components/admin/StatCard";
import { supabase } from "../../lib/supabase";

export function AdminDashboardPage({
  viewOnly: viewOnlyProp,
  basePath: basePathProp,
}: {
  viewOnly?: boolean;
  basePath?: string;
} = {}) {
  const outlet = useOutletContext<{ viewOnly?: boolean; basePath?: string } | null>();
  const viewOnly = viewOnlyProp ?? outlet?.viewOnly ?? false;
  const basePath = basePathProp ?? outlet?.basePath ?? "/wasd4381";

  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function fetchStats() {
    getAdminStats()
      .then(setStats)
      .catch((e) => {
        console.error("Dashboard error:", e);
        setErrorMsg("Could not load dashboard statistics. Check your connection and try again.");
        setStats(null);
      });
  }

  useEffect(() => {
    let lastFetchAt = Date.now();
    const markFetched = () => {
      lastFetchAt = Date.now();
    };

    fetchStats();

    // Refetching on EVERY window focus meant every alt-tab away and back
    // re-downloaded the whole registration table. getAdminStats() reads both
    // registrations tables in full, so that was megabytes per tab-switch, and
    // an admin checking a chat mid-review paid it dozens of times.
    //
    // The realtime subscription below already keeps these numbers current, so
    // the focus refetch only has to cover the case where the socket silently
    // dropped while the tab was backgrounded. 30s is well inside "stale" for
    // revenue figures an admin is reading off a screen.
    const FOCUS_REFETCH_STALE_MS = 30_000;
    const onFocus = () => {
      if (Date.now() - lastFetchAt >= FOCUS_REFETCH_STALE_MS) {
        markFetched();
        fetchStats();
      }
    };
    window.addEventListener("focus", onFocus);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        markFetched();
        fetchStats();
      }, 500);
    };

    // Listen to changes on participant and registration tables only (not members/attendance)
    const channel = supabase
      .channel("admin-dashboard-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_participants" },
        debouncedFetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "external_participants" },
        debouncedFetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations_internal" },
        debouncedFetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations_external" },
        debouncedFetch
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      if (debounceTimer) clearTimeout(debounceTimer);
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
      <div className="flex h-64 items-center justify-center text-muted">Loading statistics...</div>
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
            to={`${basePath}/students`}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06]"
          >
            <UsersRound className="h-4 w-4 text-muted" />
            Students
          </Link>
          <Link
            to={`${basePath}/events`}
            className={
              viewOnly
                ? "flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.06]"
                : "flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all hover:bg-primary-soft hover:shadow-[0_0_20px_rgba(124,58,237,0.5)]"
            }
          >
            {viewOnly ? (
              <CalendarDays className="h-4 w-4 text-muted" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {viewOnly ? "Events" : "Manage Events"}
          </Link>
        </div>
      </div>

      {/* Primary operational stats */}
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
          sub="Awaiting review in Payments"
          icon={Clock}
        />
        <StatCard
          label="Checked In"
          value={stats.checkedInMembers}
          sub={`of ${stats.totalMembers} registered members`}
          icon={CheckCircle2}
        />
      </div>

      {/* Secondary operational stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Internal Students" value={stats.internalUsers} icon={Users} />
        <StatCard label="External Students" value={stats.externalUsers} icon={Users} />
        <StatCard label="Recorded Payments" value={stats.recordedPayments} icon={CheckCircle2} />
        <StatCard
          label="Open Events"
          value={events.filter((e) => e.registrationOpen).length}
          sub={`of ${events.length} total`}
          icon={TrendingUp}
        />
      </div>

      {/* Dedicated Revenue & Financial Audit Hub Callout (Hidden in viewOnly) */}
      {!viewOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-[#1a1a24] to-[#161616] p-5 shadow-sm">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/20 text-primary-soft">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Revenue & UTR Fraud Audit</h2>
                <span className="rounded-full border border-primary/40 bg-primary/20 px-2.5 py-0.5 text-xs font-mono font-bold text-primary-soft">
                  {formatFee(stats.totalRevenue)} collected
                </span>
                {stats.repeatedUtrs.length > 0 && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                    {stats.repeatedUtrs.length}{" "}
                    {stats.repeatedUtrs.length === 1 ? "group" : "groups"} flagged
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Live financial analytics, per-event fee breakdowns, and duplicate transaction UTR
                resolution are on the dedicated Revenue page.
              </p>
            </div>
          </div>
          <Link
            to="/wasd4381/revenue"
            className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all hover:bg-primary-soft hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] shrink-0"
          >
            Open Revenue Page <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Per-event breakdown + Recent registrations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per-event registration counts */}
        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Registrations by Event</h2>
            <Link
              to={`${basePath}/events`}
              className="flex items-center gap-1 text-[11px] text-primary-soft hover:text-primary"
            >
              {viewOnly ? "View all" : "Manage"} <ArrowRight className="h-3 w-3" />
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
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">{ev.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width:
                              stats.totalEventRegistrations > 0
                                ? `${Math.min(100, (count / stats.totalEventRegistrations) * 100)}%`
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
            <h2 className="text-sm font-semibold text-foreground">Recent Registrations</h2>
            <Link
              to={`${basePath}/registrations`}
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
