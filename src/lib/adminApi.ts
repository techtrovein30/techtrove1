/**
 * adminApi.ts
 * -----------
 * All admin-privileged data operations for the TechTrove 3.0 admin panel.
 *
 * Works against the split internal/external participant and registration
 * tables. The Supabase anon key + app-level requireAdmin() guard enforce that
 * only users with role='admin' in a participant table can perform admin ops.
 */

import { supabase } from "./supabase";
import type { User, Registration, RegistrationMember, PaymentStatus } from "./api";
import { resolveEmailByIdentifier } from "./api";
import {
  ALL_REGISTRATION_TABLES,
  getParticipantById,
  getAllParticipants,
  getAllRegistrations,
  getRegistrationsByUser,
  getRegistrationCountsByUser,
  getRegistrationById,
  findRegistrationTableById,
  findParticipantTableById,
} from "./db";
import type { ParticipantRow, RegistrationRow } from "./db";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Map a participant row → the shared User shape */
function profileToUser(p: ParticipantRow): User {
  return {
    id: p.id,
    username: p.username,
    fullName: p.full_name,
    email: p.email,
    participantType: p.participant_type,
    regNumber: p.reg_number ?? undefined,
    college: p.college ?? undefined,
    phone: p.phone ?? undefined,
    role: p.role ?? "user",
  };
}

function rowToRegistration(r: RegistrationRow): Registration {
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
  };
}

/** Throws if the currently signed-in user is not an admin. */
async function requireAdmin(): Promise<User> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated.");

  const profile = await getParticipantById(authUser.id);
  if (!profile) throw new Error("Session expired.");
  if (profile.role !== "admin") throw new Error("Insufficient permissions.");

  return profileToUser(profile);
}

// ─── Seeding (no-op — Supabase handles persistence) ───────────────────────

/**
 * No-op: admin seeding is done once via SQL in the Supabase dashboard.
 * Kept for compatibility with callers.
 */
export function seedAdminIfNeeded(): void {
  // Admin accounts are created directly in Supabase Auth + participant tables.
}

// ─── Role check (sync best-effort) ────────────────────────────────────────

/**
 * Synchronous check based on the cached session.
 * For a fully authoritative check, use requireAdmin() (async).
 */
export function isCurrentUserAdmin(): boolean {
  // AdminRoute passes user.role from AuthContext — that is the actual guard.
  // This function is kept for backward compatibility but callers should
  // prefer checking user.role directly.
  return false; // Forces callers to use the async requireAdmin() path
}

// ─── Admin sign-in ─────────────────────────────────────────────────────────

export async function adminSignIn(
  identifier: string,
  password: string
): Promise<User> {
  let email = identifier.trim().toLowerCase();
  const looksLikeEmail = email.includes("@");

  if (!looksLikeEmail) {
    const resolved = await resolveEmailByIdentifier(email);
    if (!resolved) {
      throw new Error("Invalid credentials.");
    }
    email = resolved;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) throw new Error("Invalid credentials.");

  const profile = await getParticipantById(data.user.id);
  if (!profile) throw new Error("Profile not found.");

  if (profile.role !== "admin") {
    await supabase.auth.signOut();
    throw new Error("Invalid credentials.");
  }

  return profileToUser(profile);
}

export function adminSignOut(): void {
  supabase.auth.signOut();
}

/**
 * Begins the admin Google OAuth flow. After the user returns from Google,
 * they land back on /wch1925?oauth=google, where adminResolveOAuthAccess()
 * decides whether they get in (server-side allowlist check).
 */
export async function adminSignInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/wch1925?oauth=google",
    },
  });
  if (error) throw error;
}

/**
 * Called once after the Google OAuth round-trip.
 * Returns true only if the signed-in account's email is on the
 * admin_allowlist (checked server-side by the ensure_admin_access RPC),
 * in which case the participant row is created/promoted to role='admin'.
 */
export async function adminResolveOAuthAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const { data, error } = await supabase.rpc("ensure_admin_access");
  if (error) throw error;
  return data === true;
}

// ─── Statistics ────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  internalUsers: number;
  externalUsers: number;
  totalRegistrations: number;
  pendingPayments: number;
  recordedPayments: number;
  totalRevenue: number;
  perEvent: Record<string, number>;
  recentRegistrations: Registration[];
}

export async function getAdminStats(): Promise<AdminStats> {
  await requireAdmin();

  const users = (await getAllParticipants()).filter((u) => u.role !== "admin");
  const registrations = await getAllRegistrations();

  const perEvent: Record<string, number> = {};
  let pending = 0;
  let recorded = 0;
  let revenue = 0;

  for (const r of registrations) {
    perEvent[r.event_id] = (perEvent[r.event_id] ?? 0) + 1;
    if (r.payment_status === "pending") pending++;
    else recorded++;
    if (r.payment_status === "recorded") revenue += r.fee;
  }

  const recentRegistrations = registrations.slice(0, 8).map(rowToRegistration);

  return {
    totalUsers: users.length,
    internalUsers: users.filter((u) => u.participant_type === "internal").length,
    externalUsers: users.filter((u) => u.participant_type === "external").length,
    totalRegistrations: registrations.length,
    pendingPayments: pending,
    recordedPayments: recorded,
    totalRevenue: revenue,
    perEvent,
    recentRegistrations,
  };
}

// ─── User management ───────────────────────────────────────────────────────

export async function adminListUsers(): Promise<User[]> {
  await requireAdmin();
  const users = (await getAllParticipants())
    .filter((u) => u.role !== "admin")
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  return users.map(profileToUser);
}

export async function adminGetUser(userId: string): Promise<User> {
  await requireAdmin();
  const row = await getParticipantById(userId);
  if (!row) throw new Error("User not found.");
  return profileToUser(row);
}

export async function adminGetUserRegistrations(userId: string): Promise<Registration[]> {
  await requireAdmin();
  const rows = await getRegistrationsByUser(userId);
  return rows.map(rowToRegistration);
}

/** Returns registration counts keyed by user_id for all non-admin users. */
export async function adminGetAllRegistrationCounts(): Promise<Record<string, number>> {
  await requireAdmin();
  return getRegistrationCountsByUser();
}

export interface AdminUserPatch {
  fullName?: string;
  college?: string;
  phone?: string;
}

export async function adminUpdateUser(userId: string, patch: AdminUserPatch): Promise<User> {
  await requireAdmin();

  const row = await getParticipantById(userId);
  if (!row) throw new Error("User not found.");

  const table = await findParticipantTableById(userId);
  if (!table) throw new Error("User not found.");

  const update: { full_name?: string; college?: string; phone?: string } = {};
  if (patch.fullName !== undefined) update.full_name = patch.fullName.trim();
  if (patch.college !== undefined) update.college = patch.college.trim();
  if (patch.phone !== undefined) update.phone = patch.phone.trim();

  const { data, error } = await supabase
    .from(table)
    .update(update)
    .eq("id", userId)
    .neq("role", "admin")
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "User not found.");
  return profileToUser(data as unknown as ParticipantRow);
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("You cannot delete your own admin account.");

  // Delete registrations first (FK constraint) from both registration tables
  for (const table of ALL_REGISTRATION_TABLES) {
    await supabase.from(table).delete().eq("user_id", userId);
  }

  const row = await getParticipantById(userId);
  if (!row) throw new Error("User not found.");

  const table = await findParticipantTableById(userId);
  if (!table) throw new Error("User not found.");

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", userId)
    .neq("role", "admin");

  if (error) throw new Error(error.message);
}

// ─── Registration management ───────────────────────────────────────────────

export async function adminListRegistrations(): Promise<Registration[]> {
  await requireAdmin();
  const rows = await getAllRegistrations();
  return rows.map(rowToRegistration);
}

export async function adminGetRegistration(regId: string): Promise<Registration> {
  await requireAdmin();
  const row = await getRegistrationById(regId);
  if (!row) throw new Error("Registration not found.");
  return rowToRegistration(row);
}

export interface AdminRegistrationPatch {
  teamName?: string;
  captainName?: string;
  paymentStatus?: "pending" | "recorded";
}

export async function adminUpdateRegistration(
  regId: string,
  patch: AdminRegistrationPatch
): Promise<Registration> {
  await requireAdmin();

  const table = await findRegistrationTableById(regId);
  if (!table) throw new Error("Registration not found.");

  const update: { team_name?: string; captain_name?: string; payment_status?: string } = {};
  if (patch.teamName !== undefined) update.team_name = patch.teamName.trim();
  if (patch.captainName !== undefined) update.captain_name = patch.captainName.trim();
  if (patch.paymentStatus !== undefined) update.payment_status = patch.paymentStatus;

  const { data, error } = await supabase
    .from(table)
    .update(update)
    .eq("id", regId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Registration not found.");
  return rowToRegistration(data as unknown as RegistrationRow);
}

export async function adminDeleteRegistration(regId: string): Promise<void> {
  await requireAdmin();
  const table = await findRegistrationTableById(regId);
  if (!table) throw new Error("Registration not found.");
  const { error } = await supabase.from(table).delete().eq("id", regId);
  if (error) throw new Error(error.message);
}

// ─── Admin account settings ────────────────────────────────────────────────

export interface AdminAccountInfo {
  id: string;
  username: string;
  fullName: string;
  email: string;
}

export async function getAdminAccountInfo(): Promise<AdminAccountInfo> {
  const admin = await requireAdmin();
  return {
    id: admin.id,
    username: admin.username,
    fullName: admin.fullName,
    email: admin.email,
  };
}

export async function adminChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // Re-authenticate with current password before allowing the change
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.email) throw new Error("Not authenticated.");

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: authUser.email,
    password: currentPassword,
  });
  if (signInError) throw new Error("Current password is incorrect.");

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function getStorageUsageSummary(): Promise<{
  users: number;
  registrations: number;
  estimatedBytes: number;
}> {
  await requireAdmin();

  const counts = await Promise.all([
    supabase.from("internal_participants").select("*", { count: "exact", head: true }).neq("role", "admin"),
    supabase.from("external_participants").select("*", { count: "exact", head: true }).neq("role", "admin"),
    supabase.from("registrations_internal").select("*", { count: "exact", head: true }),
    supabase.from("registrations_external").select("*", { count: "exact", head: true }),
  ]);

  const users = (counts[0].count ?? 0) + (counts[1].count ?? 0);
  const registrations = (counts[2].count ?? 0) + (counts[3].count ?? 0);

  return {
    users,
    registrations,
    estimatedBytes: (users * 256) + (registrations * 512),
  };
}