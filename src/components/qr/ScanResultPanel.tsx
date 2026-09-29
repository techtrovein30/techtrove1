/**
 * ScanResultPanel.tsx
 * -------------------
 * The admin-facing outcome of a scan. Deliberately loud: at a check-in desk the
 * volunteer reads this from arm's length, and the one thing that must never be
 * ambiguous is whether the person in front of them is cleared.
 *
 * Green  -> first-time arrival, now present for every event they hold.
 * Amber  -> the pass was already scanned; nothing was changed.
 * Red    -> the code is unknown, revoked, has no registration behind it, or
 *           the payment behind it has not been verified, and the manual Check In
 *           path is the fallback.
 */

import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import type { ScanResult } from "../../lib/checkinQr";
import { cn } from "../../lib/utils";

function FailureCopy(result: Extract<ScanResult, { ok: false }>) {
  switch (result.reason) {
    case "revoked":
      return {
        title: "Pass deactivated",
        body: `${result.displayName ?? "This pass"} was revoked by an admin. Use the manual check-in below if the participant is here.`,
      };
    case "not_registered":
      return {
        title: "No registration found",
        body: "This pass belongs to someone with no completed registration. Check the spelling, or use the manual check-in below.",
      };
    case "not_paid":
      return {
        title: "Payment not verified",
        body: `${result.displayName ?? "This participant"} is registered, but their payment has not been verified yet. Send them to the payments desk — do not admit on this pass.`,
      };
    default:
      return {
        title: "Unrecognised code",
        body: "That code is not a TechTrove pass. Ask for a screenshot of the pass, or use the manual check-in below.",
      };
  }
}

export function ScanResultPanel({ result }: { result: ScanResult | null }) {
  if (!result) return null;

  if (!result.ok) {
    const copy = FailureCopy(result);
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4"
      >
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-300">{copy.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-red-200/80">{copy.body}</p>
        </div>
      </div>
    );
  }

  if (result.duplicate) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
      >
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-300">Already checked in</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            {result.displayName} is already marked present for all{" "}
            {result.membersTotal} of their registrations. Nothing was changed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-300">Checked in</p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          {result.displayName}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span
            className={cn(
              "border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
              result.participantType === "internal"
                ? "border-primary/40 bg-primary/10 text-primary-soft"
                : "border-white/15 text-muted"
            )}
          >
            {result.participantType === "internal" ? "SIMATS" : "External"}
          </span>
          <span>
            {result.membersChecked} of {result.membersTotal} event
            {result.membersTotal === 1 ? "" : "s"} marked present
          </span>
          {result.alreadyAttended > 0 && (
            <span className="flex items-center gap-1">
              <Info className="h-3 w-3" aria-hidden />
              {result.alreadyAttended} already done
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export function ScanErrorPanel({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
      <p className="text-xs leading-relaxed text-amber-200">{message}</p>
    </div>
  );
}
