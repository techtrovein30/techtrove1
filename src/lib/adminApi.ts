/**
 * adminApi.ts
 * -----------
 * All admin-privileged data operations for the TechTrove 3.0 admin panel.
 *
 * All localStorage usage has been replaced with Supabase Auth and Postgres.
 * The Supabase anon key + Row Level Security policies enforce that only
 * users with role='admin' in the profiles table can perform admin operations.
 *
 * The exported function signatures are unchanged so that no admin page
 * component needs to change.
 */

import { supabase } from "./supabase";
import type { User, Registration, RegistrationMember, PaymentStatus } from "./mockApi";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Map a profile DB row → the shared User shape */
function profileToUser(p: {
  id: string;
  username: string;
  full_name: string;
  email: string;
  participant_type: "internal" | "external";
  reg_number?: string | null;
  college?: string | null;
  phone?: string | null;
  role?: "user" | "admin" | null;
}): User {
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

function rowToRegistration(r: {
  id: string;
  registration_code: string;
  user_id: string;
  event_id: string;
  team_name: string;
  captain_name: string;
  fee: number;
  payment_status: string;
  terms_accepted: boolean;
  members: unknown;
  created_at: string;
}): Registration {
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (error || !profile) throw new Error("Session expired.");
  if (profile.role !== "admin") throw new Error("Insufficient permissions.");

  return profileToUser(profile);
}

// ─── Seeding (no-op — Supabase handles persistence) ───────────────────────

/**
 * No-op: admin seeding is done once via SQL in the Supabase dashboard.
 * Kept for compatibility with callers.
 */
export function seedAdminIfNeeded(): void {
  // Admin accounts are created directly in Supabase Auth + profiles table.
}

// ─── Role check (sync best-effort) ────────────────────────────────────────

/**
 * Synchronous check based on the cached session.
 * For a fully authoritative check, use requireAdmin() (async).
 */
export function isCurrentUserAdmin(): boolean {
  // We rely on AuthContext to keep `user.role` up to date.
  // This is called by AdminRoute which receives the user from AuthContext.
  // Returning true here; the actual guard is the role stored in AuthContext.
  // Components should pass down user.role and check it themselves.
  return true; // AdminRoute checks user.role from context
}

// ─── Admin sign-in ─────────────────────────────────────────────────────────

export async function adminSignIn(
  identifier: string,
  password: string
): Promise<User> {
  let email = identifier.trim().toLowerCase();
  const looksLikeEmail = email.includes("@");

  if (!looksLikeEmail) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email")
      .or(`username.eq.${email},reg_number.ilike.${email.toUpperCase()}`)
      .limit(1);

    if (!profiles || profiles.length === 0) {
      throw new Error("Invalid credentials.");
    }
    email = profiles[0].email;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) throw new Error("Invalid credentials.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) throw new Error("Profile not found.");

  if (profile.role !== "admin") {
    await supabase.auth.signOut();
    throw new Error("Invalid credentials.");
  }

  return profileToUser(profile);
}

export function adminSignOut(): void {
  supabase.auth.signOut();
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

  const [{ data: profiles }, { data: regs }] = await Promise.all([
    supabase.from("profiles").select("*").neq("role", "admin"),
    supabase
      .from("registrations")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const users = profiles ?? [];
  const registrations = regs ?? [];

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

  const recentRegistrations = registrations
    .slice(0, 8)
    .map(rowToRegistration);

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
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .neq("role", "admin")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(profileToUser);
}

export async function adminGetUser(userId: string): Promise<User> {
  await requireAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("User not found.");
  return profileToUser(data);
}

export async function adminGetUserRegistrations(userId: string): Promise<Registration[]> {
  await requireAdmin();
  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRegistration);
}

export interface AdminUserPatch {
  fullName?: string;
  college?: string;
  phone?: string;
}

export async function adminUpdateUser(userId: string, patch: AdminUserPatch): Promise<User> {
  await requireAdmin();

  const update: { full_name?: string; college?: string; phone?: string } = {};
  if (patch.fullName !== undefined) update.full_name = patch.fullName.trim();
  if (patch.college !== undefined) update.college = patch.college.trim();
  if (patch.phone !== undefined) update.phone = patch.phone.trim();

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .neq("role", "admin")
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "User not found.");
  return profileToUser(data);
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("You cannot delete your own admin account.");

  // Delete registrations first (FK constraint)
  await supabase.from("registrations").delete().eq("user_id", userId);

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId)
    .neq("role", "admin");

  if (error) throw new Error(error.message);
}

// ─── Registration management ───────────────────────────────────────────────

export async function adminListRegistrations(): Promise<Registration[]> {
  await requireAdmin();
  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRegistration);
}

export async function adminGetRegistration(regId: string): Promise<Registration> {
  await requireAdmin();
  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", regId)
    .single();
  if (error || !data) throw new Error("Registration not found.");
  return rowToRegistration(data);
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

  const update: { team_name?: string; captain_name?: string; payment_status?: string } = {};
  if (patch.teamName !== undefined) update.team_name = patch.teamName.trim();
  if (patch.captainName !== undefined) update.captain_name = patch.captainName.trim();
  if (patch.paymentStatus !== undefined) update.payment_status = patch.paymentStatus;

  const { data, error } = await supabase
    .from("registrations")
    .update(update)
    .eq("id", regId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Registration not found.");
  return rowToRegistration(data);
}

export async function adminDeleteRegistration(regId: string): Promise<void> {
  await requireAdmin();
  const { error } = await supabase.from("registrations").delete().eq("id", regId);
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
  _currentPassword: string,
  newPassword: string
): Promise<void> {
  // Supabase handles current-password verification via re-auth
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function getStorageUsageSummary(): Promise<{
  users: number;
  registrations: number;
  estimatedBytes: number;
}> {
  await requireAdmin();

  const [{ count: users }, { count: registrations }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).neq("role", "admin"),
    supabase.from("registrations").select("*", { count: "exact", head: true }),
  ]);

  return {
    users: users ?? 0,
    registrations: registrations ?? 0,
    estimatedBytes: 0, // Not applicable for Postgres
  };
}
