/**
 * gmail.ts
 * --------
 * Gmail API client for the TechTrove 3.0 email worker. The provider is
 * isolated behind this module so it can be swapped (e.g. SendGrid, Resend,
 * SMTP relay) without touching the worker logic.
 *
 * Authentication: server-side OAuth2 refresh-token flow only. No passwords,
 * no browser cookies, no Playwright, no Gmail UI automation. All secrets come
 * from Supabase Edge Function secrets (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
 * GMAIL_REFRESH_TOKEN) and never reach the frontend.
 *
 * Pure helpers (base64urlEncode, buildRawMessage, classifySendError,
 * encodeHeaderWord) are unit-tested from vitest.
 */

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fromEmail: string;
  fromName: string;
}

export interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

export type GmailErrorKind = "auth" | "quota" | "invalid" | "transient";

export class GmailSendError extends Error {
  readonly kind: GmailErrorKind;
  readonly status: number;

  constructor(kind: GmailErrorKind, status: number, message: string) {
    super(message);
    this.name = "GmailSendError";
    this.kind = kind;
    this.status = status;
  }
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** RFC 4648 base64url (no padding) — Gmail raw message format. */
export function base64urlEncode(value: string): string {
  return toBase64(utf8Bytes(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * RFC 2047 B-encoding for non-ASCII header words (subject / display names).
 * Passed through unchanged when the value is pure ASCII.
 */
export function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex -- \x00-\x7F is the ASCII range by definition
if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${toBase64(utf8Bytes(value))}?=`;
}

export interface MailParts {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}

function formatAddress(email: string, name: string): string {
  const cleanName = name.trim();
  if (!cleanName) return encodeHeaderWord(email);
  return `${encodeHeaderWord(cleanName)} <${email}>`;
}

/**
 * Builds a raw RFC 2822 multipart/alternative message ready for
 * Gmail users.messages.send.
 */
export function buildRawMessage(parts: MailParts): string {
  const boundary = `----=_TechTrove_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const date = new Date().toUTCString();
  const messageIdDomain = parts.fromEmail.split("@")[1] || "simats.in";

  const headers = [
    `From: ${formatAddress(parts.fromEmail, parts.fromName)}`,
    `To: ${formatAddress(parts.toEmail, parts.toName)}`,
    `Subject: ${encodeHeaderWord(parts.subject)}`,
    `Date: ${date}`,
    `Message-ID: <techtrove-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}@${messageIdDomain}>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const body =
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${toBase64(utf8Bytes(parts.text))}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${toBase64(utf8Bytes(parts.html))}\r\n` +
    `--${boundary}--\r\n`;

  return `${headers}\r\n\r\n${body}`;
}

const QUOTA_MARKERS = [
  "rateLimitExceeded",
  "SendAsQuotaExceededMessage",
  "userRateLimitExceeded",
  "UserRateLimitExceeded",
  "RequestRateLimitExceeded",
  "DailyLimitExceeded",
  "Quota Exceeded",
  "quota exceeded",
  "daily limit",
  "Too Many Requests",
];

/** Maps a Gmail API failure to a typed, retryable decision. */
export function classifySendError(status: number, body: string = ""): GmailSendError {
  const text = (body || "").toLowerCase();

  if (status === 429 ||
    QUOTA_MARKERS.some((m) => text.includes(m.toLowerCase()))) {
    return new GmailSendError(
      "quota",
      status,
      "Gmail sending quota/rate limit exceeded — back off and stop this run.",
    );
  }

  // invalid_grant is an OAuth-credential fault, NOT a bad message. Google's
  // token endpoint returns it as HTTP 400, so this must be checked before any
  // status-code branch or the failure is misread as a permanently bad message.
  if (text.includes("invalid_grant") || text.includes("invalid_client")) {
    return new GmailSendError(
      "auth",
      status,
      "Gmail OAuth refresh token rejected (invalid_grant) — fix GMAIL_REFRESH_TOKEN.",
    );
  }

  if (status === 401 || status === 403) {
    if (status === 403) {
      return new GmailSendError(
        "quota",
        status,
        `Gmail returned 403 (${body.slice(0, 200) || "permission denied"}) — treat as send-cap failure.`,
      );
    }
    return new GmailSendError(
      "auth",
      status,
      "Gmail access token rejected — refresh and retry.",
    );
  }

  if (status >= 500) {
    return new GmailSendError("transient", status, `Gmail transient error (${status}) — retry later.`);
  }

  return new GmailSendError(
    "invalid",
    status,
    `Gmail rejected the message (${status}): ${body.slice(0, 300) || "no detail"}`,
  );
}

/** Exchanges the refresh token for a (cached) access token. */
export async function fetchAccessToken(
  config: GmailConfig,
  cache: AccessTokenCache,
): Promise<string> {
  const now = Date.now();
  if (cache.token && cache.expiresAt > now + 30_000) return cache.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw classifySendError(res.status, body);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(body);
  } catch {
    throw new GmailSendError("auth", res.status, "Gmail token response was not JSON.");
  }

  if (!json.access_token) {
    throw new GmailSendError("auth", res.status, "Gmail token response missing access_token.");
  }

  cache.token = json.access_token;
  cache.expiresAt = now + (json.expires_in ?? 3600) * 1000 - 60_000;
  return cache.token;
}

/**
 * Sends one MIME message via the Gmail API (OAuth2). Returns the provider
 * message id on success, throws GmailSendError otherwise.
 */
export async function gmailSendMessage(
  config: GmailConfig,
  cache: AccessTokenCache,
  parts: MailParts,
): Promise<{ id: string }> {
  const token = await fetchAccessToken(config, cache);
  const raw = buildRawMessage(parts);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64urlEncode(raw) }),
  });

  const body = await res.text();
  if (!res.ok) throw classifySendError(res.status, body);

  let json: { id?: string };
  try {
    json = JSON.parse(body);
  } catch {
    throw new GmailSendError("transient", res.status, "Gmail send response was not JSON.");
  }

  if (!json.id) {
    throw new GmailSendError("transient", res.status, "Gmail send response missing message id.");
  }

  return { id: json.id };
}