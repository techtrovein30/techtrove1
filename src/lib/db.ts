/**
 * db.ts
 * -----
 * Shared table-name helpers + cross-table lookups for the split
 * internal/external participant & registration schema.
 */

import { supabase } from "./supabase";
import type { ParticipantType } from "./api";

// ─── Table names ────────────────────────────────────────────────────────────

export const REGISTRATION_TABLE_FOR: Record<ParticipantType, string> = {
  internal: "registrations_internal",
  external: "registrations_external",
};

export const ALL_REGISTRATION_TABLES = [
  "registrations_internal",
  "registrations_external",
] as const;

// ─── Column sets ────────────────────────────────────────────────────────────
//
// Every PostgREST response is billed egress, so a read that only needs three
// columns must not ask for the whole row. These are the projection lists used
// by the hot admin paths; each one is the minimum that still answers the
// question being asked.
//
// created_at is always included because the paged fetches order by it.

const PARTICIPANT_PROFILE_COLUMNS =
  "id,username,full_name,email,participant_type,reg_number,college,phone,role,created_at";

const PARTICIPANT_IDENTITY_COLUMNS = "id,email,reg_number,created_at";

const PARTICIPANT_ADMIN_IDENTITY_COLUMNS = "id,email,role,created_at";

const REGISTRATION_HEADCOUNT_COLUMNS = "id,event_id,members,created_at";

const REGISTRATION_BY_EVENT_COLUMNS =
  "id,user_id,registration_code,team_name,captain_name,members,created_at";

// ─── Participant rows ───────────────────────────────────────────────────────

export interface ParticipantRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  participant_type: "internal" | "external";
  reg_number: string | null;
  college: string | null;
  phone: string | null;
  id_card_path?: string | null;
  role: "user" | "admin" | "coordinator" | null;
  created_at: string;
}

/** Look a participant up by id. Returns null if absent. */
export async function getParticipantById(
  id: string,
): Promise<ParticipantRow | null> {
  const [internal, external] = await Promise.all([
    supabase
      .from("internal_participants")
      .select(PARTICIPANT_PROFILE_COLUMNS)
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("external_participants")
      .select(PARTICIPANT_PROFILE_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (internal.error) {
    console.error("getParticipantById internal error:", internal.error);
    throw new Error(internal.error.message);
  }

  if (external.error) {
    console.error("getParticipantById external error:", external.error);
    throw new Error(external.error.message);
  }

  // A user should exist in exactly one participant table.
  if (internal.data && external.data) {
    console.error(
      "Data integrity error: participant exists in both participant tables:",
      id,
    );
    throw new Error("Participant exists in both participant tables.");
  }

  return (
    (internal.data as unknown as ParticipantRow | null) ??
    (external.data as unknown as ParticipantRow | null) ??
    null
  );
}

/** Look a participant up by email. Returns null if absent. */
export async function getParticipantByEmail(
  email: string,
): Promise<ParticipantRow | null> {
  const normalized = email.trim().toLowerCase();

  const [internal, external] = await Promise.all([
    supabase
      .from("internal_participants")
      .select(PARTICIPANT_PROFILE_COLUMNS)
      .eq("email", normalized)
      .maybeSingle(),

    supabase
      .from("external_participants")
      .select(PARTICIPANT_PROFILE_COLUMNS)
      .eq("email", normalized)
      .maybeSingle(),
  ]);

  if (internal.error) {
    console.error("getParticipantByEmail internal error:", internal.error);
    throw new Error(internal.error.message);
  }

  if (external.error) {
    console.error("getParticipantByEmail external error:", external.error);
    throw new Error(external.error.message);
  }

  // Email should belong to exactly one participant.
  if (internal.data && external.data) {
    console.error(
      "Data integrity error: email exists in both participant tables:",
      normalized,
    );
    throw new Error("Participant email exists in both participant tables.");
  }

  return (
    (internal.data as unknown as ParticipantRow | null) ??
    (external.data as unknown as ParticipantRow | null) ??
    null
  );
}

/**
 * Fetch EVERY row of a table, paging under the PostgREST row cap (1000) so
 * larger datasets don't get silently truncated (older registrations used to
 * vanish from the admin counts entirely).
 *
 * `columns` is passed straight through to `.select()`: a caller that only needs
 * a projection should never pay egress for the rest of the row.
 */
async function fetchAllRows(
  table: string,
  columns = "*",
  pageSize = 900,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table as never)
      .select(columns)
      .range(offset, offset + pageSize - 1)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(`${table} fetch error:`, error);
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as unknown[]));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

/** fetchAllRows across both participant tables, newest first. */
async function fetchAllParticipantRows(columns: string): Promise<ParticipantRow[]> {
  const [internal, external] = await Promise.all([
    fetchAllRows("internal_participants", columns),
    fetchAllRows("external_participants", columns),
  ]);

  return [
    ...(internal as unknown as ParticipantRow[]),
    ...(external as unknown as ParticipantRow[]),
  ].sort((a, b) =>
    a.created_at > b.created_at ? -1 : 1,
  );
}

/** All participants (used by the admin panel). */
export async function getAllParticipants(): Promise<ParticipantRow[]> {
  return fetchAllParticipantRows("*");
}

/**
 * Every participant, minus the columns only the roster export needs. Same rows
 * as getAllParticipants() — this is the admin Students page and the dashboard
 * count, so the only thing dropped here is id_card_path, which is a long
 * storage path nobody on those screens ever reads.
 */
export async function getParticipantDirectory(): Promise<ParticipantRow[]> {
  return fetchAllParticipantRows(PARTICIPANT_PROFILE_COLUMNS);
}

/**
 * Non-admin participant totals, counted by the database.
 *
 * getAdminStats() used to pull every participant row just to take a length and
 * two type counts; with a few thousand students that was the single largest
 * read on the dashboard and it bought three integers.
 */
export async function countNonAdminParticipants(): Promise<{
  total: number;
  internal: number;
  external: number;
}> {
  // internalUsers / externalUsers are counted per table, which is what the
  // dashboard showed before: a participant lives in exactly one of the two
  // tables, so table membership IS the participant type.
  const count = async (table: string): Promise<number> => {
    const { count: c, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .neq("role", "admin");
    if (error) {
      console.error(`${table} count error:`, error);
      return 0;
    }
    return c ?? 0;
  };

  const [internal, external] = await Promise.all([
    count("internal_participants"),
    count("external_participants"),
  ]);

  return { total: internal + external, internal, external };
}

/** id → email for admin accounts only (deletion-history attribution). */
export async function getAdminEmailById(): Promise<Map<string, string>> {
  const admins = await fetchAllParticipantRows(PARTICIPANT_ADMIN_IDENTITY_COLUMNS);
  const byId = new Map<string, string>();
  for (const a of admins) {
    if (a.role === "admin" && a.email) byId.set(a.id, a.email);
  }
  return byId;
}

export const ALL_PARTICIPANT_TABLES = [
  "internal_participants",
  "external_participants",
] as const;

/** Find which split participant table holds a participant id. Returns null if absent. */
export async function findParticipantTableById(
  userId: string,
): Promise<string | null> {
  for (const table of ALL_PARTICIPANT_TABLES) {
    const { data } = await supabase
      .from(table)
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return table;
  }
  return null;
}

// ─── Registration rows ──────────────────────────────────────────────────────

export interface RegistrationRow {
  id: string;
  registration_code: string;
  user_id: string;
  event_id: string;
  team_name: string;
  captain_name: string;
  fee: number;
  payment_status: "pending" | "recorded";
  terms_accepted: boolean;
  members: unknown;
  created_at: string;
  utr_number?: string;
  payment_proof_path?: string;       // used by registrations_internal (and registrations_external)
  payment_screenshot_path?: string;  // used by registrations_external only
  payment_screenshot_url?: string;   // used by registrations_external only
  payment_review_note?: string;
}

/** Find which table holds a registration id. Returns null if absent. */
export async function findRegistrationTableById(
  regId: string,
): Promise<string | null> {
  for (const table of ALL_REGISTRATION_TABLES) {
    const { data } = await supabase
      .from(table)
      .select("id")
      .eq("id", regId)
      .maybeSingle();
    if (data) return table;
  }
  return null;
}

/** Fetch a registration by id across both tables. Returns null if absent. */
export async function getRegistrationById(regId: string): Promise<RegistrationRow | null> {
  for (const table of ALL_REGISTRATION_TABLES) {
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("id", regId)
      .maybeSingle();
    if (data) return data as unknown as RegistrationRow;
  }
  return null;
}

/** All registrations from both tables, newest first (admin panel). */
export async function getAllRegistrations(): Promise<RegistrationRow[]> {
  const [internal, external] = await Promise.all([
    fetchAllRows("registrations_internal"),
    fetchAllRows("registrations_external"),
  ]);

  return [
    ...(internal as unknown as RegistrationRow[]),
    ...(external as unknown as RegistrationRow[]),
  ].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

/**
 * How many registrations point at each event, across both tables.
 *
 * The events admin screen only ever renders a number beside every event and a
 * number inside its delete warning, yet it was downloading every registration
 * row - fees, UTRs, payment-proof paths and all - to count them in the browser.
 * This asks for the one column those counts actually need, which keeps the same
 * number of round trips but drops the payload by roughly twenty times.
 */
export async function getRegistrationCountsByEvent(): Promise<Record<string, number>> {
  const [internal, external] = await Promise.all([
    fetchAllRows("registrations_internal", "event_id"),
    fetchAllRows("registrations_external", "event_id"),
  ]);

  const counts: Record<string, number> = {};
  for (const row of [...internal, ...external] as Array<{ event_id?: string | null }>) {
    const eventId = row.event_id;
    if (!eventId) continue;
    counts[eventId] = (counts[eventId] ?? 0) + 1;
  }
  return counts;
}

/**
 * event_id + members for every registration: the whole of what the coordinator
 * headcounts need.
 *
 * The coordinator overview only ever asks "how many people are on this event's
 * roster", so it used to download every fee, UTR and payment-proof path on both
 * registration tables to count JSON array lengths.
 */
export async function getRegistrationEventRows(): Promise<
  Array<{ id: string; event_id: string; members: unknown }>
> {
  const [internal, external] = await Promise.all([
    fetchAllRows("registrations_internal", REGISTRATION_HEADCOUNT_COLUMNS),
    fetchAllRows("registrations_external", REGISTRATION_HEADCOUNT_COLUMNS),
  ]);

  return [
    ...(internal as unknown as Array<{ id: string; event_id: string; members: unknown }>),
    ...(external as unknown as Array<{ id: string; event_id: string; members: unknown }>),
  ];
}

/**
 * Registrations for ONE event, newest first.
 *
 * The per-event roster fallback previously called getAllRegistrations() and
 * then filtered to a single event in the browser, which meant every coordinator
 * dashboard open downloaded the festival.
 */
export async function getRegistrationsByEvent(eventId: string): Promise<RegistrationRow[]> {
  const [internal, external] = await Promise.all([
    supabase
      .from("registrations_internal")
      .select(REGISTRATION_BY_EVENT_COLUMNS)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("registrations_external")
      .select(REGISTRATION_BY_EVENT_COLUMNS)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
  ]);

  return [
    ...((internal.data ?? []) as unknown as RegistrationRow[]),
    ...((external.data ?? []) as unknown as RegistrationRow[]),
  ].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

/** Registrations for one user across both tables, newest first. */
export async function getRegistrationsByUser(userId: string): Promise<RegistrationRow[]> {
  const [internal, external] = await Promise.all([
    supabase
      .from("registrations_internal")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("registrations_external")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  return [
    ...((internal.data ?? []) as unknown as RegistrationRow[]),
    ...((external.data ?? []) as unknown as RegistrationRow[]),
  ].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

/** Look a registration up by registration code across both tables. */
export async function getRegistrationByCode(code: string): Promise<RegistrationRow | null> {
  for (const table of ALL_REGISTRATION_TABLES) {
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("registration_code", code)
      .maybeSingle();
    if (data) return data as unknown as RegistrationRow;
  }
  return null;
}

export async function getRegistrationCountsByUser(): Promise<Record<string, number>> {
  // Only two things are needed here: which participant ids exist (via
  // email / reg number) and which registration codes they appear under. Fees,
  // team names, UTRs and screenshot paths were being transferred on every
  // dashboard load purely to be ignored below.
  const [registrations, participants] = await Promise.all([
    fetchCountingRegistrationRows(),
    fetchAllParticipantRows(PARTICIPANT_IDENTITY_COLUMNS),
  ]);

  const idByEmail = new Map<string, string>();
  const idByRegNo = new Map<string, string>();
  
  for (const p of participants) {
    if (p.email) idByEmail.set(p.email.toLowerCase(), p.id);
    if (p.reg_number) idByRegNo.set(p.reg_number.toLowerCase(), p.id);
  }

  const counts: Record<string, number> = {};
  // A flat pass (one registration_code covering several events) is ONE
  // registration — count each distinct code once per user instead of one per
  // event row, so counts stay aligned with the actual team entries.
  const countedEntries = new Set<string>();

  for (const reg of registrations) {
    const uniqueUserIdsInReg = new Set<string>();
    if (reg.user_id) uniqueUserIdsInReg.add(reg.user_id);
    
    if (Array.isArray(reg.members)) {
      for (const m of reg.members as any[]) {
        if (m.email) {
          const uid = idByEmail.get(String(m.email).toLowerCase());
          if (uid) uniqueUserIdsInReg.add(uid);
        }
        if (m.regNumber) {
          const uid = idByRegNo.get(String(m.regNumber).toLowerCase());
          if (uid) uniqueUserIdsInReg.add(uid);
        }
      }
    }
    
    for (const uid of uniqueUserIdsInReg) {
      const entryKey = `${uid}:${reg.registration_code}`;
      if (countedEntries.has(entryKey)) continue;
      countedEntries.add(entryKey);
      counts[uid] = (counts[uid] ?? 0) + 1;
    }
  }
  
  return counts;
}

/** Registrations reduced to the columns the per-user count actually reads. */
async function fetchCountingRegistrationRows(): Promise<RegistrationRow[]> {
  const columns = "id,user_id,registration_code,members,created_at";
  const [internal, external] = await Promise.all([
    fetchAllRows("registrations_internal", columns),
    fetchAllRows("registrations_external", columns),
  ]);

  return [
    ...(internal as unknown as RegistrationRow[]),
    ...(external as unknown as RegistrationRow[]),
  ].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}
