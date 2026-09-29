/**
 * qrToken.ts
 * ----------
 * Wire format for the TechTrove check-in pass.
 *
 * The QR encodes a versioned payload rather than a bare token so a screenshot
 * is self-describing: a passer-by (or a volunteer) can tell what it is, and an
 * old scanner can reject a future format instead of mis-reading it.
 *
 *   TTQ1:<32 lowercase hex chars>          canonical
 *   TTQ1://<32 lowercase hex chars>        tolerant of a deep-link variant
 *
 * The token itself is 128 bits from Postgres `gen_random_bytes`, so the only
 * input that ever reaches `admin_scan_checkin` is a value the server issued.
 * Nothing in the payload identifies the participant — the name and email are
 * resolved server-side from the token — so a leaked screenshot can be revoked
 * (set `revoked_at`) without changing anyone's name or email.
 */

/** Payload version. Bump when the encoding below changes incompatibly. */
export const QR_PAYLOAD_VERSION = "TTQ1";

/** 32 lowercase hex characters, exactly what `gen_random_bytes(16)` encodes to. */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Anything we are willing to pull a token out of, however mangled by the scanner. */
const TOKEN_SCAN_PATTERN = /[0-9a-f]{32}/;

/**
 * Wraps a raw token into the canonical payload string.
 * Returns null when the token is not a well-formed token, so a broken pass
 * never renders a QR that simply cannot be scanned.
 */
export function buildQrPayload(token: string): string | null {
  const clean = token.trim().toLowerCase();
  if (!TOKEN_PATTERN.test(clean)) return null;
  return `${QR_PAYLOAD_VERSION}:${clean}`;
}

/**
 * Extracts a token from a scanned value.
 *
 * A scanner hands back whatever the QR contained, but in practice that can be
 * a full deep link (some camera apps "open" the code and hand over the URL), a
 * payload with stray whitespace, or the token typed by hand with the prefix
 * half-remembered. All three are accepted; anything else returns null so the
 * caller can report a bad code instead of sending junk to the database.
 */
export function extractQrToken(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  // Canonical payload, and any payload with a separator we did not plan for.
  if (value.startsWith(`${QR_PAYLOAD_VERSION.toLowerCase()}:`)) {
    const rest = value.slice(QR_PAYLOAD_VERSION.length + 1).replace(/^\/+/, "");
    return TOKEN_PATTERN.test(rest) ? rest : null;
  }

  // Bare token typed into the manual-entry box.
  if (TOKEN_PATTERN.test(value)) return value;

  // Deep link: pull the first 32-hex run out of the trailing path/query.
  // A regex over a fixed-width alphabet cannot inject SQL — the result is still
  // validated against TOKEN_PATTERN before it leaves this function.
  const match = value.match(TOKEN_SCAN_PATTERN);
  return match ? match[0] : null;
}

/** True when a raw DB token is well formed (guards the render path too). */
export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token.trim().toLowerCase());
}

/**
 * Groups a 32-char token for humans: `TTQ1:9f2a…` style is unreadable when
 * someone has to read a code out loud over a noisy desk.
 */
export function formatTokenForDisplay(token: string): string {
  const clean = token.trim().toUpperCase();
  if (clean.length !== 32) return clean;
  return `${clean.slice(0, 8)}-${clean.slice(8, 16)}-${clean.slice(16, 24)}-${clean.slice(24)}`;
}
