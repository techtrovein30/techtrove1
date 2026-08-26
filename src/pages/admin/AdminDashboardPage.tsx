import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  ClipboardList,
  CreditCard,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { getAdminStats } from "../../lib/adminApi";
import { getAllEvents } from "../../lib/eventStore";
import { formatFee } from "../../lib/utils";
import { StatCard } from "../../components/admin/StatCard";

export function AdminDashboardPage() {
  const stats = useMemo(() => {
    try {
      return getAdminStats();
    } catch {
      return null;
    }
  }, []);

  const events = useMemo(() => getAllEvents(), []);

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">
        Unable to load statistics.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Live overview of TechTrove 3.0 registrations and participants.
        </p>
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
          label="Revenue Collected"
          value={formatFee(stats.totalRevenue)}
          sub={`${stats.recordedPayments} paid registrations`}
          icon={CreditCard}
          accent
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
      </div>

      {/* Per-event breakdown + Recent registrations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per-event registration counts */}
        <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Registrations by Event
            </h2>
            <Link
              to="/wch1925/events"
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
                              stats.totalRegistrations > 0
                                ? `${Math.min(
                                    100,
                                    (count / stats.totalRegistrations) * 100
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
              to="/wch1925/registrations"
              className="flex items-center gap-1 text-[11px] text-primary-soft hover:text-primary"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {stats.recentRegistrations.length === 0 ? (
            <p className="text-sm text-muted">
              No registrations yet. Students who register will appear here.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {stats.recentRegistrations.map((reg) => {
                const ev = events.find((e) => e.id === reg.eventId);
                return (
                  <div
                    key={reg.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {reg.teamName}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {ev?.name ?? reg.eventId} ·{" "}
                        {reg.registrationCode}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                        reg.paymentStatus === "recorded"
                          ? "border-emerald-500/40 text-emerald-400"
                          : "border-amber-500/40 text-amber-400"
                      }`}
                    >
                      {reg.paymentStatus === "recorded" ? "Paid" : "Pending"}
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
