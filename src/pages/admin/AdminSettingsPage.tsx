import { useState, useEffect } from "react";
import { Shield, Key, Database, LogOut, Check, AlertCircle } from "lucide-react";
import {
  getAdminAccountInfo,
  adminChangePassword,
  getStorageUsageSummary,
  adminSignOut,
} from "../../lib/adminApi";

export function AdminSettingsPage() {
  const [adminInfo, setAdminInfo] = useState<{ id: string; username: string; fullName: string; email: string } | null>(null);
  const [storageSummary, setStorageSummary] = useState<{ users: number; registrations: number; estimatedBytes: number } | null>(null);

  useEffect(() => {
    getAdminAccountInfo().then(setAdminInfo).catch(() => {});
    getStorageUsageSummary().then(setStorageSummary).catch(() => {});
  }, []);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!currentPass || !newPass || !confirmPass) {
      setPassError("All password fields are required.");
      return;
    }
    if (newPass !== confirmPass) {
      setPassError("New passwords do not match.");
      return;
    }
    if (newPass.length < 8) {
      setPassError("New password must be at least 8 characters long.");
      return;
    }

    setBusy(true);
    try {
      await adminChangePassword(currentPass, newPass);
      setPassSuccess("Password updated successfully.");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err) {
      setPassError(
        err instanceof Error ? err.message : "Password change failed."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    adminSignOut();
    window.location.replace("/wch1925");
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage administrator account, credentials, and system details.
        </p>
      </div>

      {/* Account Info */}
      <section className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616] p-6 space-y-4 transition-colors hover:border-white/[0.12] hover:bg-white/[0.02]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
          <Shield className="h-5 w-5 text-primary-soft" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Administrator Profile
            </h2>
            <p className="text-xs text-muted">Active administrator details</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Username
            </dt>
            <dd className="mt-1 font-mono text-foreground font-semibold">
              {adminInfo?.username ?? "admin"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Full Name
            </dt>
            <dd className="mt-1 text-foreground">
              {adminInfo?.fullName ?? "TechTrove Admin"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Role
            </dt>
            <dd className="mt-1 text-primary-soft font-semibold uppercase text-xs tracking-wider">
              Administrator
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              System Email
            </dt>
            <dd className="mt-1 text-foreground">
              {adminInfo?.email ?? "admin@techtrove.internal"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Security / Password Change */}
      <section className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616] p-6 space-y-4 transition-colors hover:border-white/[0.12] hover:bg-white/[0.02]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
          <Key className="h-5 w-5 text-primary-soft" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Security & Credentials
            </h2>
            <p className="text-xs text-muted">Change administrator password</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          {passError && (
            <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {passError}
            </div>
          )}

          {passSuccess && (
            <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <Check className="h-4 w-4 shrink-0" />
              {passSuccess}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0f0a0a] px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/60"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0f0a0a] px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/60"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0f0a0a] px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/60"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-primary-soft disabled:opacity-50"
          >
            {busy ? "Updating..." : "Update Password"}
          </button>
        </form>
      </section>

      {/* Storage & Architecture Summary */}
      <section className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#161616] p-6 space-y-4 transition-colors hover:border-white/[0.12] hover:bg-white/[0.02]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
          <Database className="h-5 w-5 text-primary-soft" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Storage Architecture
            </h2>
            <p className="text-xs text-muted">
              Current browser storage status & backend readiness
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-white/[0.05] bg-[#0f0a0a] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Stored Users
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {storageSummary?.users ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-[#0f0a0a] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Stored Registrations
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {storageSummary?.registrations ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-[#0f0a0a] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Est. Storage Used
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {storageSummary
                ? `${(storageSummary.estimatedBytes / 1024).toFixed(1)} KB`
                : "0 KB"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0f0a0a] p-4 text-xs text-muted space-y-2">
          <p className="font-semibold text-foreground">
            Architecture Status: Supabase Active
          </p>
          <p>
            All data operations use Supabase Auth and Postgres. User
            authentication, participants, and registrations are persisted in the
            cloud database with Row Level Security policies.
          </p>
        </div>
      </section>

      {/* Sign Out */}
      <div className="pt-2">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-red-300 hover:bg-red-500/20"
        >
          <LogOut className="h-4 w-4" /> End Admin Session & Sign Out
        </button>
      </div>
    </div>
  );
}
