/**
 * db.ts
 * -----
 * Shared table-name helpers + cross-table lookups for the split
 * internal/external participant & registration schema.
 */

import { supabase } from "./supabase";
import type { ParticipantType } from "./mockApi";

// ─── Table names ────────────────────────────────────────────────────────────

export const PARTICIPANT_TABLE_FOR: Record<ParticipantType, string> = {
  internal: "internal_participants",
  external: "external_participants",
};

export const ALL_PARTICIPANT_TABLES = [
  "internal_participants",
  "external_participants",
] as const;

export const REGISTRATION_TABLE_FOR: Record<ParticipantType, string> = {
  internal: "registrations_internal",
  external: "registrations_external",
};

export const ALL_REGISTRATION_TABLES = [
  "registrations_internal",
  "registrations_external",
] as const;

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
  role: "user" | "admin" | null;
  created_at: string;
}

/** Look a participant up by id across both tables. Returns null if absent. */
export async function getParticipantById(id: string): Promise<ParticipantRow | null> {
  for (const table of ALL_PARTICIPANT_TABLES) {
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) return data as unknown as ParticipantRow;
  }
  return null;
}

/** Look a participant up by email across both tables. Returns null if absent. */
export async function getParticipantByEmail(email: string): Promise<ParticipantRow | null> {
  const normalized = email.trim().toLowerCase();
  for (const table of ALL_PARTICIPANT_TABLES) {
    const { data } = await supabase
      .from(table)
      .select("*")
      .ilike("email", normalized)
      .maybeSingle();
    if (data) return data as unknown as ParticipantRow;
  }
  return null;
}

/** All participants from both tables (used by the admin panel). */
export async function getAllParticipants(): Promise<ParticipantRow[]> {
  const [internal, external] = await Promise.all([
    supabase.from("internal_participants").select("*"),
    supabase.from("external_participants").select("*"),
  ]);
  return [
    ...((internal.data ?? []) as unknown as ParticipantRow[]),
    ...((external.data ?? []) as unknown as ParticipantRow[]),
  ];
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
    supabase
      .from("registrations_internal")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("registrations_external")
      .select("*")
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
      .ilike("registration_code", code)
      .maybeSingle();
    if (data) return data as unknown as RegistrationRow;
  }
  return null;
}

/** Registration counts keyed by user_id (admin panel). */
export async function getRegistrationCountsByUser(): Promise<Record<string, number>> {
  const [internal, external] = await Promise.all([
    supabase.from("registrations_internal").select("user_id"),
    supabase.from("registrations_external").select("user_id"),
  ]);
  const counts: Record<string, number> = {};
  for (const row of internal.data ?? []) counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
  for (const row of external.data ?? []) counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
  return counts;
}