/**
 * adminGuard.ts
 * -------------
 * Shared, side-effect-free admin authorization guard.
 *
 * Kept dependency-light (supabase + db only) so both adminApi.ts and
 * eventStore.ts can use it without forming import cycles. This is a pure
 * authorization check — it must NEVER have side effects such as role
 * promotion (see audit finding H02).
 */

import { supabase } from "./supabase";
import { getParticipantById } from "./db";
import type { ParticipantRow } from "./db";

export interface AdminView {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: "user" | "admin" | "coordinator";
}

/**
 * How long a verified admin profile is reused before it is re-read.
 *
 * requireAdmin() runs on every admin API call, and each run costs an auth
 * round trip plus two participant lookups. A single admin screen can call it a
 * dozen times, and the realtime refetch loops call it again on every burst, so
 * the guard was one of the largest sources of request volume in the panel.
 *
 * The window is deliberately short: a demoted or signed-out admin keeps working
 * for at most this long, and every write is still rejected by RLS and by the
 * SECURITY DEFINER RPCs' own checks, so this is a latency optimisation rather
 * than the security boundary.
 */
const ADMIN_VIEW_TTL_MS = 30_000;

let cachedAdminView: { view: AdminView; at: number } | null = null;

/** Drops the memoised admin profile. Call on sign-out / role change. */
export function invalidateAdminViewCache(): void {
  cachedAdminView = null;
}

/** Throws if the currently signed-in user is not an admin. */
export async function requireAdmin(): Promise<AdminView> {
  if (cachedAdminView && Date.now() - cachedAdminView.at < ADMIN_VIEW_TTL_MS) {
    return cachedAdminView.view;
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    invalidateAdminViewCache();
    throw new Error("Not authenticated.");
  }

  const profile = await getParticipantById(authUser.id);
  if (!profile) {
    invalidateAdminViewCache();
    throw new Error("Session expired.");
  }

  if (profile.role !== "admin") {
    invalidateAdminViewCache();
    throw new Error("Insufficient permissions: account does not have admin role.");
  }

  const view = participantToView(profile);
  cachedAdminView = { view, at: Date.now() };
  return view;
}

/** Check if an email is present in the core admin allowlist (admin_allowlist table). */
export async function isCoreAdminUser(email?: string): Promise<boolean> {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const { data, error } = await supabase
      .from("admin_allowlist")
      .select("email")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

/** Throws if the currently signed-in user is not a core admin. */
export async function requireCoreAdmin(): Promise<AdminView> {
  const admin = await requireAdmin();
  const isCore = await isCoreAdminUser(admin.email);
  if (!isCore) {
    throw new Error("Insufficient permissions: account does not have core admin privileges.");
  }
  return admin;
}

export function participantToView(p: ParticipantRow): AdminView {
  return {
    id: p.id,
    username: p.username,
    fullName: p.full_name,
    email: p.email,
    role: p.role ?? "user",
  };
}
