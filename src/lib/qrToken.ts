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

/** Payload version for the participant's personal pass. Bump when the encoding below changes incompatibly. */
export const QR_PAYLOAD_VERSION = "TTQ1";

/**
 * Payload prefix for the EVENT code a coordinator displays.
 *
 * Distinct from QR_PAYLOAD_VERSION on purpose: the two are read by opposite
 * parties and must never be mistaken for one another.
 */
export const EVENT_QR_PREFIX = "TTE1";

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
 *
 * The dash-grouped form printed on the pass card is accepted too - see the
 * ungroup step below, which is what keeps the camera-less desk working.
 */
export function extractQrToken(raw: string): string | null {
  if (!raw) return null;
  let value = raw.trim();

  try {
    value = decodeURIComponent(value);
  } catch {}
  value = value.toLowerCase();

  // Canonical payload, and any payload with a separator we did not plan for.
  if (value.startsWith(`${QR_PAYLOAD_VERSION.toLowerCase()}:`)) {
    const rest = value.slice(QR_PAYLOAD_VERSION.length + 1).replace(/^\/+/, "");
    return TOKEN_PATTERN.test(rest) ? rest : null;
  }

  // Bare token typed into the manual-entry box.
  if (TOKEN_PATTERN.test(value)) return value;

  // The pass card prints the token dash-grouped (see formatTokenForDisplay) so
  // it can be read out over a noisy desk - and that grouped form is exactly
  // what a volunteer types into this box when there is no camera to scan with.
  // Undo the grouping before giving up on it.
  const ungrouped = value.replace(/[\s-]+/g, "");
  if (TOKEN_PATTERN.test(ungrouped)) return ungrouped;

  // Deep link with ttq1:<token>
  const ttqMatch = value.match(/ttq1:([0-9a-f]{32})/);
  if (ttqMatch) return ttqMatch[1];

  // Deep link: pull the first 32-hex run out of the trailing path/query.
  const match = value.match(TOKEN_SCAN_PATTERN);
  return match ? match[0] : null;
}

/**
 * Extracts an EVENT attendance token (the one a coordinator displays) from a
 * scanned value.
 *
 * Deliberately separate from extractQrToken above, which reads the participant's
 * personal `TTQ1` pass. The two flows are easy to confuse and must never be
 * interchangeable:
 *
 *   - a personal pass identifies ONE participant and is scanned BY an admin;
 *   - an event code identifies ONE event and is scanned BY the participant.
 *
 * Getting this backwards would either let a student mark somebody else in, or
 * let a coordinator's code be mistaken for a personal pass. The prefixes are
 * distinct on the wire and the extractors refuse each other's payload.
 *
 * The event token is stored raw (32 lowercase hex, no prefix) in
 * events.attendance_token, so the wire prefix is added purely to make a
 * displayed QR self-describing; it is stripped again here.
 */
export function extractEventToken(raw: string): string | null {
  if (!raw) return null;
  let value = raw.trim();

  try {
    value = decodeURIComponent(value);
  } catch {}
  value = value.toLowerCase();

  // Canonical event payload, and the slash variant some scanners normalise to.
  if (value.startsWith(`${EVENT_QR_PREFIX.toLowerCase()}:`)) {
    const rest = value.slice(EVENT_QR_PREFIX.length + 1).replace(/^\/+/, "");
    return TOKEN_PATTERN.test(rest) ? rest : null;
  }

  // A bare token: the coordinator may have printed it, or a volunteer typed it
  // into the manual box.
  if (TOKEN_PATTERN.test(value)) return value;

  // Grouped for reading aloud, same as the pass card.
  const ungrouped = value.replace(/[\s-]+/g, "");
  if (TOKEN_PATTERN.test(ungrouped)) return ungrouped;

  // Deep link, e.g. `https://techtrove.live/attendance?token=TTE1:<token>`.
  if (value.includes("ttq1")) return null;
  if (!/^https?:\/\//.test(value) && !value.startsWith("/") && !value.includes("attendance")) return null;

  // Explicitly match tte1:<token> to avoid URL-encoded colons (%3a) corrupting the token match
  const tteMatch = value.match(/tte1:([0-9a-f]{32})/);
  if (tteMatch) return tteMatch[1];

  const match = value.match(TOKEN_SCAN_PATTERN);
  return match ? match[0] : null;
}

/** True when a raw DB token is well formed (guards the render path too). */
export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token.trim().toLowerCase());
}

/**
 * Wraps a raw event token into the canonical `TTE1:<token>` payload.
 * Returns null for a malformed token so the coordinator's screen never renders
 * a QR that cannot be scanned.
 */
export function buildEventQrPayload(token: string): string | null {
  const clean = token.trim().toLowerCase();
  if (!TOKEN_PATTERN.test(clean)) return null;
  return `${EVENT_QR_PREFIX}:${clean}`;
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
