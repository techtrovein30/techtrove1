import { useEffect, useState } from "react";
import { X, ExternalLink, Copy, Check, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { adminGetSignedUrl } from "../../lib/adminApi";

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
  const [loadKey, setLoadKey] = useState<{ isOpen: boolean; path: string | null | undefined }>({
    isOpen,
    path,
  });
  if (loadKey.isOpen !== isOpen || loadKey.path !== path) {
    setLoadKey({ isOpen, path });
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
  }, [isOpen, path]);

  if (!isOpen) return null;

  function copyUtr() {
    if (!utrNumber) return;
    navigator.clipboard.writeText(utrNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
            <div className="flex flex-col items-center gap-2 text-center p-6 text-red-400">
              <AlertCircle className="h-8 w-8 text-red-400/80" />
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs text-muted max-w-sm mt-1">
                The screenshot could not be loaded. Please ensure the participant uploaded a valid file and that your account has admin permissions.
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
