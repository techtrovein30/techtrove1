/**
 * api.ts
 * ----------
 * User-facing data layer for TechTrove 3.0.
 *
 * Participant authentication is handled only through Google OAuth (see
 * AuthContext); this module manages registrations against Supabase Postgres.
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
import type { RegistrationRow } from "./db";
import { isSportEvent, isIndividualEvent, validateRegisterNumber, validateEmail, validatePhoneNumber } from "./validation";

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

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
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

// ─── API ───────────────────────────────────────────────────────────────────

export const api = {
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

    const isSport = isSportEvent(event);
    const isIndividual = isIndividualEvent(event);
    const required = event.requiredPlayers ?? 1;
    const maxSubs = isSport ? (event.maxSubstitutes ?? 0) : 0;

    const players = input.members.filter((m) => m.role === "player");
    const substitutes = input.members.filter((m) => m.role === "substitute");

    if (!isSport && substitutes.length > 0) {
      throw new Error("Substitute players are not allowed for non-sport events.");
    }
    if (players.length !== required) {
      throw new Error(`This event requires exactly ${required} players.`);
    }
    if (substitutes.length > maxSubs) {
      throw new Error(`This event allows at most ${maxSubs} substitutes.`);
    }

    const captainName = input.captainName.trim() || input.members[0]?.name.trim() || "";
    if (!captainName) throw new Error("Captain name is required.");

    let teamName = input.teamName.trim();
    if (isIndividual) {
      teamName = teamName || captainName;
    } else if (!teamName) {
      throw new Error("Team name is required.");
    }

    // Fee is now securely calculated by the database trigger before insert.
    // The client no longer submits the fee to prevent tampering.

    // Validate each member has required fields
    for (const m of input.members) {
      if (!m.name.trim()) throw new Error("All team members must have a name.");
      
      const emailErr = validateEmail(m.email, m.participantType);
      if (emailErr) throw new Error(`${m.name}: ${emailErr}`);

      if (m.participantType === "internal") {
        const regErr = validateRegisterNumber(m.regNumber, "internal");
        if (regErr) throw new Error(`${m.name}: ${regErr}`);

        if (m.phone && m.phone.trim()) {
          const phoneErr = validatePhoneNumber(m.phone, false);
          if (phoneErr) throw new Error(`${m.name}: ${phoneErr}`);
        }
      } else {
        const phoneErr = validatePhoneNumber(m.phone, true);
        if (phoneErr) throw new Error(`${m.name}: ${phoneErr}`);
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
