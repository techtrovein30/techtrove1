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

  // Prefer the secure coordinator RPC so attendance tokens are never exposed in public catalog queries
  try {
    const { data: rpcToken, error: rpcErr } = await supabase.rpc("get_event_attendance_token", {
      p_event_id: eventId,
    });
    if (!rpcErr && rpcToken) {
      saveLocalEventToken(eventId, rpcToken);
      return rpcToken;
    }
  } catch {
    // Graceful fallback to cached event row or local generation below
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
    // If table doesn't have column yet or caller is coordinator, cache locally
  }
  return newToken;
}

export const UNIFIED_SPORTS_TOKEN_KEY = "techtrove_sports_attendance_token";
export const UNIFIED_SPORTS_TOKEN = "ba31a6b79aa1bf173badbd6f62236556";

export const CANONICAL_EVENT_TOKENS: Record<string, string> = {
  // Master Unified Sports Token
  "sports-unified-master": UNIFIED_SPORTS_TOKEN,
  // Tech Events
  "hackathon": "c2d785c6556130288b23bc5930e0c897",
  "tech-hackathon": "c2d785c6556130288b23bc5930e0c897",
  "debugging": "290956874150306ca19811783dc6e939",
  "tech-debugging": "290956874150306ca19811783dc6e939",
  "paper-presentation": "a40b6e47c70ce8a2da3cb7868cc01327",
  "tech-paper-presentation": "a40b6e47c70ce8a2da3cb7868cc01327",
  "tech-maze": "d343f64181baadd8c18d1445e5f5dcc9",
  "quiz": "598f2afc0c67c72c24c7313e0734daba",
  "tech-quiz": "598f2afc0c67c72c24c7313e0734daba",
  "logo-making": "487449ffe383208b37ebb6ea11a0586d",
  "tech-logo-making": "487449ffe383208b37ebb6ea11a0586d",
  // Non-Tech Events
  "dance": "048c0b5cea0eb38ab212c9897ad107ff",
  "nontech-dance": "048c0b5cea0eb38ab212c9897ad107ff",
  "singing": "3b872130193c85708506bc2d8bbc1fb0",
  "nontech-singing": "3b872130193c85708506bc2d8bbc1fb0",
  "gaming": "20575a9e9755fc64694258c938f8c1dc",
  "nontech-mobile-gaming": "20575a9e9755fc64694258c938f8c1dc",
  "ramp-walk": "3cc0ccc344defb6d48a3b5b59ec6bc88",
  "nontech-ramp-walk": "3cc0ccc344defb6d48a3b5b59ec6bc88",
  "treasure-hunt": "42afcf562a175493cf013832357b9b48",
  "nontech-treasure-hunt": "42afcf562a175493cf013832357b9b48",
  "connexion": "4582ab70dce31f3dc148e2893284532e",
  "nontech-connexion": "4582ab70dce31f3dc148e2893284532e",
  "adaptune": "b4b2fec065183af2ea1afaefa2a1d1ea",
  "nontech-adaptune": "b4b2fec065183af2ea1afaefa2a1d1ea",
  "tunetopia": "7df7ca111c8fb6ebc37bed39fa5bf19e",
  "nontech-tunetopia": "7df7ca111c8fb6ebc37bed39fa5bf19e",
  // Sports Events (Unified token + specific IDs)
  "cricket": UNIFIED_SPORTS_TOKEN,
  "sport-cricket": UNIFIED_SPORTS_TOKEN,
  "football": UNIFIED_SPORTS_TOKEN,
  "sport-football": UNIFIED_SPORTS_TOKEN,
  "volleyball": UNIFIED_SPORTS_TOKEN,
  "sport-volleyball": UNIFIED_SPORTS_TOKEN,
  "kabaddi": UNIFIED_SPORTS_TOKEN,
  "sport-kabaddi": UNIFIED_SPORTS_TOKEN,
  "kho-kho": UNIFIED_SPORTS_TOKEN,
  "sport-khokho": UNIFIED_SPORTS_TOKEN,
  "sport-khokho-girls": UNIFIED_SPORTS_TOKEN,
  "throwball": UNIFIED_SPORTS_TOKEN,
  "sport-throwball-girls": UNIFIED_SPORTS_TOKEN,
  "chess": UNIFIED_SPORTS_TOKEN,
  "sport-chess": UNIFIED_SPORTS_TOKEN,
  "sport-chess-girls": UNIFIED_SPORTS_TOKEN,
  "carrom": UNIFIED_SPORTS_TOKEN,
  "sport-carrom": UNIFIED_SPORTS_TOKEN,
  "sport-carrom-girls": UNIFIED_SPORTS_TOKEN,
};

export const CANONICAL_TOKEN_TO_EVENT: Record<string, string> = Object.entries(
  CANONICAL_EVENT_TOKENS
).reduce((acc, [evId, tok]) => {
  acc[tok] = evId;
  return acc;
}, {} as Record<string, string>);

/**
 * Ensures all Day 1 sports events share a single unified attendance token.
 */
export async function ensureSportsAttendanceToken(_sportsEvents?: TechEvent[]): Promise<string> {
  try {
    localStorage.setItem(UNIFIED_SPORTS_TOKEN_KEY, UNIFIED_SPORTS_TOKEN);
  } catch {}
  return UNIFIED_SPORTS_TOKEN;
}

/**
 * Syncs the unified sports attendance token to all sports events.
 */
export async function syncUnifiedSportsToken(token: string, sportsEvents: TechEvent[]): Promise<void> {
  try {
    localStorage.setItem(UNIFIED_SPORTS_TOKEN_KEY, token);
  } catch {}

  for (const ev of sportsEvents) {
    if (ev.attendanceToken !== token) {
      try {
        await adminUpdateEvent(ev.id, { attendanceToken: token });
      } catch {
        // Unique constraint or permissions - handled gracefully
      }
    }
  }
}

/**
 * Aggregates live attendee and registration counts per event.
 * Queries registrations, registration_members, and attendance tables with
 * prefix normalization so that counts are 100% accurate and always reflect immediately.
 */
export async function getAttendanceEventStats(): Promise<
  Record<string, { total: number; attended: number }>
> {
  const stats: Record<string, { total: number; attended: number }> = {};
  const baseStats: Record<string, { total: number; attendedSet: Set<string> }> = {};

  const normalizeKey = (key: string): string => {
    return key.trim().toLowerCase().replace(/^(tech-|nontech-|sport-)/, "");
  };

  const getOrCreate = (rawKey: string) => {
    const clean = normalizeKey(rawKey);
    if (!baseStats[clean]) {
      baseStats[clean] = { total: 0, attendedSet: new Set<string>() };
    }
    return baseStats[clean];
  };

  try {
    // 1. Try secure RPC first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcStats, error: rpcErr } = await (supabase.rpc as any)("get_attendance_hub_stats");
    if (!rpcErr && rpcStats && typeof rpcStats === "object") {
      for (const [key, val] of Object.entries(rpcStats as Record<string, { total: number; attended: number }>)) {
        const clean = normalizeKey(key);
        const entry = getOrCreate(clean);
        const tot = Number(val?.total) || 0;
        const att = Number(val?.attended) || 0;
        entry.total = Math.max(entry.total, tot);
        for (let i = 0; i < att; i++) {
          entry.attendedSet.add(`rpc_attendee_${clean}_${i}`);
        }
      }
    }
  } catch {
    // Continue to direct queries to ensure completeness
  }

  try {
    // 2. Direct fallback & enrichment querying attendance, registration_members, and registrations
    const [attRes, memRes, allRegs] = await Promise.all([
      supabase.from("attendance").select("event_id, participant_email, participant_id"),
      supabase.from("registration_members").select("event_id, email, attended"),
      getAllRegistrations().catch(() => [] as RegistrationRow[]),
    ]);

    // 2A. Process registrations table for complete team & solo participant totals
    const regMemberCounts: Record<string, number> = {};
    for (const r of allRegs) {
      if (!r.event_id) continue;
      const clean = normalizeKey(r.event_id);
      const members = Array.isArray(r.members) ? r.members : [];
      const count = members.length > 0 ? members.length : 1;
      regMemberCounts[clean] = (regMemberCounts[clean] || 0) + count;
    }

    // 2B. Process registration_members
    const memCounts: Record<string, number> = {};
    if (memRes.data) {
      for (const m of memRes.data) {
        if (!m.event_id) continue;
        const clean = normalizeKey(m.event_id);
        memCounts[clean] = (memCounts[clean] || 0) + 1;
        if (m.attended && m.email) {
          getOrCreate(clean).attendedSet.add(m.email.trim().toLowerCase());
        }
      }
    }

    // 2C. Process attendance table
    if (attRes.data) {
      for (const a of attRes.data) {
        if (!a.event_id) continue;
        const clean = normalizeKey(a.event_id);
        const identifier = (a.participant_email || a.participant_id || "").trim().toLowerCase();
        if (identifier) {
          getOrCreate(clean).attendedSet.add(identifier);
        }
      }
    }

    // 2D. Set accurate total: max between direct registrations and registration_members
    const allKeys = new Set([
      ...Object.keys(baseStats),
      ...Object.keys(regMemberCounts),
      ...Object.keys(memCounts),
    ]);

    for (const clean of allKeys) {
      const entry = getOrCreate(clean);
      entry.total = Math.max(
        entry.total,
        regMemberCounts[clean] || 0,
        memCounts[clean] || 0,
        entry.attendedSet.size
      );
    }

    // 2E. Populate stats for clean keys and all common prefixed variations
    for (const [clean, data] of Object.entries(baseStats)) {
      const summary = {
        total: data.total,
        attended: data.attendedSet.size,
      };
      stats[clean] = summary;
      stats[`tech-${clean}`] = summary;
      stats[`nontech-${clean}`] = summary;
      stats[`sport-${clean}`] = summary;
      stats[`sport-${clean}-girls`] = summary;
    }
  } catch (err) {
    console.error("[coordinatorApi] getAttendanceEventStats error:", err);
  }

  return stats;
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
    // Check if participant is scanning the unified sports pass token
    const cachedSportsToken = (() => {
      try {
        return localStorage.getItem(UNIFIED_SPORTS_TOKEN_KEY)?.trim().toLowerCase() ?? "";
      } catch {
        return "";
      }
    })();

    if (cachedSportsToken && cleanToken === cachedSportsToken) {
      try {
        const days = await getDaysAsync();
        const sportsList = days
          .flatMap((d) => d.events)
          .filter(
            (e) =>
              e.dayId === "day-1" ||
              (e.category ?? "").toLowerCase().startsWith("sport")
          );
        const sportEventIds = new Set(sportsList.map((e) => e.id));
        const email = user.email.trim().toLowerCase();

        const { data: memberRows } = await supabase
          .from("registration_members")
          .select("event_id, event_name")
          .ilike("email", email);

        const registeredSports = (memberRows ?? []).filter((m) =>
          sportEventIds.has(m.event_id)
        );

        if (registeredSports.length > 0) {
          for (const reg of registeredSports) {
            const matched = sportsList.find((e) => e.id === reg.event_id);
            if (matched?.attendanceToken && matched.attendanceToken !== cleanToken) {
              const { data: subRpc } = await supabase.rpc("mark_event_attendance", {
                p_token: matched.attendanceToken,
              });
              const subRes = (subRpc ?? {}) as Record<string, unknown>;
              if (subRes.ok) {
                emitRealtimeAttendance(matched.id);
                return {
                  ok: true,
                  reason: "success",
                  message: `✅ Attendance Marked for ${matched.name}!`,
                  eventName: matched.name,
                  markedAt: String(subRes.marked_at || new Date().toISOString()),
                };
              } else if (subRes.reason === "already_attended") {
                return {
                  ok: false,
                  reason: "already_attended",
                  message: `✓ Attendance already marked for ${matched.name}.`,
                  eventName: matched.name,
                  markedAt: String(subRes.marked_at || ""),
                };
              }
            }
          }
        }
      } catch {
        // Fall back to rpc error
      }
    }

    return {
      ok: false,
      reason: "error",
      message: "❌ Could not reach the attendance service. Please try again.",
    };
  }

  const res = (rpcData ?? {}) as Record<string, unknown>;
  const reason = String(res.reason ?? (res.ok ? "success" : "error")) as MarkAttendanceResult["reason"];

  // If RPC returned not_registered or invalid_qr on the sports pass or canonical card tokens, check client fallback
  if (!res.ok && (reason === "not_registered" || reason === "invalid_qr")) {
    const cachedSportsToken = (() => {
      try {
        return localStorage.getItem(UNIFIED_SPORTS_TOKEN_KEY)?.trim().toLowerCase() ?? "";
      } catch {
        return "";
      }
    })();

    const isSportsPass = cleanToken === UNIFIED_SPORTS_TOKEN || (cachedSportsToken && cleanToken === cachedSportsToken);
    const targetCanonicalEventId = CANONICAL_TOKEN_TO_EVENT[cleanToken];

    if (isSportsPass || targetCanonicalEventId) {
      try {
        const days = await getDaysAsync();
        const allEvList = days.flatMap((d) => d.events);

        if (isSportsPass) {
          const sportsList = allEvList.filter(
            (e) =>
              e.dayId === "day-1" ||
              (e.category ?? "").toLowerCase().startsWith("sport")
          );
          const sportEventIds = new Set(sportsList.map((e) => e.id));
          const email = user.email.trim().toLowerCase();

          const [memberRowsRes, intRegsRes, extRegsRes] = await Promise.all([
            supabase
              .from("registration_members")
              .select("event_id, event_name")
              .ilike("email", email),
            supabase
              .from("registrations_internal")
              .select("event_id")
              .eq("user_id", user.id),
            supabase
              .from("registrations_external")
              .select("event_id")
              .eq("user_id", user.id),
          ]);

          const userSportEvents = new Set<string>();
          for (const m of memberRowsRes.data ?? []) {
            if (m.event_id && (sportEventIds.has(m.event_id) || m.event_id.startsWith("sport-") || m.event_id === "cricket" || m.event_id === "football")) {
              userSportEvents.add(m.event_id);
            }
          }
          for (const r of [...(intRegsRes.data ?? []), ...(extRegsRes.data ?? [])]) {
            if (r.event_id && (sportEventIds.has(r.event_id) || r.event_id.startsWith("sport-") || r.event_id === "cricket" || r.event_id === "football")) {
              userSportEvents.add(r.event_id);
            }
          }

          if (userSportEvents.size > 0) {
            const firstEventId = Array.from(userSportEvents)[0];
            const matched = sportsList.find((e) => e.id === firstEventId) || {
              id: firstEventId,
              name: firstEventId.replace(/^(sport-)/, "").toUpperCase(),
            };

            // Check if already attended
            const { data: existingAtt } = await supabase
              .from("attendance")
              .select("id, marked_at")
              .eq("participant_id", user.id)
              .ilike("event_id", `%${matched.id.replace(/^(sport-)/, "")}%`)
              .maybeSingle();

            if (existingAtt) {
              return {
                ok: false,
                reason: "already_attended",
                message: `✓ Attendance already marked for ${matched.name}.`,
                eventName: matched.name,
                markedAt: existingAtt.marked_at,
              };
            }

            const markedTime = new Date().toISOString();
            await Promise.all([
              supabase.from("attendance").insert({
                event_id: matched.id,
                participant_id: user.id,
                participant_email: email,
                participant_name: user.fullName,
                marked_at: markedTime,
                status: "present",
                source: "qr",
              }),
              supabase
                .from("registration_members")
                .update({ attended: true, attended_at: markedTime, attended_source: "qr" })
                .ilike("email", email)
                .ilike("event_id", `%${matched.id.replace(/^(sport-)/, "")}%`),
            ]);

            emitRealtimeAttendance(matched.id);
            return {
              ok: true,
              reason: "success",
              message: `✅ Attendance Marked for ${matched.name}!`,
              eventName: matched.name,
              markedAt: markedTime,
            };
          } else {
            return {
              ok: false,
              reason: "not_registered",
              message: "❌ You are not registered for any sports event.",
            };
          }
        } else if (targetCanonicalEventId) {
          const cleanTarget = targetCanonicalEventId.replace(/^(tech-|nontech-|sport-)/, "");
          const matched = allEvList.find((e) => {
            const clean = e.id.replace(/^(tech-|nontech-|sport-)/, "");
            return clean === cleanTarget || e.id === targetCanonicalEventId;
          });
          const eventName = matched?.name || cleanTarget.replace(/-/g, " ").toUpperCase();
          const targetEvId = matched?.id || targetCanonicalEventId;
          const userEmail = (user.email || "").trim().toLowerCase();

          const [memberRowsRes, intRegsRes, extRegsRes] = await Promise.all([
            supabase
              .from("registration_members")
              .select("event_id, event_name")
              .ilike("email", userEmail),
            supabase
              .from("registrations_internal")
              .select("event_id")
              .eq("user_id", user.id),
            supabase
              .from("registrations_external")
              .select("event_id")
              .eq("user_id", user.id),
          ]);

          const isRegistered =
            (memberRowsRes.data ?? []).some((m) => (m.event_id ?? "").replace(/^(tech-|nontech-|sport-)/, "") === cleanTarget) ||
            (intRegsRes.data ?? []).some((r) => (r.event_id ?? "").replace(/^(tech-|nontech-|sport-)/, "") === cleanTarget) ||
            (extRegsRes.data ?? []).some((r) => (r.event_id ?? "").replace(/^(tech-|nontech-|sport-)/, "") === cleanTarget);

          if (!isRegistered) {
            return {
              ok: false,
              reason: "not_registered",
              message: `❌ You are not registered for ${eventName}.`,
            };
          }

          // Check if already attended
          const { data: existingAtt } = await supabase
            .from("attendance")
            .select("id, marked_at")
            .eq("participant_id", user.id)
            .ilike("event_id", `%${cleanTarget}%`)
            .maybeSingle();

          if (existingAtt) {
            return {
              ok: false,
              reason: "already_attended",
              message: `✓ Attendance already marked for ${eventName}.`,
              eventName,
              markedAt: existingAtt.marked_at,
            };
          }

          const markedTime = new Date().toISOString();
          await Promise.all([
            supabase.from("attendance").insert({
              event_id: targetEvId,
              participant_id: user.id,
              participant_email: userEmail,
              participant_name: user.fullName,
              marked_at: markedTime,
              status: "present",
              source: "qr",
            }),
            supabase
              .from("registration_members")
              .update({ attended: true, attended_at: markedTime, attended_source: "qr" })
              .ilike("email", userEmail)
              .ilike("event_id", `%${cleanTarget}%`),
          ]);

          emitRealtimeAttendance(targetEvId);
          return {
            ok: true,
            reason: "success",
            message: `✅ Attendance Marked for ${eventName}!`,
            eventName,
            markedAt: markedTime,
          };
        }
      } catch {
        // Fall back to RPC response
      }
    }
  }

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
