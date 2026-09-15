/**
 * checkin.ts
 * ----------
 * Check-in helpers against the registration_members table (auto-populated
 * by a Supabase DB trigger when a registration is created).
 *
 * Only checked-in members (attended = true) are eligible for certificates —
 * the certificate_* columns live on the same row.
 */

import { supabase } from "./supabase";
import { requireAdmin } from "./adminGuard";
import { useCallback, useEffect, useState } from "react";

export interface CheckinMember {
  id: string;
  registrationId: string;
  registrationCode: string;
  userId: string;
  eventId: string;
  eventName: string | null;
  teamName: string;
  captainName: string;
  participantType: "internal" | "external";
  paymentStatus: string;
  memberName: string;
  memberRole: string;
  position: number;
  email: string;
  regNumber: string | null;
  phone: string | null;
  college: string | null;
  attended: boolean;
  certificateId: string | null;
  certificateUrl: string | null;
  certificateIssuedAt: string | null;
}

/** All registered members, newest first, with optional event / search filters. */
export async function adminListCheckinMembers(opts?: {
  eventId?: string;
  search?: string;
}): Promise<CheckinMember[]> {
  await requireAdmin();
  let query = supabase
    .from("registration_members")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts?.eventId) {
    query = query.eq("event_id", opts.eventId);
  }
  if (opts?.search?.trim()) {
    const term = `%${opts.search.trim().toUpperCase()}%`;
    query = query.or(
      `member_name.ilike.${term},team_name.ilike.${term},captain_name.ilike.${term},registration_code.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Could not load check-in list.");
  return (data ?? []) as unknown as CheckinMember[];
}

/** Toggle check-in for a single member. Returns the updated member. */
export async function adminToggleCheckin(
  memberId: string,
  attended: boolean
): Promise<CheckinMember> {
  await requireAdmin();
  const { data, error } = await supabase
    .from("registration_members")
    .update({ attended })
    .eq("id", memberId)
    .select()
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not update check-in.");
  }
  return data as unknown as CheckinMember;
}

/**
 * Check in (or undo) a player across EVERY event they registered for.
 * One tap covers all memberships for the same member (keyed by email), so a
 * participant in several events only needs a single check-in.
 */
export async function adminTogglePlayerCheckin(
  email: string,
  attended: boolean
): Promise<void> {
  await requireAdmin();
  const { error } = await supabase
    .from("registration_members")
    .update({ attended })
    .ilike("email", email.trim());
  if (error) throw new Error(error?.message || "Could not update player check-in.");
}

/** Check in (or undo) every member of a team registration in one shot. */
export async function adminBulkToggleCheckin(
  registrationId: string,
  attended: boolean
): Promise<void> {
  await requireAdmin();
  const { error } = await supabase
    .from("registration_members")
    .update({ attended })
    .eq("registration_id", registrationId);
  if (error) throw new Error(error?.message || "Could not update team check-in.");
}

export interface PlayerGroup {
  key: string;
  playerName: string;
  email: string;
  members: CheckinMember[];
  attended: boolean;
}

/**
 * React hook: live list of check-in members for the admin check-in page.
 * Rows are grouped by player (keyed by case-insensitive email) so a member
 * who registered for several events still only needs one check-in.
 * Filters after fetch (event filter) so realtime updates stay simple.
 */
export function useCheckinMembers(eventId?: string, search?: string) {
  const [members, setMembers] = useState<CheckinMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMembers(await adminListCheckinMembers({ eventId, search }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load check-in list.");
    } finally {
      setLoading(false);
    }
  }, [eventId, search]);

  // Deferred into a microtask so no state is set synchronously inside the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  // Realtime sync: reload when registration_members changes.
  useEffect(() => {
    const channel = supabase
      .channel("admin-checkin-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "registration_members" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Group every membership row under the same player (case-insensitive email).
  const players = new Map<string, PlayerGroup>();

  for (const m of members) {
    const key = m.email.trim().toLowerCase();
    const group =
      players.get(key) ?? {
        key,
        playerName: m.memberName,
        email: m.email.trim(),
        members: [],
        attended: true,
      };
    group.members.push(m);
    if (!m.attended) group.attended = false;
    players.set(key, group);
  }

  const playerList = Array.from(players.values());
  const attendedCount = playerList.filter((p) => p.attended).length;

  return { players: playerList, attendedCount, loading, error, refresh };
}