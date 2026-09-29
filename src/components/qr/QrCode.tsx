/**
 * QrCode.tsx
 * -----------
 * Renders a QR code as inline SVG.
 *
 * SVG rather than <canvas> because the pass has to stay crisp on a phone screen,
 * in a screenshot, and on paper, and because it can be recoloured per state
 * without a redraw. The encoder is invoked once per payload — `toString` is
 * async, so the result is cached in a module-level map keyed by
 * (payload, options) rather than re-encoded on every render.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Cache keyed by the exact encoder input so re-renders are free. */
const svgCache = new Map<string, string>();

function cacheKey(payload: string, size: number, margin: number, dark: string, light: string) {
  return `${size}|${margin}|${dark}|${light}|${payload}`;
}

export interface QrCodeProps {
  /** The string to encode. */
  value: string;
  /** Rendered pixel size (square). */
  size?: number;
  /** Quiet-zone width in modules. The spec requires at least 4. */
  margin?: number;
  /** Module colour for the dark cells. */
  dark?: string;
  /** Module colour for the quiet zone. */
  light?: string;
  className?: string;
  /** Accessible description; the SVG is decorative to screen readers otherwise. */
  title?: string;
}

export function QrCode({
  value,
  size = 220,
  margin = 2,
  dark = "#000000",
  light = "#ffffff",
  className,
  title = "Check-in QR code",
}: QrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const key = cacheKey(value, size, margin, dark, light);
    let cancelled = false;

    const encode = () => {
      const cached = svgCache.get(key);
      if (cached) {
        setSvg(cached);
        setFailed(false);
        return;
      }

      QRCode.toString(value, {
        type: "svg",
        width: size,
        margin,
        errorCorrectionLevel: "M",
        color: { dark, light },
      })
        .then((out) => {
          if (cancelled) return;
          svgCache.set(key, out);
          setSvg(out);
          setFailed(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("[qr] failed to encode payload:", err);
          setFailed(true);
        });
    };

    // Deferred into a microtask so no state is set synchronously inside the
    // effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(encode);

    return () => {
      cancelled = true;
    };
  }, [value, size, margin, dark, light]);

  if (failed) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        role="img"
        aria-label="QR code unavailable"
      />
    );
  }

  if (!svg) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={className}
      // Safe: the markup is produced locally by the `qrcode` encoder from a
      // value this app generated — no user or network input reaches the SVG.
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
      aria-label={title}
      style={{ width: size, height: size }}
    />
  );
}
