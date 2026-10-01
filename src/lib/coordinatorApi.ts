/**
 * coordinatorApi.ts
 * -----------------
 * Data layer for the Coordinator-Based QR Attendance System.
 * Handles:
 *  1. Admin assigning, changing, and removing ONE main coordinator per event.
 *  2. Admin coordinator overview and statistics.
 *  3. Coordinator dashboard access (restricted strictly to assigned event).
 *  4. Secure event attendance token generation & validation.
 *  5. Student scanning & attendance verification and duplicate prevention.
 *  6. Realtime attendance synchronization.
 */

import { supabase } from "./supabase";
import { requireAdmin } from "./adminGuard";
import { getDaysAsync, adminUpdateEvent } from "./eventStore";
import { extractEventToken } from "./qrToken";
import type { TechEvent } from "../data/techtrove";
import type { User } from "./api";
import { getAllRegistrations, type RegistrationRow } from "./db";

export interface EventCoordinator {
  id: string;
  eventId: string;
  userId: string;
  name: string;
  email: string;
  mobile: string;
  createdAt: string;
}

export interface EventAttendanceRecord {
  id: string;
  eventId: string;
  participantId: string;
  participantEmail: string;
  participantName?: string;
  registrationId?: string;
  registrationCode?: string;
  markedAt: string;
  status: "present" | "absent";
  /** "qr" for a self-service scan, "manual" for a coordinator override. */
  source?: string;
}

export interface CoordinatorParticipant {
  id: string;
  name: string;
  email: string;
  mobile: string;
  registrationId: string;
  registrationCode: string;
  teamName: string;
  attended: boolean;
  attendedAt: string | null;
  participantType: "internal" | "external";
}

export interface CoordinatorEventSummary {
  event: TechEvent;
  coordinator: EventCoordinator | null;
  totalParticipants: number;
  attendedCount: number;
  attendancePercentage: number;
  status: "Active" | "Pending" | "Unassigned";
}

/**
 * Failure reasons the RPC can return. These are the SERVER's vocabulary, not the
 * UI's: each string comes straight out of query_coordinator_attendance.sql, so
 * the list is kept in sync with the SQL rather than invented here.
 */
export type MarkAttendanceReason =
  | "success"
  | "already_attended"
  | "not_registered"
  | "not_paid"
  | "no_profile"
  | "invalid_qr"
  | "event_disabled"
  | "not_logged_in"
  | "error";

export interface MarkAttendanceResult {
  ok: boolean;
  reason: MarkAttendanceReason;
  message: string;
  eventName?: string;
  markedAt?: string;
}

// ─── Local Storage Keys ─────────────────────────────────────────────────────
//
// Only the token cache is kept locally, purely so a coordinator's screen can
// re-render their QR without a round trip. It is never treated as a source of
// truth: coordinators and attendance both come from the database, because a
// per-browser copy would show a stale roster to the one person who most needs it
// to be right.
const LS_EVENT_TOKENS = "techtrove_event_tokens_v1";
const REALTIME_EVENT_NAME = "techtrove:attendance-update";

function emitRealtimeAttendance(eventId?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT_NAME, { detail: { eventId } }));
  }
}

function getLocalEventTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_EVENT_TOKENS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalEventToken(eventId: string, token: string) {
  try {
    const map = getLocalEventTokens();
    map[eventId] = token;
    map[token.toLowerCase()] = eventId;
    localStorage.setItem(LS_EVENT_TOKENS, JSON.stringify(map));
  } catch {
    // Ignore storage quota
  }
}

/** Generate a secure, non-guessable 32-character hex token */
export function generateSecureAttendanceToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Database Readiness Helpers ──────────────────────────────────────────

/**
 * Checks whether an error is due to missing database tables or unapplied migrations in Supabase.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "PGRST205" ||
    err.code === "42P01" ||
    (typeof err.message === "string" &&
      (err.message.includes("schema cache") ||
        err.message.includes("does not exist") ||
        err.message.includes("relation") ||
        err.message.includes("event_coordinators") ||
        err.message.includes("attendance")))
  );
}

/**
 * Checks whether the coordinator and attendance database tables exist in Supabase.
 */
export async function checkCoordinatorTablesReady(): Promise<{ ready: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("event_coordinators").select("id").limit(1);
    if (error && isMissingTableError(error)) {
      return {
        ready: false,
        error: "Table 'event_coordinators' is missing in the database schema cache.",
      };
    }
    return { ready: true };
  } catch (err) {
    return {
      ready: false,
      error: err instanceof Error ? err.message : "Error checking tables.",
    };
  }
}

// ─── Admin Coordinator Management ──────────────────────────────────────────

/**
 * List all coordinator assignments.
 *
 * Throws on failure rather than returning an empty list or a localStorage cache,
 * so a caller can tell "nobody is assigned" apart from "we could not ask".
 */
export async function adminListCoordinators(): Promise<EventCoordinator[]> {
  const { data, error } = await supabase
    .from("event_coordinators")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "Database setup required: Table 'event_coordinators' is missing in Supabase. Please run 'query_coordinator_attendance.sql' in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || "Could not load coordinators.");
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    eventId: String(r.event_id),
    // user_id is nullable: an appointee who has not signed in yet has none.
    userId: r.user_id ? String(r.user_id) : "",
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    mobile: String(r.mobile ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}

/**
 * Assign or change the ONE main coordinator for an event.
 * Enforces rule: ONLY ONE main coordinator per event.
 */
export async function adminAssignCoordinator(input: {
  eventId: string;
  userId: string;
  name: string;
  email: string;
  mobile: string;
}): Promise<EventCoordinator> {
  // requireAdmin is now awaited for its RESULT, not for its absence of error.
  // Swallowing it with .catch(() => {}) meant a logged-out or non-admin caller
  // sailed through this function and attempted the write anyway; the database
  // was the only thing still saying no, and only if RLS was enabled.
  await requireAdmin();

  const cleanEventId = input.eventId.trim();
  const cleanName = input.name.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanMobile = input.mobile.trim();

  if (!cleanEventId) throw new Error("Event ID is required.");
  if (!cleanName) throw new Error("Coordinator Name is required.");
  if (!cleanEmail) throw new Error("Coordinator Email is required.");
  if (!cleanMobile) throw new Error("Coordinator Mobile Number is required.");

  // Assigning goes through admin_assign_event_coordinator rather than writing to
  // event_coordinators directly, because that is where the one-coordinator-per-
  // event rule and the validation live. RLS has no client write policy on this
  // table at all.
  const { data, error } = await supabase.rpc("admin_assign_event_coordinator", {
    p_event_id: cleanEventId,
    p_name: cleanName,
    p_email: cleanEmail,
    p_mobile: cleanMobile,
  });

  if (error) {
    if (isMissingTableError(error) || error.message?.includes("admin_assign_event_coordinator")) {
      throw new Error(
        "Database migration required: Function 'admin_assign_event_coordinator' not found. Please run 'query_coordinator_attendance.sql' in Supabase SQL Editor."
      );
    }
    throw new Error(error.message || "Could not assign coordinator.");
  }

  const res = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(res.message ?? "Could not assign coordinator."));
  }

  const saved = (res.coordinator ?? {}) as Record<string, unknown>;

  // Mirror the assignment into the denormalised events.coordinator column used
  // by the public event listings. Best effort: the assignment itself is already
  // committed and authoritative.
  try {
    await adminUpdateEvent(cleanEventId, { coordinator: cleanName });
  } catch {
    // Non-fatal.
  }

  emitRealtimeAttendance(cleanEventId);

  return {
    id: String(saved.id ?? ""),
    eventId: cleanEventId,
    // user_id is nullable in SQL on purpose: a coordinator can be appointed by
    // email before they have ever signed in, and the link is claimed on first
    // sign-in by claim_coordinator_links().
    userId: saved.user_id ? String(saved.user_id) : "",
    name: String(saved.name ?? cleanName),
    email: String(saved.email ?? cleanEmail),
    mobile: String(saved.mobile ?? cleanMobile),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Remove coordinator from an event.
 */
export async function adminRemoveCoordinator(eventId: string): Promise<void> {
  await requireAdmin();

  const { error } = await supabase.rpc("admin_remove_event_coordinator", {
    p_event_id: eventId,
  });
  if (error) {
    if (isMissingTableError(error) || error.message?.includes("admin_remove_event_coordinator")) {
      throw new Error(
        "Database migration required: Function 'admin_remove_event_coordinator' not found. Please run 'query_coordinator_attendance.sql' in Supabase SQL Editor."
      );
    }
    throw new Error(error.message || "Could not remove coordinator.");
  }

  try {
    await adminUpdateEvent(eventId, { coordinator: "" });
  } catch {
    // Non-fatal.
  }

  emitRealtimeAttendance(eventId);
}

/**
 * Get the assigned coordinator for a specific event.
 */
export async function getEventCoordinator(eventId: string): Promise<EventCoordinator | null> {
  const list = await adminListCoordinators();
  return list.find((c) => c.eventId === eventId) ?? null;
}

/**
 * Get attendance statistics for a single event.
 */
export async function getEventAttendanceStats(eventId: string): Promise<{ totalParticipants: number; attendedCount: number }> {
  const parts = await getEventParticipants(eventId);
  const attended = parts.filter((p) => p.attended).length;
  return {
    totalParticipants: parts.length,
    attendedCount: attended,
  };
}

/**
 * Get coordinator summaries for all events (for `/admin/coordinators`).
 */
export async function adminGetCoordinatorSummaries(): Promise<CoordinatorEventSummary[]> {
  await requireAdmin();

  // Load festival days first. Even if event_coordinators or attendance tables haven't been
  // migrated yet in Supabase, we degrade gracefully so the admin can see their events list.
  const [days, coordinators, registrations, membersRes, attendanceRes] = await Promise.all([
    getDaysAsync(),
    adminListCoordinators().catch((err: Error) => {
      console.warn("[coordinatorApi] adminListCoordinators error (migration pending):", err.message);
      return [] as EventCoordinator[];
    }),
    getAllRegistrations().catch(() => [] as RegistrationRow[]),
    (async () => {
      const { data } = await supabase.from("registration_members").select("*");
      return (data ?? []) as Record<string, unknown>[];
    })(),
    (async () => {
      const { data } = await supabase.from("attendance").select("event_id");
      return (data ?? []) as Record<string, unknown>[];
    })(),
  ]);

  const allEvents = days.flatMap((d) => d.events);
  const coordByEvent = new Map<string, EventCoordinator>();
  coordinators.forEach((c) => coordByEvent.set(c.eventId, c));

  const allMembers = membersRes ?? [];

  // attendance is UNIQUE(event_id, participant_id), so a raw row count per event
  // is already the number of distinct people present.
  const attendedByEvent = new Map<string, number>();
  for (const row of attendanceRes) {
    const id = String(row.event_id ?? "");
    attendedByEvent.set(id, (attendedByEvent.get(id) ?? 0) + 1);
  }

  return allEvents.map((event) => {
    const coordinator = coordByEvent.get(event.id) ?? null;

    // Filter registrations/members for this event
    const eventMembers = allMembers.filter((m) => m.event_id === event.id);
    const eventRegs = registrations.filter((r) => r.event_id === event.id);

    // Expected people for this event, derived from the registrations themselves:
    // sum the members[] JSON array (captain + team), counting 1 when it is empty.
    //
    // This deliberately does NOT prefer registration_members even though that
    // table currently agrees row for row. It is trigger-populated, so it can only
    // ever be as complete as the trigger was, and it keeps rows for registrations
    // that were later deleted. The old code did the opposite -- `members.length
    // > 0 ? members.length : <count registrations>` -- which threw the roster away
    // for any event that had even one stale member row.
    const peopleFromRegs = eventRegs.reduce((sum, r) => {
      const members = Array.isArray(r.members) ? r.members : [];
      return sum + (members.length > 0 ? members.length : 1);
    }, 0);

    // registration_members is only a backstop for events that have no
    // registration rows at all, which should not happen but must not read as 0.
    const totalParticipants = peopleFromRegs > 0 ? peopleFromRegs : eventMembers.length;

    const attendedCount = Math.min(
      attendedByEvent.get(event.id) ?? 0,
      // Never report more arrivals than people on the roster.
      totalParticipants > 0 ? totalParticipants : Number.MAX_SAFE_INTEGER
    );

    const attendancePercentage = totalParticipants > 0
      ? Math.round((attendedCount / totalParticipants) * 100)
      : 0;

    const status: "Active" | "Pending" | "Unassigned" = coordinator
      ? (attendedCount > 0 ? "Active" : "Pending")
      : "Unassigned";

    return {
      event,
      coordinator,
      totalParticipants,
      attendedCount,
      attendancePercentage,
      status,
    };
  });
}

/**
 * Get all participants registered for a specific event.
 */
export async function getEventParticipants(eventId: string): Promise<CoordinatorParticipant[]> {
  // Attendance comes from the `attendance` table, which RLS scopes to this
  // coordinator's own event. It used to be overlaid from localStorage on top of
  // registration_members.attended, which meant the roster a coordinator saw was
  // partly their own browser's history: one coordinator could see fewer people
  // marked than another, and a browser with no history saw none.
  const [membersRes, attendanceRes, regs] = await Promise.all([
    supabase.from("registration_members").select("*").eq("event_id", eventId),
    (async () => {
      const { data } = await supabase
        .from("attendance")
        .select("participant_id,participant_email,marked_at")
        .eq("event_id", eventId);
      return { data: data ?? [] };
    })(),
    getAllRegistrations().catch(() => [] as RegistrationRow[]),
  ]);

  let allRegs = regs;
  if ((!allRegs || allRegs.length === 0) && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("techtrove_registrations");
      if (raw) allRegs = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  // Keyed by BOTH id and email: participant_id is text and the roster is matched
  // on the member's email, so a member whose account was linked after the fact
  // is still recognised as the same person.
  const attSet = new Map<string, string>();
  for (const row of (attendanceRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const at = row.marked_at ? String(row.marked_at) : new Date().toISOString();
    if (row.participant_id) attSet.set(String(row.participant_id).toLowerCase(), at);
    if (row.participant_email) attSet.set(String(row.participant_email).toLowerCase(), at);
  }

  const participants: CoordinatorParticipant[] = [];

  if (membersRes.data && membersRes.data.length > 0) {
    for (const m of membersRes.data) {
      const email = String(m.email ?? "").trim().toLowerCase();
      const uid = String(m.user_id ?? "").trim().toLowerCase();
      const localMarked = attSet.get(uid) || attSet.get(email);
      const isAttended = Boolean(m.attended || localMarked);

      participants.push({
        id: String(m.id || uid || email),
        name: String(m.member_name || "Participant"),
        email: String(m.email || ""),
        mobile: String(m.phone || "—"),
        registrationId: String(m.registration_id || ""),
        registrationCode: String(m.registration_code || ""),
        teamName: String(m.team_name || "Individual"),
        attended: isAttended,
        attendedAt: m.attended_at ? String(m.attended_at) : (localMarked || null),
        participantType: (m.participant_type as "internal" | "external") ?? "internal",
      });
    }
  } else {
    // Fall back to registrations
    const eventRegs = allRegs.filter((r) => r.event_id === eventId);
    for (const r of eventRegs) {
      if (Array.isArray(r.members) && r.members.length > 0) {
        for (const m of r.members as any[]) {
          const email = String(m.email ?? "").trim().toLowerCase();
          const localMarked = attSet.get(email) || attSet.get(r.user_id.toLowerCase());
          participants.push({
            id: email || r.id,
            name: m.name || r.captain_name,
            email: m.email || "",
            mobile: m.phone || "—",
            registrationId: r.id,
            registrationCode: r.registration_code,
            teamName: r.team_name,
            attended: Boolean(localMarked),
            attendedAt: localMarked || null,
            participantType: m.participantType ?? "internal",
          });
        }
      } else {
        const localMarked = attSet.get(r.user_id.toLowerCase());
        participants.push({
          id: r.id,
          name: r.captain_name,
          email: "",
          mobile: "—",
          registrationId: r.id,
          registrationCode: r.registration_code,
          teamName: r.team_name,
          attended: Boolean(localMarked),
          attendedAt: localMarked || null,
          participantType: "internal",
        });
      }
    }
  }

  return participants;
}

// ─── Coordinator Operations ────────────────────────────────────────────────

/**
 * Resolves whether the current user is assigned as coordinator for an event.
 * Enforces role-based constraint: coordinator only accesses their assigned event!
 */
export async function getAssignedCoordinatorEvent(
  user: User
): Promise<{ coordinator: EventCoordinator; event: TechEvent } | null> {
  let coordinators: EventCoordinator[] = [];
  try {
    coordinators = await adminListCoordinators();
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn("[coordinatorApi] Table missing in getAssignedCoordinatorEvent:", err);
    } else {
      throw err;
    }
  }

  const days = await getDaysAsync();
  const allEvents = days.flatMap((d) => d.events);
  const userEmail = user.email.trim().toLowerCase();
  const userId = user.id.trim();

  // Match on userId, or on the email they were appointed with.
  const match = coordinators.find(
    (c) => (!!c.userId && c.userId === userId) || c.email.trim().toLowerCase() === userEmail
  );

  if (match) {
    const event = allEvents.find((e) => e.id === match.eventId);
    if (event) return { coordinator: match, event };
  }

  return null;
}

/**
 * Ensures an event has an attendance token and returns it.
 */
export async function ensureEventAttendanceToken(eventId: string): Promise<string> {
  const localTokens = getLocalEventTokens();
  if (localTokens[eventId]) {
    return localTokens[eventId];
  }

  const days = await getDaysAsync();
  const event = days.flatMap((d) => d.events).find((e) => e.id === eventId);
  if (event?.attendanceToken) {
    saveLocalEventToken(eventId, event.attendanceToken);
    return event.attendanceToken;
  }

  const newToken = generateSecureAttendanceToken();
  saveLocalEventToken(eventId, newToken);
  try {
    await adminUpdateEvent(eventId, { attendanceToken: newToken });
  } catch {
    // If table doesn't have column yet, cache locally
  }
  return newToken;
}

/**
 * Extracts a clean event attendance token from a raw scanned value.
 *
 * Delegates to extractEventToken in qrToken.ts, which owns the `TTE1` wire
 * format and shares its validation with the pass parser. Returns an empty
 * string for anything unrecognised, because the caller sends this straight to
 * the RPC and a `null` would become the literal string "null".
 */
export function parseAttendanceToken(tokenRaw: string): string {
  return extractEventToken(tokenRaw) ?? "";
}

/**
 * Mark attendance when student scans an event QR code.
 * Backend / Data-Layer verifies:
 *  1. User is authenticated.
 *  2. Token belongs to a valid event.
 *  3. Student is registered for that event.
 *  4. Student has not already marked attendance.
 *  5. Inserts attendance record and timestamps it.
 */
export async function markEventAttendance(
  tokenRaw: string,
  user: User | null
): Promise<MarkAttendanceResult> {
  if (!user || !user.id) {
    return {
      ok: false,
      reason: "not_logged_in",
      message: "Please login to mark attendance.",
    };
  }

  // Extract clean token
  const cleanToken = parseAttendanceToken(tokenRaw);

  if (!cleanToken) {
    return {
      ok: false,
      reason: "invalid_qr",
      message: "❌ Invalid attendance QR.",
    };
  }

  // ── Server decides, always ───────────────────────────────────────────────
  // The token is the ONLY thing sent. The event and the participant are derived
  // server-side from it and from auth.uid(), so nothing here can talk the
  // backend into marking somebody else, in an event they were not admitted to,
  // or without payment.
  //
  // There is deliberately no client-side fallback. An earlier version tried the
  // RPC, and on ANY error re-implemented every check in the browser and wrote
  // to the tables directly - which meant the moment the RPC misbehaved, the
  // entire security model quietly became "trust this device". That is exactly
  // the failure the RPC exists to prevent, so a failure here is surfaced as an
  // error instead.
  const { data: rpcData, error: rpcError } = await supabase.rpc("mark_event_attendance", {
    p_token: cleanToken,
  });

  if (rpcError) {
    return {
      ok: false,
      reason: "error",
      message: "❌ Could not reach the attendance service. Please try again.",
    };
  }

  const res = (rpcData ?? {}) as Record<string, unknown>;
  const reason = String(res.reason ?? (res.ok ? "success" : "error")) as MarkAttendanceResult["reason"];

  // `already_attended` is a SUCCESS from the student's point of view and is
  // rendered as such, so surface the time they were originally marked.
  if (reason === "already_attended" && res.marked_at) {
    const when = new Date(String(res.marked_at));
    const formatted = Number.isNaN(when.getTime())
      ? String(res.marked_at)
      : when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return {
      ok: false,
      reason,
      message: `✓ Attendance already marked for this event at ${formatted}.`,
      eventName: res.event_name ? String(res.event_name) : undefined,
      markedAt: String(res.marked_at),
    };
  }

  if (res.ok) emitRealtimeAttendance(String(res.event_id ?? ""));

  return {
    ok: Boolean(res.ok),
    reason,
    message: String(
      res.message ||
        (res.ok ? "✅ Attendance Marked Successfully" : "Could not mark attendance.")
    ),
    eventName: res.event_name ? String(res.event_name) : undefined,
    markedAt: res.marked_at ? String(res.marked_at) : undefined,
  };
}

/**
 * Get user's attendance records across all events.
 */
export async function getStudentAttendanceHistory(
  userId: string,
  userEmail: string
): Promise<EventAttendanceRecord[]> {
  const email = userEmail.trim().toLowerCase();

  // Database only. A student clearing their browser used to lose their entire
  // attendance history, and a second device showed them nothing at all.
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .or(`participant_id.eq.${userId},participant_email.ilike.${email}`);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw new Error(error.message || "Could not load your attendance.");
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    participantId: String(r.participant_id),
    participantEmail: String(r.participant_email),
    participantName: r.participant_name ? String(r.participant_name) : undefined,
    registrationId: r.registration_id ? String(r.registration_id) : undefined,
    registrationCode: r.registration_code ? String(r.registration_code) : undefined,
    markedAt: String(r.marked_at),
    status: (r.status as "present" | "absent") || "present",
    source: r.source ? String(r.source) : undefined,
  }));
}

/**
 * Hook or listener for realtime attendance changes.
 */
export function subscribeToAttendanceUpdates(
  eventId: string | undefined,
  callback: () => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!eventId || !detail?.eventId || detail.eventId === eventId) {
      callback();
    }
  };

  window.addEventListener(REALTIME_EVENT_NAME, handler);

  // Also subscribe to Supabase Postgres Changes
  const channel = supabase
    .channel(`attendance-realtime-${eventId || "all"}-${Math.random().toString(36).slice(2, 6)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => callback())
    .on("postgres_changes", { event: "*", schema: "public", table: "registration_members" }, () => callback())
    .on("postgres_changes", { event: "*", schema: "public", table: "event_coordinators" }, () => callback())
    .subscribe();

  return () => {
    window.removeEventListener(REALTIME_EVENT_NAME, handler);
    supabase.removeChannel(channel);
  };
}
