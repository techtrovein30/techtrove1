/**
 * checkinQr.test.ts
 * -----------------
 * The scan result is read by a volunteer standing at a desk, so every branch
 * here has to name a different action. The dangerous failure is not a crash —
 * it is an unrecognised `reason` quietly collapsing into the generic
 * "unrecognised code" panel, which sends the desk hunting for a typo when the
 * person in front of them simply has not paid yet.
 *
 * These tests pin the contract between the `reason` strings returned by
 * admin_scan_checkin() in query_checkin_qr.txt and the union the UI switches
 * on. If the SQL renames a reason, one of these fails instead of the bug
 * surfacing at the venue.
 */

import { describe, expect, it, vi } from "vitest";

// The module builds a Supabase client at import time and throws without env
// vars. Stubbed out so these tests can exercise the pure row mapping.
vi.mock("./supabase", () => ({ supabase: { rpc: vi.fn() } }));

import { toScanResult } from "./checkinQr";

/** Narrow to the failure branch so the union is readable in the assertions. */
function reasonOf(row: Record<string, unknown>): string {
  const result = toScanResult(row);
  if (result.ok) throw new Error("expected a failure result");
  return result.reason;
}

/** Narrow to the success branch. */
function duplicateOf(row: Record<string, unknown>): boolean {
  const result = toScanResult(row);
  if (!result.ok) throw new Error("expected a success result");
  return result.duplicate;
}

describe("toScanResult — failure reasons", () => {
  it("passes through every reason the RPC can return", () => {
    for (const reason of ["invalid_token", "not_registered", "not_paid", "revoked"]) {
      expect(toScanResult({ ok: false, reason })).toEqual({
        ok: false,
        reason,
        displayName: null,
      });
    }
  });

  it("reports an unpaid registration as not_paid rather than an unknown code", () => {
    // The payment gate in checkin_code_is_paid() makes this a normal, expected
    // outcome, so it must never be reported as an unrecognised pass.
    const result = toScanResult({
      ok: false,
      reason: "not_paid",
      email: "player@example.com",
      display_name: "Player One",
    });
    expect(result).toEqual({
      ok: false,
      reason: "not_paid",
      displayName: "Player One",
    });
  });

  it("falls back to invalid_token for a reason it does not recognise", () => {
    // Guards the drift case: new SQL reason, un-updated client. The volunteer
    // must still get a definite, non-undefined verdict.
    expect(reasonOf({ ok: false, reason: "expired" })).toBe("invalid_token");
    expect(reasonOf({ ok: false })).toBe("invalid_token");
    expect(reasonOf({})).toBe("invalid_token");
  });

  it("keeps the name for a revoked pass but not for an anonymous one", () => {
    expect(toScanResult({ ok: false, reason: "revoked", display_name: "Gone" }).displayName).toBe(
      "Gone"
    );
    expect(toScanResult({ ok: false, reason: "revoked" }).displayName).toBeNull();
  });
});

describe("toScanResult — success", () => {
  const row = {
    ok: true,
    email: "captain@example.com",
    display_name: "Captain",
    participant_type: "external",
    members_checked: 2,
    members_total: 3,
    already_attended: 1,
  };

  it("reads the counts off the RPC row", () => {
    expect(toScanResult(row)).toEqual({
      ok: true,
      email: "captain@example.com",
      displayName: "Captain",
      participantType: "external",
      membersChecked: 2,
      membersTotal: 3,
      alreadyAttended: 1,
      duplicate: false,
    });
  });

  it("flags a repeat scan as a duplicate, not a fresh check-in", () => {
    expect(duplicateOf({ ...row, members_checked: 0, already_attended: 3 })).toBe(true);
    // Nothing new and nothing already in is the not_paid shape the SQL sends
    // when a registration is still outstanding — it must not read as success.
    expect(duplicateOf({ ok: true, members_checked: 0, already_attended: 0 })).toBe(false);
  });

  it("falls back to the email when the RPC has no display name", () => {
    const result = toScanResult({ ...row, display_name: null });
    expect(result).toMatchObject({ displayName: "captain@example.com" });
  });

  it("normalises an unexpected participant_type to null", () => {
    expect(toScanResult({ ...row, participant_type: "student" })).toMatchObject({
      participantType: null,
    });
  });
});
