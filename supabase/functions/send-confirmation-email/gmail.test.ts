/**
 * gmail.test.ts — pure unit tests for the Gmail API client helpers.
 * No network calls: base64url/header-encoding, raw MIME assembly and the
 * error classifier are deterministic pure functions.
 */

import { describe, expect, it } from "vitest";
import {
  base64urlEncode,
  buildRawMessage,
  classifySendError,
  encodeHeaderWord,
} from "./gmail.ts";

function fromBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

// ── base64url ───────────────────────────────────────────────────────────────

describe("base64urlEncode", () => {
  it("produces RFC 4648 base64url with no padding", () => {
    const out = base64urlEncode("hello");
    expect(out).toBe("aGVsbG8");
    expect(out).not.toMatch(/[+/]/);
    expect(out).not.toMatch(/=$/);
  });

  it("handles UTF-8 (no 1:1 byte-to-char assumption)", () => {
    expect(fromBase64(base64urlEncode("héllo ✓"))).toBe("héllo ✓");
  });

  it("maps + to - and / to _", () => {
    // Bytes that produce + and / in standard base64.
    const plus = base64urlEncode("\xfb");
    const slash = base64urlEncode("\xfe");
    expect(plus).not.toContain("+");
    expect(slash).not.toContain("/");
  });
});

// ── RFC 2047 header encoding ────────────────────────────────────────────────

describe("encodeHeaderWord", () => {
  it("passes through pure ASCII unchanged", () => {
    expect(encodeHeaderWord("Registration Confirmed")).toBe("Registration Confirmed");
  });

  it("B-encodes non-ASCII as =?UTF-8?B?...?=", () => {
    const out = encodeHeaderWord("Café");
    expect(out).toBe(`=?UTF-8?B?${Buffer.from("Café", "utf8").toString("base64")}?=`);
    expect(out).toMatch(/^=\?UTF-8\?B\?/);
  });
});

// ── raw MIME assembly ───────────────────────────────────────────────────────

describe("buildRawMessage", () => {
  const parts = {
    fromEmail: "techtrovein3.0@gmail.com",
    fromName: "TechTrove 3.0",
    toEmail: "aarav@example.com",
    toName: "Aarav",
    subject: "TechTrove 3.0 — Confirmed",
    html: "<b>You're in!</b>",
    text: "You're in!",
  };

  const raw = buildRawMessage(parts);

  it("sets From/To/Subject/Date/MIME-Version headers", () => {
    expect(raw).toContain(`From: TechTrove 3.0 <${parts.fromEmail}>`);
    expect(raw).toContain(`To: Aarav <${parts.toEmail}>`);
    expect(raw).toContain(`Subject: ${encodeHeaderWord(parts.subject)}`);
    expect(raw).toContain("Date: ");
    expect(raw).toContain("MIME-Version: 1.0");
    expect(raw).toContain(`Message-ID: <techtrove-`);
  });

  it("uses multipart/alternative with a boundary", () => {
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="----=_TechTrove_');
  });

  it("encodes both parts as base64 and text precedes html", () => {
    const blocks = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=]+)/g)]
      .map((m) => fromBase64(m[1]));
    expect(blocks[0]).toBe(parts.text);
    expect(blocks[1]).toBe(parts.html);
    expect(raw.indexOf("text/plain")).toBeLessThan(raw.indexOf("text/html"));
  });
});

// ── error classification ────────────────────────────────────────────────────

describe("classifySendError", () => {
  it("classifies HTTP 429 as quota", () => {
    expect(classifySendError(429, "Rate limit").kind).toBe("quota");
  });

  it("classifies 403 daily/quota markers as quota", () => {
    expect(classifySendError(403, '{"error":{"message":"SendAsQuotaExceededMessage"}}').kind).toBe("quota");
    expect(classifySendError(403, "daily limit exceeded").kind).toBe("quota");
  });

  it("classifies generic 403 as quota (send-cap)", () => {
    expect(classifySendError(403, '{"error":{"message":"permissionDenied"}}').kind).toBe("quota");
  });

  it("classifies invalid_grant as auth regardless of status", () => {
    expect(classifySendError(401, '{"error":"invalid_grant"}').kind).toBe("auth");
    expect(classifySendError(403, '{"error":"invalid_grant"}').kind).toBe("auth");
  });

  it("classifies the token endpoint's HTTP 400 invalid_grant as auth, not invalid", () => {
    const body =
      '{"error":"invalid_grant","error_description":"Token has been expired or revoked."}';
    expect(classifySendError(400, body).kind).toBe("auth");
  });

  it("classifies invalid_client as auth", () => {
    expect(classifySendError(401, '{"error":"invalid_client"}').kind).toBe("auth");
  });

  it("classifies plain 401 as auth", () => {
    expect(classifySendError(401, "unauthorized").kind).toBe("auth");
  });

  it("classifies 5xx as transient", () => {
    expect(classifySendError(500, "backendError").kind).toBe("transient");
    expect(classifySendError(503, "unavailable").kind).toBe("transient");
  });

  it("classifies 4xx validation failures as invalid/permanent", () => {
    expect(classifySendError(400, "invalid_headers").kind).toBe("invalid");
    expect(classifySendError(400, "invalid_headers").status).toBe(400);
  });
});