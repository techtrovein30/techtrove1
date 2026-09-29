/**
 * checkinQr.ts
 * ------------
 * Data layer for the QR check-in pass — the second of the two check-in paths.
 * The manual "Check In" / "Uncheck" buttons in checkin.ts are untouched: a scan
 * simply flips the same `registration_members.attended` flag, and the manual
 * buttons still work for anyone whose QR will not scan.
 *
 * Everything goes through SECURITY DEFINER RPCs defined in
 * `query_checkin_qr.txt`:
 *   my_checkin_tokens()     -> the caller's pass + passes for their team
 *   admin_scan_checkin()    -> resolve a scanned token and check the player in
 *
 * The browser therefore never needs SELECT on `checkin_tokens` or UPDATE on
 * `registration_members`; the token is a secret credential, not a public id.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { buildQrPayload, extractQrToken, isValidToken } from "./qrToken";

/** One check-in pass. `isSelf` marks the signed-in participant's own pass. */
export interface CheckinPass {
  token: string;
  email: string;
  displayName: string;
  participantType: "internal" | "external" | null;
  isSelf: boolean;
  /** Ready-to-encode QR string, or null when the token is malformed. */
  payload: string | null;
}

function toPass(row: Record<string, unknown>): CheckinPass {
  const token = String(row.token ?? "");
  return {
    token,
    email: String(row.email ?? ""),
    displayName: String(row.display_name ?? "") || String(row.email ?? ""),
    participantType:
      row.participant_type === "internal" ? "internal" : row.participant_type === "external" ? "external" : null,
    isSelf: row.is_self === true,
    payload: buildQrPayload(token),
  };
}

/**
 * The signed-in participant's passes: their own first, then every member listed
 * on their registrations. A captain uses this to print the whole team's badges
 * from one place; a solo participant just sees the one card.
 *
 * Returns an empty array (never throws) when the RPC is unavailable, so a
 * missing SQL script degrades to "no QR shown" instead of breaking the profile
 * page for signed-in participants.
 */
export async function listMyCheckinPasses(): Promise<CheckinPass[]> {
  const { data, error } = await supabase.rpc("my_checkin_tokens");
  if (error) {
    console.error("[checkin-qr] my_checkin_tokens failed:", error);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toPass);
}

/** Why a scan failed — mapped straight from the RPC's `reason` column. */
export type ScanFailure = "invalid_token" | "not_registered" | "revoked";

export interface ScanSuccess {
  ok: true;
  email: string;
  displayName: string;
  participantType: "internal" | "external" | null;
  /** Memberships newly marked present by this scan. */
  membersChecked: number;
  /** Total memberships this player holds across all their events. */
  membersTotal: number;
  /** Memberships that were already present, i.e. a repeat scan. */
  alreadyAttended: number;
  /** True when nothing new was checked in, so the UI can say "already in". */
  duplicate: boolean;
}

export interface ScanFailureResult {
  ok: false;
  reason: ScanFailure;
  displayName: string | null;
}

export type ScanResult = ScanSuccess | ScanFailureResult;

/**
 * Check a player in from a scanned or hand-typed code.
 *
 * The same check-in as the manual button, but player-level: one scan covers
 * every event the participant registered for, matching
 * `adminTogglePlayerCheckin`. Accepts the canonical QR payload, a bare token,
 * or a deep link, so the scanner, the manual box and a pasted URL all funnel
 * through the same validation.
 */
export async function adminScanCheckin(raw: string): Promise<ScanResult> {
  const token = extractQrToken(raw);
  if (!token || !isValidToken(token)) {
    return { ok: false, reason: "invalid_token", displayName: null };
  }

  const { data, error } = await supabase.rpc("admin_scan_checkin", {
    p_token: token,
    p_source: "qr",
  });

  if (error) {
    throw new Error(error.message || "Could not check in this pass.");
  }

  const row = (data?.[0] ?? {}) as Record<string, unknown>;

  if (row.ok !== true) {
    const reason = String(row.reason ?? "invalid_token") as ScanFailure;
    return {
      ok: false,
      reason: reason === "revoked" || reason === "not_registered" ? reason : "invalid_token",
      displayName: (row.display_name as string | null) ?? null,
    };
  }

  const email = String(row.email ?? "");
  const alreadyAttended = Number(row.already_attended ?? 0);
  const membersChecked = Number(row.members_checked ?? 0);

  return {
    ok: true,
    email,
    displayName: String(row.display_name ?? "") || email,
    participantType:
      row.participant_type === "internal" ? "internal" : row.participant_type === "external" ? "external" : null,
    membersChecked,
    membersTotal: Number(row.members_total ?? 0),
    alreadyAttended,
    duplicate: membersChecked === 0 && alreadyAttended > 0,
  };
}

/**
 * React hook: the signed-in participant's check-in passes.
 * `reload` is returned so the profile can re-fetch after an admin edits a
 * registration, and `available` tells the UI whether the SQL script has been
 * applied yet (a missing RPC returns an empty list rather than an error).
 */
export function useCheckinPasses() {
  const [passes, setPasses] = useState<CheckinPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPasses(await listMyCheckinPasses());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your pass.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred into a microtask so no state is set synchronously inside the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const self = passes.find((p) => p.isSelf) ?? null;
  const teammates = passes.filter((p) => !p.isSelf);

  return {
    passes,
    self,
    teammates,
    loading,
    error,
    refresh,
    /** False once loading has settled and nothing came back. */
    available: !loading && passes.length > 0,
  };
}
