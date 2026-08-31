/**
 * api.ts
 * ----------
 * User-facing data layer for TechTrove 3.0.
 *
 * All localStorage usage has been replaced with Supabase Auth (for
 * sign-up / sign-in / sign-out) and Supabase Postgres (for registrations).
 *
 * The exported `api` object and all TypeScript types keep the same
 * signatures as before so that no page component needs to change.
 */

import { supabase } from "./supabase";
import { getEvent, eventToRow } from "./eventStore";
import {
  REGISTRATION_TABLE_FOR,
  getParticipantById,
  getRegistrationsByUser,
  getRegistrationByCode,
} from "./db";
import type { ParticipantRow, RegistrationRow } from "./db";

// Type-only import to keep db.ts's type import from forming a runtime cycle
export type { ParticipantRow } from "./db";

// ─── Public types (unchanged) ──────────────────────────────────────────────

export type ParticipantType = "internal" | "external";

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  participantType: ParticipantType;
  regNumber?: string;
  college?: string;
  phone?: string;
  role?: "user" | "admin";
}

export interface Session {
  userId: string;
}

export type MemberRole = "player" | "substitute";

export interface RegistrationMember {
  name: string;
  role: MemberRole;
  position: number;
  participantType: "internal" | "external";
  email: string;
  regNumber?: string;
  phone?: string;
}

export type PaymentStatus = "pending" | "recorded";

export interface Registration {
  id: string;
  registrationCode: string;
  userId: string;
  eventId: string;
  teamName: string;
  captainName: string;
  fee: number;
  paymentStatus: PaymentStatus;
  termsAccepted: boolean;
  members: RegistrationMember[];
  createdAt: string;
  utrNumber?: string;
  paymentScreenshotUrl?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isSaveethaEmail(email: string): boolean {
  return /^[^\s@]+@saveetha\.[a-z.]+$/i.test(email.trim());
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

function deriveUsername(fullName: string): string {
  const parts = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(".") : "member";
}

/** Find the email for a username or reg-number across both participant tables. */
export async function resolveEmailByIdentifier(identifier: string): Promise<string | null> {
  const username = identifier.toLowerCase();
  const regNo = identifier.toUpperCase();
  for (const table of ["internal_participants", "external_participants"] as const) {
    const { data, error } = await supabase
      .from(table)
      .select("email")
      .or(`username.eq.${username},reg_number.ilike.${regNo}`)
      .limit(1);
    if (error) continue;
    if (data && data.length > 0) return data[0].email;
  }
  return null;
}

/** Map a Supabase profile row → our User shape */
function profileToUser(profile: ParticipantRow): User {
  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    email: profile.email,
    participantType: profile.participant_type,
    regNumber: profile.reg_number ?? undefined,
    college: profile.college ?? undefined,
    phone: profile.phone ?? undefined,
    role: profile.role ?? "user",
  };
}

// ─── API ───────────────────────────────────────────────────────────────────

export const api = {
  // ── Sign up: internal students (Saveetha email required) ─────────────────
  async signUpInternal(input: {
    fullName: string;
    regNumber: string;
    email: string;
    password: string;
    phone: string;
  }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (!isSaveethaEmail(email)) {
      throw new Error(
        "Internal students must register with their Saveetha email (e.g. name@saveetha.com)."
      );
    }

    const username = deriveUsername(input.fullName);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          username,
          participant_type: "internal",
          reg_number: input.regNumber.trim().toUpperCase(),
          college: "SIMATS",
          phone: input.phone.trim(),
          role: "user",
        },
      },
    });

    if (error) {
      // Map Supabase errors to user-friendly messages
      if (error.message.includes("already registered")) {
        throw new Error(
          "An account with this email already exists. Try signing in."
        );
      }
      throw new Error(error.message);
    }

    if (!data.user) throw new Error("Sign-up failed. Please try again.");

    // Write the participant row into the internal table. The DB trigger also
    // creates one; the role-gate trigger keeps role in sync with the allowlist.
    const row: ParticipantRow = {
      id: data.user.id,
      username,
      full_name: input.fullName.trim(),
      email,
      participant_type: "internal",
      reg_number: input.regNumber.trim().toUpperCase(),
      college: "SIMATS",
      phone: input.phone.trim(),
      role: "user",
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("internal_participants")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (insertError) {
      // Still succeed — the row may already exist via the auth trigger
      const existing = await getParticipantById(data.user.id);
      if (existing) return profileToUser(existing);
    }

    // Fetch the row created by the DB trigger / upsert above
    const { data: dbRow, error: profileError } = await supabase
      .from("internal_participants")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError || !dbRow) {
      // Trigger lags behind — build from metadata
      return {
        id: data.user.id,
        username,
        fullName: input.fullName.trim(),
        email,
        participantType: "internal",
        regNumber: input.regNumber.trim().toUpperCase(),
        college: "SIMATS",
        phone: input.phone.trim(),
        role: "user",
      };
    }

    return profileToUser(dbRow as unknown as ParticipantRow);
  },

  // ── Sign up: external participants ────────────────────────────────────────
  async signUpExternal(input: {
    fullName: string;
    email: string;
    college: string;
    phone: string;
    password: string;
  }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const username = deriveUsername(input.fullName);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          username,
          participant_type: "external",
          college: input.college.trim(),
          phone: input.phone.trim(),
          role: "user",
        },
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        throw new Error(
          "An account with this email already exists. Try signing in."
        );
      }
      throw new Error(error.message);
    }

    if (!data.user) throw new Error("Sign-up failed. Please try again.");

    const row: ParticipantRow = {
      id: data.user.id,
      username,
      full_name: input.fullName.trim(),
      email,
      participant_type: "external",
      reg_number: null,
      college: input.college.trim(),
      phone: input.phone.trim(),
      role: "user",
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("external_participants")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (insertError) {
      const existing = await getParticipantById(data.user.id);
      if (existing) return profileToUser(existing);
    }

    const { data: dbRow, error: profileError } = await supabase
      .from("external_participants")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError || !dbRow) {
      return {
        id: data.user.id,
        username,
        fullName: input.fullName.trim(),
        email,
        participantType: "external",
        college: input.college.trim(),
        phone: input.phone.trim(),
        role: "user",
      };
    }

    return profileToUser(dbRow as unknown as ParticipantRow);
  },

  // ── Sign in ───────────────────────────────────────────────────────────────
  async signIn(identifier: string, password: string): Promise<User> {
    // Supabase Auth requires email. If they passed a username/reg-number,
    // we look up the email first (searched across both participant tables).
    let email = identifier.trim().toLowerCase();
    const looksLikeEmail = email.includes("@");

    if (!looksLikeEmail) {
      const resolved = await resolveEmailByIdentifier(email);
      if (!resolved) {
        throw new Error("Invalid credentials. Check your details and try again.");
      }
      email = resolved;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      throw new Error("Invalid credentials. Check your details and try again.");
    }

    const profile = await getParticipantById(data.user.id);
    if (!profile) {
      throw new Error("Account profile not found. Please contact support.");
    }

    return profileToUser(profile);
  },

  // ── Sign out ──────────────────────────────────────────────────────────────
  signOut(): void {
    // Fire-and-forget — AuthContext listens for the state change
    supabase.auth.signOut();
  },

  // ── Create a registration ─────────────────────────────────────────────────
  async createRegistration(input: {
    eventId: string;
    teamName: string;
    captainName: string;
    members: RegistrationMember[];
    termsAccepted: boolean;
    utrNumber?: string;
    paymentScreenshotUrl?: string;
  }): Promise<Registration> {
    if (!input.termsAccepted) throw new Error("Terms and conditions must be accepted.");

    const event = getEvent(input.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.registrationOpen) throw new Error("Registration for this event is closed.");

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    // Determine which split table this registration belongs to.
    const profile = await getParticipantById(authUser.id);
    const participantType: ParticipantType = profile?.participant_type ?? "internal";
    const regTable = REGISTRATION_TABLE_FOR[participantType];

    const required = event.requiredPlayers ?? 1;
    const maxSubs = event.maxSubstitutes ?? 0;

    const players = input.members.filter((m) => m.role === "player");
    const substitutes = input.members.filter((m) => m.role === "substitute");

    if (players.length !== required) {
      throw new Error(`This event requires exactly ${required} players.`);
    }
    if (substitutes.length > maxSubs) {
      throw new Error(`This event allows at most ${maxSubs} substitutes.`);
    }

    // Fee is now securely calculated by the database trigger before insert.
    // The client no longer submits the fee to prevent tampering.

    // Validate each member has required fields
    for (const m of input.members) {
      if (!m.name.trim()) throw new Error("All team members must have a name.");
      if (!m.email.trim()) throw new Error(`Email is required for ${m.name}.`);
      if (m.participantType === "internal" && !m.regNumber?.trim()) {
        throw new Error(`Registration number is required for SIMATS student ${m.name}.`);
      }
      if (m.participantType === "external" && !m.phone?.trim()) {
        throw new Error(`Phone number is required for external participant ${m.name}.`);
      }
    }

    // Check for duplicate registration in the matching split table
    const { data: existing } = await supabase
      .from(regTable)
      .select("id")
      .eq("user_id", authUser.id)
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) throw new Error("You have already registered for this event.");

    const members: RegistrationMember[] = input.members.map((m) => ({
      name: m.name.trim(),
      role: m.role,
      position: m.position,
      participantType: m.participantType,
      email: m.email.trim(),
      regNumber: m.regNumber?.trim() || undefined,
      phone: m.phone?.trim() || undefined,
    }));

    const regId = makeId("R");
    const regCode = makeId("TT");

    // Self-heal: make sure the event row exists in the events table so the
    // registrations_event_id_fkey foreign key can never fail.
    const { error: seedError } = await supabase
      .from("events")
      .upsert(eventToRow(event), { onConflict: "id" });
    if (seedError) {
      throw new Error(`Events table unavailable: ${seedError.message}`);
    }

    const regPayload: any = {
      id: regId,
      registration_code: regCode,
      user_id: authUser.id,
      event_id: event.id,
      team_name: input.teamName.trim(),
      captain_name: input.captainName.trim(),
      payment_status: "pending",
      terms_accepted: true,
      members,
    };

    if (participantType === "external") {
      if (!input.utrNumber?.trim()) throw new Error("UTR number is required for external participants.");
      if (!input.paymentScreenshotUrl?.trim()) throw new Error("Payment screenshot is required for external participants.");
      regPayload.utr_number = input.utrNumber.trim();
      regPayload.payment_screenshot_url = input.paymentScreenshotUrl.trim();
    }

    const { data: reg, error } = await supabase
      .from(regTable)
      .insert(regPayload)
      .select()
      .single();

    if (error || !reg) {
      throw new Error(error?.message ?? "Failed to create registration.");
    }

    return {
      id: reg.id,
      registrationCode: reg.registration_code,
      userId: reg.user_id,
      eventId: reg.event_id,
      teamName: reg.team_name,
      captainName: reg.captain_name,
      fee: reg.fee,
      paymentStatus: reg.payment_status as PaymentStatus,
      termsAccepted: reg.terms_accepted,
      members: reg.members as RegistrationMember[],
      createdAt: reg.created_at,
      utrNumber: reg.utr_number,
      paymentScreenshotUrl: reg.payment_screenshot_url,
    };
  },

  // ── List registrations for the signed-in user ─────────────────────────────
  async listMyRegistrations(): Promise<Registration[]> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    const rows = await getRegistrationsByUser(authUser.id);
    return rows.map(mapRegistrationRow);
  },

  // ── Look up a registration by code (public, e.g. for receipt page) ────────
  async getRegistrationByCode(code: string): Promise<Registration> {
    const row = await getRegistrationByCode(code);
    if (!row) throw new Error("Registration not found.");
    return mapRegistrationRow(row);
  },
};

function mapRegistrationRow(r: RegistrationRow): Registration {
  return {
    id: r.id,
    registrationCode: r.registration_code,
    userId: r.user_id,
    eventId: r.event_id,
    teamName: r.team_name,
    captainName: r.captain_name,
    fee: r.fee,
    paymentStatus: r.payment_status as PaymentStatus,
    termsAccepted: r.terms_accepted,
    members: r.members as RegistrationMember[],
    createdAt: r.created_at,
    utrNumber: r.utr_number,
    paymentScreenshotUrl: r.payment_screenshot_url,
  };
}
