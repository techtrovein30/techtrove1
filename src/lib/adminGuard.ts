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
  role: "user" | "admin";
}

/** Throws if the currently signed-in user is not an admin. */
export async function requireAdmin(): Promise<AdminView> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated.");

  const profile = await getParticipantById(authUser.id);
  if (!profile) throw new Error("Session expired.");

  if (profile.role !== "admin") {
    throw new Error("Insufficient permissions: account does not have admin role.");
  }

  return participantToView(profile);
}

function participantToView(p: ParticipantRow): AdminView {
  return {
    id: p.id,
    username: p.username,
    fullName: p.full_name,
    email: p.email,
    role: p.role ?? "user",
  };
}
