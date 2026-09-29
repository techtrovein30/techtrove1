/**
 * QrScanner.tsx
 * -------------
 * Camera scanner for the admin check-in desk. Works on a phone (rear camera at
 * the venue) and on a laptop with a USB webcam, and always keeps a manual code
 * box available for a damaged or unreadable QR.
 *
 * How decoding works
 *   1. `BarcodeDetector` when the browser exposes it (Chrome, Edge, Android
 *      WebView). It is hardware/OS accelerated, so the camera never has to be
 *      read back into JS on every frame.
 *   2. `jsQR` as the fallback, decoding a downscaled frame drawn to an offscreen
 *      canvas. The frame is capped at 480px on the long edge — a check-in QR is
 *      high contrast and fills a good part of the frame, so full resolution only
 *      costs frames per second.
 *
 * The camera is only ever requested after an explicit user gesture (the Start
 * button) and every stream track is stopped on unmount, so the camera light is
 * never left on after the admin navigates away.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Flashlight, Keyboard, Loader2, RefreshCcw, ScanLine } from "lucide-react";
import jsQR from "jsqr";
import { cn } from "../../lib/utils";

/** Longest edge, in pixels, of the frame handed to the jsQR fallback. */
const FALLBACK_MAX_EDGE = 480;

/** Ignore repeat decodes of the same code for this long (ms). */
const RESCAN_COOLDOWN_MS = 2500;

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * A single line naming what the browser actually did, so one screenshot
 * identifies the cause instead of another round of guesswork. `NotAllowedError`
 * in particular covers three unrelated situations — an origin served over plain
 * http, a permission the operator has clicked "Block" on (which Chrome and
 * Safari never re-ask for), and an OS-level camera switch being off — and the
 * recovery is different for each.
 */
function mediaDiagnostics(err: unknown): string {
  const detail =
    err instanceof DOMException ? `${err.name} ${err.message}` : String((err as Error)?.message ?? err);
  const gum = typeof navigator.mediaDevices?.getUserMedia;
  return `origin=${location.origin} secure=${window.isSecureContext} gum=${gum} err=${detail}`;
}

/** Human-readable text for a getUserMedia failure. */
function describeMediaError(err: unknown): string {
  // getUserMedia does not exist at all outside a secure context, so this is
  // almost always "you are on plain http" rather than an old browser - and on a
  // venue laptop that is the single most likely reason the desk cannot scan.
  if (!window.isSecureContext) {
    return `The camera only works over https. Type the code below instead. ${mediaDiagnostics(err)}`;
  }
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return `Camera permission is blocked for this site. Allow it from the icon in the address bar, then press Start camera again — or type the code below. ${mediaDiagnostics(err)}`;
      case "NotFoundError":
      case "OverconstrainedError":
        return `No camera found on this device. Type the code below instead. ${mediaDiagnostics(err)}`;
      case "NotReadableError":
        return `The camera is already in use by another app. ${mediaDiagnostics(err)}`;
      default:
        return `Could not start the camera. Type the code below instead. ${mediaDiagnostics(err)}`;
    }
  }
  return `Could not start the camera. Type the code below instead. ${mediaDiagnostics(err)}`;
}

export interface QrScannerProps {
  /** Called with the raw decoded string; the parent validates and checks in. */
  onScan: (raw: string) => void;
  /** Disables the camera and forces the manual box (e.g. while a scan is in flight). */
  disabled?: boolean;
  className?: string;
}

export function QrScanner({ onScan, disabled = false, className }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<InstanceType<BarcodeDetectorCtor> | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  // Keep the latest onScan in a ref so restarting the camera loop never has to
  // tear down and rebuild the stream just because the parent re-rendered.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  /**
   * Hands a decoded value to the parent, dropping repeats of the same code
   * inside the cooldown window so a pass held in front of the lens does not
   * fire a scan on every frame.
   */
  const emit = useCallback((value: string) => {
    const now = Date.now();
    const last = lastScanRef.current;
    if (last.value === value && now - last.at < RESCAN_COOLDOWN_MS) return;
    lastScanRef.current = { value, at: now };
    onScanRef.current(value);
  }, []);

  // jsQR fallback: paint the current frame into the offscreen canvas and read it.
  const scanWithFallback = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_CURRENT_DATA) return;

    const scale = Math.min(1, FALLBACK_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const image = ctx.getImageData(0, 0, w, h);
    const result = jsQR(image.data, w, h, { inversionAttempts: "dontInvert" });
    if (result?.data) emit(result.data);
  }, [emit]);

  const loop = useCallback(
    async function tick() {
      const detector = detectorRef.current;
      const video = videoRef.current;

      if (detector && video && video.readyState >= video.HAVE_CURRENT_DATA) {
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0].rawValue) {
            emit(codes[0].rawValue);
          }
        } catch {
          // A single failed frame is not worth tearing the camera down for;
          // fall through to the next frame.
        }
      } else if (!detector) {
        scanWithFallback();
      }

      rafRef.current = requestAnimationFrame(() => void tick());
    },
    [emit, scanWithFallback]
  );

  const start = useCallback(
    async (mode: "environment" | "user") => {
      setError(null);
      stop();

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? "This browser cannot open a camera. Type the code below instead."
            : "The camera only works over https. Type the code below instead.",
        );
        return;
      }

      try {
        // A plain `facingMode` constraint is preferred; the exact-device form is
        // only reached for and is what actually resolves the rear lens on
        // Android, where the ideal constraint alone often picks the selfie cam.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode === "environment" ? { ideal: "environment" } : { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          video.muted = true;
          await video.play().catch(() => {
            // Autoplay can be rejected; the stream is still live and the first
            // user interaction on the surrounding panel usually unblocks it.
          });
        }

        const track = stream.getVideoTracks()[0];
        const caps = typeof track?.getCapabilities === "function" ? track.getCapabilities() : {};
        setTorchSupported(Boolean(caps && "torch" in caps && caps.torch));

        const Detector = getBarcodeDetector();
        if (Detector) {
          try {
            detectorRef.current = new Detector({ formats: ["qr_code"] });
          } catch {
            detectorRef.current = null;
          }
        } else {
          detectorRef.current = null;
        }

        setActive(true);
        setFacing(mode);
        rafRef.current = requestAnimationFrame(() => void loop());
      } catch (err) {
        stop();
        setActive(false);
        setError(describeMediaError(err));
      }
    },
    [loop, stop]
  );

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  // Stop the camera whenever the component unmounts, or when the parent
  // disables scanning mid-request.
  useEffect(() => {
    if (disabled && active) {
      stop();
      setActive(false);
    }
  }, [disabled, active, stop]);

  useEffect(() => stop, [stop]);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const value = manual.trim();
    if (!value) return;
    lastScanRef.current = { value: "", at: 0 };
    onScanRef.current(value);
    setManual("");
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Viewfinder */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
        <div className="relative aspect-4/3 w-full sm:aspect-16/9">
          <video
            ref={videoRef}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              active ? "opacity-100" : "opacity-0"
            )}
            playsInline
            muted
          />

          {/* Reticle — purely a framing aid, pointer-events-free so the
              scanner never has to fight it for clicks. */}
          {active && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="relative aspect-square w-[58%] max-h-[80%]">
                <span className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-emerald-400" />
                <span className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-emerald-400" />
                <span className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-emerald-400" />
                <span className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-emerald-400" />
                <span className="absolute inset-x-0 top-1/2 h-px bg-emerald-400/40" />
              </div>
            </div>
          )}

          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a0a] p-6 text-center">
              <ScanLine className="h-9 w-9 text-muted" aria-hidden />
              <p className="text-xs text-muted">
                Point the camera at a participant&apos;s entry pass.
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#111111] p-3">
          {!active ? (
            <button
              type="button"
              onClick={() => void start(facing)}
              disabled={disabled}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
            >
              <Camera className="h-4 w-4" aria-hidden />
              Start camera
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void start(facing === "environment" ? "user" : "environment")}
                disabled={disabled}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-white/40 hover:text-foreground disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" aria-hidden />
                Flip camera
              </button>

              {torchSupported && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  aria-pressed={torchOn}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                    torchOn
                      ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                      : "border-white/15 text-muted hover:border-white/40 hover:text-foreground"
                  )}
                >
                  <Flashlight className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Light</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  stop();
                  setActive(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-red-400/50 hover:text-red-300"
              >
                <CameraOff className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Stop</span>
              </button>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200">
            {error}
          </p>
        )}
      </div>

      {/* Manual fallback — a damaged pass, a printed code, or no camera at all. */}
      <form onSubmit={submitManual} className="space-y-2">
        <label
          htmlFor="checkin-manual-code"
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
        >
          <Keyboard className="h-3.5 w-3.5" aria-hidden />
          Or type the code
        </label>
        <div className="flex gap-2">
          <input
            id="checkin-manual-code"
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="TTQ1:… or paste a link"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={128}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={disabled || !manual.trim()}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
          >
            {disabled ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ScanLine className="h-4 w-4" aria-hidden />
            )}
            Check in
          </button>
        </div>
      </form>

      {/* Offscreen decode surface for the jsQR fallback. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />
    </div>
  );
}
