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
 * Throws when the RPC is unavailable so the profile can say "the pass could not
 * be loaded" instead of quietly rendering no QR at all — which is
 * indistinguishable from having no pass.
 */
export async function listMyCheckinPasses(): Promise<CheckinPass[]> {
  const { data, error } = await supabase.rpc("my_checkin_tokens");
  if (error) {
    console.error("[checkin-qr] my_checkin_tokens failed:", error);
    throw new Error(error.message || "Could not load your check-in pass.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toPass);
}

/** Why a scan failed — mapped straight from the RPC's `reason` column. */
export type ScanFailure = "invalid_token" | "not_registered" | "not_paid" | "revoked";

const SCAN_FAILURES: readonly string[] = [
  "invalid_token",
  "not_registered",
  "not_paid",
  "revoked",
];

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
 * Turn one row of `admin_scan_checkin()` into a result the UI can render.
 *
 * The RPC's `reason` strings and the TypeScript union above are one contract
 * spanning two languages: a reason this function does not recognise falls back
 * to `invalid_token` rather than reaching the desk as `undefined`, which would
 * otherwise render the generic "unrecognised code" panel and send a volunteer
 * hunting for a typo when the real problem is an unpaid registration. Tests
 * pin the mapping so the two sides cannot drift apart silently.
 */
export function toScanResult(row: Record<string, unknown>): ScanResult {
  if (row.ok !== true) {
    const reason = String(row.reason ?? "invalid_token");
    return {
      ok: false,
      reason: (SCAN_FAILURES.includes(reason) ? reason : "invalid_token") as ScanFailure,
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

  return toScanResult((data?.[0] ?? {}) as Record<string, unknown>);
}

export async function adminScanCheckinByCode(regCode: string): Promise<ScanResult> {
  const cleanCode = regCode.trim().toUpperCase();
  
  const { data, error } = await supabase
    .from("registration_members")
    .select("user_id, event_id, member_name, email, participant_type, attended, registration_code")
    .eq("registration_code", cleanCode);

  if (error || !data || data.length === 0) {
    return { ok: false, reason: "not_registered", displayName: null };
  }

  const email = data[0].email || "";
  const displayName = data[0].member_name || email;
  const participantType = data[0].participant_type as any;
  const alreadyAttended = data.filter(d => d.attended).length;
  
  if (alreadyAttended === data.length) {
    return {
      ok: true,
      email,
      displayName,
      participantType,
      membersChecked: 0,
      membersTotal: data.length,
      alreadyAttended: data.length,
      duplicate: true,
    };
  }

  const nowIso = new Date().toISOString();
  const updatePayload = { attended: true, attended_at: nowIso, attended_source: "admin_desk" };

  const { error: updErr } = await supabase
    .from("registration_members")
    .update(updatePayload)
    .eq("registration_code", cleanCode);

  if (updErr) throw new Error("Could not check in this registration code.");

  const attendanceRows = data.map(m => ({
    event_id: m.event_id,
    participant_id: m.user_id,
    participant_email: m.email || null,
    participant_name: m.member_name,
    registration_code: m.registration_code,
    status: "present",
    marked_at: nowIso,
    marked_by: "desk_admin",
  }));
  try {
    await supabase.from("attendance").upsert(attendanceRows, { onConflict: "event_id,participant_id" });
  } catch {}

  return {
    ok: true,
    email,
    displayName,
    participantType,
    membersChecked: data.length - alreadyAttended,
    membersTotal: data.length,
    alreadyAttended,
    duplicate: false,
  };
}

/**
 * React hook: the signed-in participant's check-in passes.
 * `refresh` is returned so the profile can re-fetch after an admin edits a
 * registration, and `available` tells the UI whether the SQL script has been
 * applied yet (a missing RPC surfaces as `error`).
 *
 * `selfEmail` is the signed-in account's email. The RPC flags the caller's own
 * pass with `is_self`, but that flag comes from current_user_email(), which
 * resolves the caller through internal_participants / external_participants —
 * so it comes back false for anyone whose participant row has not been created
 * yet, and the profile used to hide the whole pass section. Matching on the
 * signed-in email client-side recovers the caller's own pass in that case.
 */
export function useCheckinPasses(selfEmail?: string) {
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

  const own = selfEmail?.trim().toLowerCase() ?? "";

  const self =
    passes.find((p) => p.isSelf) ??
    (own ? passes.find((p) => p.email.trim().toLowerCase() === own) : undefined) ??
    null;
  const teammates = self ? passes.filter((p) => p !== self) : passes;

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
