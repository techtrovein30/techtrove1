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

/** Look a participant up by id. Returns null if absent. */
export async function getParticipantById(
  id: string,
): Promise<ParticipantRow | null> {
  const [internal, external] = await Promise.all([
    supabase
      .from("internal_participants")
      .select("*")
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("external_participants")
      .select("*")
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
      .select("*")
      .ilike("email", normalized)
      .maybeSingle(),

    supabase
      .from("external_participants")
      .select("*")
      .ilike("email", normalized)
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

/** All participants (used by the admin panel). */
export async function getAllParticipants(): Promise<ParticipantRow[]> {
  const [internal, external] = await Promise.all([
    supabase
      .from("internal_participants")
      .select("*")
      .order("created_at", { ascending: false }),

    supabase
      .from("external_participants")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (internal.error) {
    console.error("getAllParticipants internal error:", internal.error);
    throw new Error(internal.error.message);
  }

  if (external.error) {
    console.error("getAllParticipants external error:", external.error);
    throw new Error(external.error.message);
  }

  return [
    ...((internal.data ?? []) as unknown as ParticipantRow[]),
    ...((external.data ?? []) as unknown as ParticipantRow[]),
  ].sort((a, b) =>
    a.created_at > b.created_at ? -1 : 1,
  );
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
  payment_screenshot_url?: string;
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
  
  if (internal.error) console.error("getAllRegistrations internal error:", internal.error);
  if (external.error) console.error("getAllRegistrations external error:", external.error);

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