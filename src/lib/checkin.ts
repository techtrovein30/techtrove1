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
import { validateEmail } from "./validation";

/**
 * Sanitizes free-text search input before it is embedded into a PostgREST
 * `.or()` filter string. PostgREST treats `,` `(` `)` as filter grammar and
 * `%`/`_` as LIKE wildcards, so those are stripped: the term is reduced to a
 * bare word/phrase whitelist (letters, digits, space, `.` `-` `&`) and can
 * never alter the shape of the generated query (filter injection).
 */
function sanitizeCheckinSearch(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

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

/**
 * PostgREST returns snake_case column names (member_name, event_id…), while
 * the rest of the app uses camelCase. Map a raw registration_members row to
 * the shared CheckinMember shape (otherwise every multi-word field would be
 * undefined and the whole check-in card would fall back to blanks).
 */
function toCheckinMember(r: Record<string, unknown>): CheckinMember {
  return {
    id: r.id as string,
    registrationId: r.registration_id as string,
    registrationCode: r.registration_code as string,
    userId: r.user_id as string,
    eventId: r.event_id as string,
    eventName: r.event_name as string | null,
    teamName: r.team_name as string,
    captainName: r.captain_name as string,
    participantType: r.participant_type as "internal" | "external",
    paymentStatus: r.payment_status as string,
    memberName: r.member_name as string,
    memberRole: r.member_role as string,
    position: r.position as number,
    email: r.email as string,
    regNumber: r.reg_number as string | null,
    phone: r.phone as string | null,
    college: r.college as string | null,
    attended: r.attended as boolean,
    certificateId: r.certificate_id as string | null,
    certificateUrl: r.certificate_url as string | null,
    certificateIssuedAt: r.certificate_issued_at as string | null,
  };
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
  const safeTerm = sanitizeCheckinSearch(opts?.search ?? "");
  if (safeTerm) {
    const term = `%${safeTerm}%`;
    query = query.or(
      `member_name.ilike.${term},team_name.ilike.${term},captain_name.ilike.${term},registration_code.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Could not load check-in list.");
  return (data ?? []).map(toCheckinMember);
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
  return toCheckinMember(data as Record<string, unknown>);
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

  // Validate that the input is a real email before it touches a filter.
  const emailErr = validateEmail(email, "external");
  if (emailErr) throw new Error(emailErr);

  // Reject LIKE wildcards so the value can never expand into extra rows, and
  // match case-insensitively (stored emails may be mixed case).
  const clean = email.trim().toLowerCase();
  if (clean.includes("%") || clean.includes("_")) {
    throw new Error("Invalid email address.");
  }

  const { error } = await supabase
    .from("registration_members")
    .update({ attended })
    .ilike("email", clean);
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