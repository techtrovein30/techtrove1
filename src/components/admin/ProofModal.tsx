import { useEffect, useState } from "react";
import { X, ExternalLink, Copy, Check, Loader2, RefreshCcw, Image as ImageIcon, FileX2 } from "lucide-react";
import { adminGetSignedUrl } from "../../lib/adminApi";
import { getUploadPublicUrl } from "../../lib/storage";

interface ProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  path: string | null | undefined;
  title?: string;
  subtitle?: string;
  utrNumber?: string;
}

export function ProofModal({
  isOpen,
  onClose,
  path,
  title = "Payment Proof",
  subtitle,
  utrNumber,
}: ProofModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(isOpen && Boolean(path));
  const [error, setError] = useState<string | null>(
    isOpen && !path ? "No proof file path is attached to this record." : null
  );
  const [copied, setCopied] = useState(false);

  // Reset per-file state during render whenever the target (isOpen/path)
  // changes, instead of calling setState synchronously inside the effect.
  const [view, setView] = useState<{ isOpen: boolean; path: string | null | undefined; attempt: number }>({
    isOpen,
    path,
    attempt: 0,
  });
  if (view.isOpen !== isOpen || view.path !== path) {
    setView({ isOpen, path, attempt: 0 });
    setCopied(false);
    setSignedUrl(null);
    setLoading(isOpen && Boolean(path));
    setError(isOpen && !path ? "No proof file path is attached to this record." : null);
  }

  useEffect(() => {
    if (!isOpen || !path) return;
    let cancelled = false;

    adminGetSignedUrl(path, 600) // 10-minute temporary signed URL
      .then((url) => {
        if (cancelled) return;
        if (!url) {
          setError("Unable to generate signed URL. The file may have been removed or access is restricted.");
        } else {
          setSignedUrl(url);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load proof image.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, path, view.attempt]);

  /** Re-runs the signed-URL generation for transient storage errors. */
  function retryLoad() {
    setCopied(false);
    setSignedUrl(null);
    setLoading(true);
    setError(null);
    setView((v) => ({ ...v, attempt: v.attempt + 1 }));
  }

  if (!isOpen) return null;

  function copyUtr() {
    if (!utrNumber) return;
    navigator.clipboard.writeText(utrNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const publicUrl = error ? getUploadPublicUrl(path) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-modal-title"
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 id="proof-modal-title" className="text-base font-semibold text-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary-soft" />
              {title}
            </h2>
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* UTR Pill (if present) */}
        {utrNumber && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider text-muted">UTR / Transaction ID:</span>
              <code className="font-mono text-sm font-bold text-primary-soft">{utrNumber}</code>
            </div>
            <button
              type="button"
              onClick={copyUtr}
              className="inline-flex items-center gap-1.5 rounded border border-white/10 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-white/[0.06]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy UTR
                </>
              )}
            </button>
          </div>
        )}

        {/* Image Display Area */}
        <div className="flex flex-1 items-center justify-center overflow-auto p-5 min-h-[300px] bg-[#0c0c0c]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
              <p className="text-xs">Generating secure preview...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 text-center p-6 text-red-400">
              <FileX2 className="h-9 w-9 text-red-400/80" />
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs text-muted max-w-sm leading-relaxed">
                This usually means the screenshot was removed from Storage — for
                example when a re-upload was requested and the old file was
                deleted. {path ? "Close and use " : ""}
                <span className="text-amber-300">Request Re-upload</span> on the
                payment row so the participant uploads a fresh screenshot.
              </p>
              {path && (
                <p className="w-full max-w-md break-all rounded border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-[10px] text-muted">
                  Stored path: {path}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={retryLoad}
                  className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.08]"
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Retry
                </button>
                {publicUrl && (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.08]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Check file in new tab
                  </a>
                )}
              </div>
              <p className="text-[11px] text-muted/70">
                The screenshot could not be loaded with admin permissions. Verify the stored path still exists in Supabase Storage &gt; uploads before asking for a re-upload.
              </p>
            </div>
          )}

          {signedUrl && !loading && !error && (
            <div className="relative flex flex-col items-center w-full">
              <img
                src={signedUrl}
                alt="Payment screenshot proof"
                className="max-h-[60vh] max-w-full rounded border border-white/10 object-contain shadow-lg"
                onError={() => setError("Image failed to render. The signed URL may have expired.")}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] px-5 py-3 text-xs bg-[#141414]">
          <p className="text-muted text-[11px]">
            Private file · Temporary signed URL (expires in 10 mins)
          </p>
          <div className="flex items-center gap-2">
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.08]"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Full Size
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-soft"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
