/**
 * CheckinPassCard.tsx
 * -------------------
 * The participant-facing entry pass: a high-contrast QR badge that can be shown
 * on a phone, screenshotted, downloaded, or printed.
 *
 * The badge is deliberately LIGHT-themed even though the site is dark. A QR code
 * needs a quiet zone with strong contrast against the dark modules, and white
 * paper is what it will end up on when printed at the venue — so the card is
 * styled for the paper, not for the profile page.
 */

import { useCallback, useState } from "react";
import { Download, Printer, QrCode as QrCodeIcon, ShieldCheck, User } from "lucide-react";
import QRCode from "qrcode";
import { QrCode } from "./QrCode";
import { formatTokenForDisplay } from "../../lib/qrToken";
import type { CheckinPass } from "../../lib/checkinQr";
import { cn } from "../../lib/utils";

export interface CheckinPassCardProps {
  pass: CheckinPass;
  /** Registration codes this pass covers, shown under the badge. */
  registrationCodes?: string[];
  /** Compact variant for the team list; hides the header and actions. */
  compact?: boolean;
  className?: string;
}

export function CheckinPassCard({
  pass,
  registrationCodes,
  compact = false,
  className,
}: CheckinPassCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codes = Array.from(new Set(registrationCodes ?? [])).slice(0, 6);

  const handleDownload = useCallback(async () => {
    if (!pass.payload) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await QRCode.toDataURL(pass.payload, {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      const link = document.createElement("a");
      const safeName =
        pass.displayName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() ||
        "participant";
      link.href = dataUrl;
      link.download = `techtrove-pass-${safeName}.png`;
      link.click();
    } catch {
      setError("Could not download the QR image.");
    } finally {
      setBusy(false);
    }
  }, [pass.payload, pass.displayName]);

  const handlePrint = useCallback(() => {
    setError(null);
    window.print();
  }, []);

  if (!pass.payload) {
    return (
      <div
        className={cn(
          "border border-dashed border-amber-500/40 bg-amber-500/5 p-5 text-xs text-amber-200",
          className
        )}
      >
        <p className="font-semibold uppercase tracking-[0.14em]">{pass.displayName}</p>
        <p className="mt-1">This pass could not be generated — the code is malformed.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden border border-black/10 bg-white text-neutral-900 shadow-[0_18px_50px_-24px_rgba(124,58,237,0.55)]",
        className
      )}
    >
      {/* Accent strip — the only place the brand colour is allowed to sit
          behind the code, so the modules keep full contrast. */}
      <div className="flex items-center justify-between gap-2 bg-primary px-4 py-2 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
          TechTrove 3.0 · Entry Pass
        </p>
        {pass.isSelf ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em]">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            You
          </span>
        ) : null}
      </div>

      <div className={cn("px-4 py-4", compact ? "flex items-center gap-4" : "text-center")}>
        <div className={cn(compact && "shrink-0")}>
          <QrCode
            value={pass.payload}
            size={compact ? 96 : 200}
            title={`Entry pass QR for ${pass.displayName}`}
            className={cn("mx-auto", compact && "mx-0")}
          />
        </div>

        <div className={cn("mt-3", compact && "mt-0 min-w-0 flex-1")}>
          <p
            className={cn(
              "truncate font-display font-bold",
              compact ? "text-sm" : "text-lg"
            )}
            title={pass.displayName}
          >
            {pass.displayName}
          </p>

          <p className="mt-1 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <User className="h-3 w-3" aria-hidden />
            {pass.participantType === "internal" ? "SIMATS · Internal" : "External"}
          </p>

          <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.12em] text-neutral-700">
            {formatTokenForDisplay(pass.token)}
          </p>

          {codes.length > 0 && (
            <p className="mt-2 break-words text-[10px] leading-relaxed text-neutral-500">
              <span className="font-semibold uppercase tracking-[0.12em]">Reg. code</span>{" "}
              {codes.join(" · ")}
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <div className="flex items-center gap-2 border-t border-black/10 bg-neutral-50 px-4 py-2.5">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 border border-black/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-700 transition-colors hover:border-black/40 hover:text-black disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {busy ? "Saving…" : "Download QR"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-1.5 border border-black/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-700 transition-colors hover:border-black/40 hover:text-black"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] text-red-700">
          {error}
        </p>
      )}

      {!compact && (
        <p className="flex items-start gap-1.5 border-t border-black/10 px-4 py-2 text-[10px] leading-relaxed text-neutral-500">
          <QrCodeIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Show this at the check-in desk. A screenshot works — the code is a
          personal credential, so don&apos;t post it publicly.
        </p>
      )}
    </div>
  );
}
