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
import { getEvent } from "./eventStore";
import {
  REGISTRATION_TABLE_FOR,
  getParticipantById,
  getRegistrationById,
  getRegistrationsByUser,
  getRegistrationByCode,
} from "./db";
import type { RegistrationRow } from "./db";
import { uploadPaymentProof, adminDeletePaymentProof } from "./storage";
import { isIndividualEvent, validateRegisterNumber, validateEmail, validatePhoneNumber } from "./validation";

// Type-only import to keep db.ts's type import from forming a runtime cycle
export type { ParticipantRow } from "./db";

// ─── Internal row shape for inserts ────────────────────────────────────────

/** Raw registration row payload sent to Supabase (L04: no `any`). */
interface RegistrationInsertRow {
  id: string;
  registration_code: string;
  user_id: string;
  event_id: string;
  team_name: string;
  captain_name: string;
  payment_status: "pending" | "confirmed";
  terms_accepted: boolean;
  members: RegistrationMember[];
  utr_number?: string;
  payment_screenshot_path?: string;
  payment_screenshot_url?: string;
}

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

export type PaymentStatus = "pending" | "recorded" | "confirmed";

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
  paymentScreenshotPath?: string;
  paymentScreenshotUrl?: string;
  paymentReviewNote?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ID_RANDOM_LENGTH = 6;

/**
 * Generates a unique ID with a timestamp component + cryptographically random chars.
 * Format: PREFIX-<ts4>-<rand6>  e.g. TT-L8K2-A4FG9Z
 */
function makeId(prefix: string): string {
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = new Uint32Array(ID_RANDOM_LENGTH);
  crypto.getRandomValues(rand);
  let id = "";
  for (let i = 0; i < ID_RANDOM_LENGTH; i++) {
    id += ID_ALPHABET[rand[i] % ID_ALPHABET.length];
  }
  return `${prefix}-${ts}-${id}`;
}

/** Find the email for a username or reg-number across both participant tables. */
export async function resolveEmailByIdentifier(identifier: string): Promise<string | null> {
  const username = identifier.toLowerCase();
  const regNo = identifier.toUpperCase();
  for (const table of ["internal_participants", "external_participants"] as const) {
    // Exact matches only (eq), never ilike — prevents %/_ wildcard
    // enumeration (M01/M02).
    const { data, error } = await supabase
      .from(table)
      .select("email")
      .or(`username.eq.${username},reg_number.eq.${regNo}`)
      .limit(1);
    if (error) continue;
    if (data && data.length > 0) return data[0].email;
  }
  return null;
}

// ─── API ───────────────────────────────────────────────────────────────────

export const api = {
  // ── Sign out ──────────────────────────────────────────────────────────────
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  // ── Create a registration ─────────────────────────────────────────────────
  async createRegistration(input: {
    eventIds: string[];
    teamName: string;
    captainName: string;
    members: RegistrationMember[];
    termsAccepted: boolean;
    utrNumber?: string;
    paymentScreenshotPath?: string;
    paymentScreenshotUrl?: string;
  }): Promise<Registration[]> {
    if (!input.termsAccepted) throw new Error("Terms and conditions must be accepted.");

    if (input.eventIds.length === 0) throw new Error("No events selected.");

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    const profile = await getParticipantById(authUser.id);
    const participantType: ParticipantType = profile?.participant_type ?? "internal";
    const regTable = REGISTRATION_TABLE_FOR[participantType];

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

    const { data: existing } = await supabase
      .from(regTable)
      .select("id")
      .eq("user_id", authUser.id)
      .in("event_id", input.eventIds)
      .limit(1);

    if (existing && existing.length > 0) throw new Error("You have already registered for one or more of these events.");

    const regCode = makeId("TT");
    const screenshotPath = (input.paymentScreenshotPath ?? input.paymentScreenshotUrl)?.trim();
    
    if (participantType === "external") {
      if (!input.utrNumber?.trim()) throw new Error("UTR number is required for external participants.");
      if (!screenshotPath) throw new Error("Payment screenshot is required for external participants.");
    }

    const results: Registration[] = [];

    for (const eventId of input.eventIds) {
      const event = getEvent(eventId);
      if (!event) throw new Error("Event not found.");
      if (!event.registrationOpen) throw new Error("Registration for this event is closed.");

      const isIndividual = isIndividualEvent(event);
      const captainName = input.captainName.trim() || input.members[0]?.name.trim() || "";
      if (!captainName) throw new Error("Captain name is required.");

      const teamName = isIndividual ? (input.teamName.trim() || captainName) : input.teamName.trim();
      if (!teamName) throw new Error("Team name is required.");

      const regId = makeId("R");
      
      const regPayload: RegistrationInsertRow = {
        id: regId,
        registration_code: regCode,
        user_id: authUser.id,
        event_id: event.id,
        team_name: teamName,
        captain_name: captainName,
        payment_status: participantType === "internal" ? "confirmed" : "pending",
        terms_accepted: true,
        members: input.members.map((m) => ({
          name: m.name.trim(),
          role: m.role,
          position: m.position,
          participantType: m.participantType,
          email: m.email.trim(),
          regNumber: m.regNumber?.trim() || undefined,
          phone: m.phone?.trim() || undefined,
        })),
      };

      if (participantType === "external") {
        regPayload.utr_number = input.utrNumber!.trim();
        regPayload.payment_screenshot_path = screenshotPath!;
        regPayload.payment_screenshot_url = screenshotPath!;
      }

      const { data, error } = await supabase.from(regTable).insert(regPayload).select().single();
      if (error) {
        throw new Error(error.message || "Failed to create registration for event " + event.name);
      }
      results.push(mapRegistrationRow(data));
    }

    return results;
  },

  // ── List registrations for the signed-in user ─────────────────────────────
  async listMyRegistrations(): Promise<Registration[]> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    const rows = await getRegistrationsByUser(authUser.id);
    return rows.map(mapRegistrationRow);
  },

  // ── Look up a registration by code (receipt page; owner-only) ────────────
  async getRegistrationByCode(code: string): Promise<Registration> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    const row = await getRegistrationByCode(code);
    if (!row) throw new Error("Registration not found.");
    if (row.user_id !== authUser.id) throw new Error("Registration not found.");

    return mapRegistrationRow(row);
  },

  // ── Re-upload a payment screenshot (participant side) ────────────────────
  /**
   * Creates a fresh payment proof screenshot for a registration that had its
   * old screenshot deleted by an admin "Request Re-upload" action.
   *
   * Flow:
   *   1. Authenticate and verify registration ownership.
   *   2. Upload the new file to Storage (generates a new path).
   *   3. Call the participant_update_screenshot SECURITY DEFINER RPC to link
   *      the new path to the registration and clear the rejection note.
   *   4. If the RPC fails, delete the newly uploaded file so it is not
   *      orphaned in the bucket, then throw.
   *
   * The participant never gets a direct UPDATE on the registration table;
   * only the narrow RPC is used so fee/payment_status/event_id are protected.
   */
  async reuploadPaymentScreenshot(
    registrationId: string,
    file: File
  ): Promise<{ screenshotPath: string }> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    // Verify the registration belongs to this user before doing anything else.
    const row = await getRegistrationById(registrationId);
    if (!row || row.user_id !== authUser.id) {
      throw new Error("Registration not found.");
    }

    // Upload a new file — always generates a fresh path so the previous
    // (admin-deleted) object is not referenced.
    const screenshotPath = await uploadPaymentProof(
      authUser.id,
      registrationId,
      file,
    );

    // Call the narrow SECURITY DEFINER RPC to link the path and clear the note.
    const { error: rpcError } = await supabase.rpc(
      "participant_update_screenshot",
      {
        p_registration_id: registrationId,
        p_screenshot_path: screenshotPath,
      },
    );

    if (rpcError) {
      // The file was uploaded but the DB link failed — delete the orphaned
      // object so the bucket stays clean, then surface a clear error.
      console.error(
        "[participant] RPC participant_update_screenshot failed after upload:",
        rpcError,
      );
      await adminDeletePaymentProof(screenshotPath).catch((delErr) => {
        console.error(
          "[participant] Could not clean up orphaned screenshot after RPC failure:",
          delErr,
        );
      });
      throw new Error(
        "Your screenshot was uploaded but could not be linked to your registration. " +
          "Please try again or contact support.",
      );
    }

    return { screenshotPath };
  },
};

function mapRegistrationRow(r: RegistrationRow): Registration {
  const screenshotPath = r.payment_screenshot_path ?? r.payment_screenshot_url;
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
    paymentScreenshotPath: screenshotPath,
    paymentScreenshotUrl: screenshotPath,
    paymentReviewNote: r.payment_review_note ?? undefined,
  };
}
