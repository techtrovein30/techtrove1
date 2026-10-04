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
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { getAllRegistrations, type RegistrationRow } from "./db";

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

/**
 * Exactly the columns toCheckinMember reads, plus created_at for the sort.
 * registration_members is the biggest table in the schema, and this query runs
 * on the check-in desk where every scan used to trigger a full re-read of it.
 */
const CHECKIN_MEMBER_COLUMNS =
  "id,registration_id,registration_code,user_id,event_id,event_name,team_name,captain_name,participant_type,payment_status,member_name,member_role,position,email,reg_number,phone,college,attended,certificate_id,certificate_url,certificate_issued_at,created_at";

/**
 * The individual sport disciplines, keyed by their prefix-stripped event id.
 *
 * These are the only sports that get their own roster; everything else rolls up
 * into SPORT_AGGREGATE_IDS.
 */
const SPORT_EVENT_KEYS = [
  "cricket",
  "football",
  "volleyball",
  "kabaddi",
  "khokho",
  "khokho-girls",
  "throwball-girls",
  "chess",
  "chess-girls",
  "carrom",
  "carrom-girls",
] as const;

/**
 * Event ids that mean "every sport" rather than one discipline. The desk uses
 * the `sports` attendance bucket to let a sport roster see attendance recorded
 * under any of these.
 */
const SPORT_AGGREGATE_IDS = [
  "sports-unified-master",
  "sports-unified",
  "sports",
  "ba31a6b79aa1bf173badbd6f62236556",
] as const;

function stripEventPrefix(id: string): string {
  return id.replace(/^(tech-|nontech-|sport-)/, "");
}

/**
 * Is this event one of the individual sports?
 *
 * NOTE: this deliberately does NOT include SPORT_AGGREGATE_IDS. The member-side
 * and attendance-side attendance checks have historically disagreed about
 * "sports-unified" — the attendance side treats it as a sport, the member side
 * does not. Unifying them would change which members show as attended, so this
 * helper preserves the stricter (member-side) meaning and
 * `isSportAggregateEvent` below keeps the looser one. Reconciling the two is a
 * separate decision, not something to smuggle into an egress fix.
 */
function isSportEvent(id: string): boolean {
  const raw = (id || "").trim().toLowerCase();
  if (!raw) return false;
  return raw.startsWith("sport-") || (SPORT_EVENT_KEYS as readonly string[]).includes(stripEventPrefix(raw));
}

/** The looser membership test, used only when indexing attendance rows. */
function isSportAggregateEvent(id: string): boolean {
  const raw = (id || "").trim().toLowerCase();
  return (SPORT_AGGREGATE_IDS as readonly string[]).includes(raw as any) || isSportEvent(raw);
}

/**
 * Every `attendance.event_id` spelling whose rows can affect this desk's roster.
 *
 * The attendance read used to be unscoped, so every desk refresh re-downloaded
 * the whole attendance table — free while it is empty, but megabytes once a
 * 6,000-person event has scanned through it.
 *
 * It cannot simply be narrowed with `.eq("event_id", opts.eventId)`:
 *   - members are fetched with a strict eq(), but
 *   - a member is matched against `${email}::${eventId}`, `${email}::${cleanEventId}`
 *     and, for sports, `${email}::sports`,
 * so the matching attendance rows can carry a prefixed or aggregate id. A bare
 * eq() would return none of them and silently mark nobody attended — worse than
 * the egress problem it fixes.
 *
 * Returns null when there is no event filter (the "All events" view), because
 * that caller genuinely needs attendance for every event.
 */
export function attendanceEventAliases(eventId?: string): string[] | null {
  const raw = (eventId || "").trim().toLowerCase();
  if (!raw) return null;

  const clean = stripEventPrefix(raw);
  const ids = new Set<string>([raw, clean]);
  if (isSportAggregateEvent(raw)) {
    for (const k of SPORT_EVENT_KEYS) {
      ids.add(k);
      ids.add(`sport-${k}`);
    }
    for (const k of SPORT_AGGREGATE_IDS) ids.add(k);
  }
  return [...ids];
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
    .select(CHECKIN_MEMBER_COLUMNS)
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

  // Scoped to the events this roster can actually match. See
  // attendanceEventAliases() for why a bare .eq() would be wrong here.
  const attendanceQuery = supabase
    .from("attendance")
    .select(
      "event_id, participant_email, participant_id, participant_name, registration_code, status"
    );
  const attAliases = attendanceEventAliases(opts?.eventId);
  if (attAliases) attendanceQuery.in("event_id", attAliases);

  const [membersRes, attRes] = await Promise.all([query, attendanceQuery]);

  // Widened to match the synthesized fallback below: when registration_members
  // has no rows for this event we rebuild equivalent rows from the registration
  // tables, and those objects are plain records rather than the select() shape.
  let rawMemberRows: Record<string, unknown>[] =
    (membersRes.data ?? []) as unknown as Record<string, unknown>[];

  if (rawMemberRows.length === 0) {
    const allRegs = await getAllRegistrations().catch(() => [] as RegistrationRow[]);
    const synth: Record<string, unknown>[] = [];
    for (const r of allRegs) {
      if (opts?.eventId) {
        const cleanReq = opts.eventId.replace(/^(tech-|nontech-|sport-)/, "").toLowerCase();
        const cleanEv = (r.event_id || "").replace(/^(tech-|nontech-|sport-)/, "").toLowerCase();
        if (r.event_id !== opts.eventId && cleanEv !== cleanReq) continue;
      }
      const members = Array.isArray(r.members) ? (r.members as any[]) : [];
      const isInternal = members[0]?.participantType === "internal";
      if (members.length > 0) {
        members.forEach((m, idx) => {
          synth.push({
            id: `${r.id}_${idx}`,
            registration_id: r.id,
            registration_code: r.registration_code,
            user_id: r.user_id,
            event_id: r.event_id,
            team_name: r.team_name,
            captain_name: r.captain_name,
            participant_type: m.participantType ?? (isInternal ? "internal" : "external"),
            payment_status: r.payment_status || "confirmed",
            member_name: m.name || r.captain_name,
            member_role: m.role || (idx === 0 ? "captain" : "player"),
            position: m.position ?? idx,
            email: m.email || (idx === 0 ? r.captain_name : ""),
            reg_number: m.regNumber || null,
            phone: m.phone || null,
            college: m.college || null,
            attended: false,
          });
        });
      } else {
        synth.push({
          id: r.id,
          registration_id: r.id,
          registration_code: r.registration_code,
          user_id: r.user_id,
          event_id: r.event_id,
          team_name: r.team_name,
          captain_name: r.captain_name,
          participant_type: isInternal ? "internal" : "external",
          payment_status: r.payment_status || "confirmed",
          member_name: r.captain_name,
          member_role: "captain",
          position: 0,
          email: "",
          reg_number: null,
          phone: null,
          college: null,
          attended: false,
        });
      }
    }

    if (safeTerm) {
      const termLower = safeTerm.toLowerCase();
      rawMemberRows = synth.filter(
        (m: any) =>
          String(m.member_name || "")
            .toLowerCase()
            .includes(termLower) ||
          String(m.team_name || "")
            .toLowerCase()
            .includes(termLower) ||
          String(m.captain_name || "")
            .toLowerCase()
            .includes(termLower) ||
          String(m.registration_code || "")
            .toLowerCase()
            .includes(termLower) ||
          String(m.email || "")
            .toLowerCase()
            .includes(termLower)
      );
    } else {
      rawMemberRows = synth;
    }
  }

  const attPresentSet = new Set<string>();
  if (attRes.data) {
    for (const a of attRes.data) {
      if (a.status && a.status !== "present") continue;
      const email = (a.participant_email || "").trim().toLowerCase();
      const uid = (a.participant_id || "").trim().toLowerCase();
      const code = (a.registration_code || "").trim().toLowerCase();
      const ev = (a.event_id || "").trim().toLowerCase();
      const cleanEv = stripEventPrefix(ev);
      const isSport = isSportAggregateEvent(ev);

      if (code) {
        attPresentSet.add(`code::${code}`);
        attPresentSet.add(`code::${code}::${ev}`);
        attPresentSet.add(`code::${code}::${cleanEv}`);
        if (isSport) {
          attPresentSet.add(`code::${code}::sports`);
        }
      }
      if (email) {
        attPresentSet.add(`${email}::${ev}`);
        attPresentSet.add(`${email}::${cleanEv}`);
        if (isSport) {
          attPresentSet.add(`${email}::sports`);
        }
      }
      if (uid) {
        attPresentSet.add(`${uid}::${ev}`);
        attPresentSet.add(`${uid}::${cleanEv}`);
        if (isSport) {
          attPresentSet.add(`${uid}::sports`);
        }
      }
    }
  }

  const registeredKeys = new Set<string>();
  const list: CheckinMember[] = rawMemberRows.map((row) => {
    const m = toCheckinMember(row);
    const email = (m.email || "").trim().toLowerCase();
    const uid = (m.userId || "").trim().toLowerCase();
    const code = (m.registrationCode || "").trim().toLowerCase();
    const ev = (m.eventId || "").trim().toLowerCase();
    const cleanEv = stripEventPrefix(ev);
    const isSport = isSportEvent(ev);

    const isAttended =
      m.attended ||
      (code && (
        attPresentSet.has(`code::${code}`) ||
        attPresentSet.has(`code::${code}::${ev}`) ||
        attPresentSet.has(`code::${code}::${cleanEv}`) ||
        (isSport && attPresentSet.has(`code::${code}::sports`))
      )) ||
      attPresentSet.has(`${email}::${ev}`) ||
      attPresentSet.has(`${email}::${cleanEv}`) ||
      attPresentSet.has(`${uid}::${ev}`) ||
      attPresentSet.has(`${uid}::${cleanEv}`) ||
      (isSport && (attPresentSet.has(`${email}::sports`) || attPresentSet.has(`${uid}::sports`)));

    if (code) {
      registeredKeys.add(`code::${code}`);
    }
    if (email) {
      registeredKeys.add(`${email}::${ev}`);
      registeredKeys.add(`${email}::${cleanEv}`);
    }
    if (uid) {
      registeredKeys.add(`${uid}::${ev}`);
      registeredKeys.add(`${uid}::${cleanEv}`);
    }

    return {
      ...m,
      attended: Boolean(isAttended),
    };
  });

  // If there are attendance records in public.attendance that don't have a matching
  // registration_members row, include them so they are visible under "Checked In"
  if (attRes.data) {
    for (const a of attRes.data) {
      if (a.status && a.status !== "present") continue;
      const email = (a.participant_email || "").trim().toLowerCase();
      const uid = (a.participant_id || "").trim().toLowerCase();
      const code = (a.registration_code || "").trim().toLowerCase();
      const ev = (a.event_id || "").trim().toLowerCase();
      const cleanEv = stripEventPrefix(ev);
      if (!email && !uid && !code) continue;

      if (
        (code && registeredKeys.has(`code::${code}`)) ||
        (email &&
          (registeredKeys.has(`${email}::${ev}`) || registeredKeys.has(`${email}::${cleanEv}`))) ||
        (uid && (registeredKeys.has(`${uid}::${ev}`) || registeredKeys.has(`${uid}::${cleanEv}`)))
      ) {
        continue;
      }

      registeredKeys.add(`${email}::${ev}`);
      list.push({
        id: a.participant_id || a.participant_email || `att_${Math.random()}`,
        registrationId: a.registration_code || "SCAN",
        registrationCode: a.registration_code || "ATT-SCAN",
        userId: a.participant_id || "",
        eventId: a.event_id,
        eventName: a.event_id,
        teamName: "Individual",
        captainName: a.participant_email || "Attendee",
        participantType: "internal",
        paymentStatus: "confirmed",
        memberName: a.participant_email || "Attendee",
        memberRole: "participant",
        position: 0,
        email: a.participant_email || "",
        regNumber: null,
        phone: null,
        college: null,
        attended: true,
        certificateId: null,
        certificateUrl: null,
        certificateIssuedAt: null,
      });
    }
  }

  return list;
}

/** Toggle check-in for a single member or their entire team registration. Returns the updated member. */
export async function adminToggleCheckin(
  memberId: string,
  attended: boolean
): Promise<CheckinMember> {
  await requireAdmin();

  // 1. Fetch current member details
  const { data: memberRow, error: fetchErr } = await supabase
    .from("registration_members")
    .select(CHECKIN_MEMBER_COLUMNS)
    .eq("id", memberId)
    .maybeSingle();

  if (fetchErr || !memberRow) {
    throw new Error(fetchErr?.message || "Could not find member record.");
  }

  const member = toCheckinMember(memberRow as Record<string, unknown>);
  const cleanEmail = (member.email || "").trim().toLowerCase();
  const regId = member.registrationId;
  const regCode = member.registrationCode;
  const aliases = attendanceEventAliases(member.eventId) || [member.eventId];
  const nowIso = new Date().toISOString();

  // 2. Update registration_members table (if part of a team registration, sync entire team)
  const updatePayload = attended
    ? { attended: true, attended_at: nowIso, attended_source: "admin_desk" }
    : { attended: false, attended_at: null, attended_source: null };

  if (regId) {
    const { error: regErr } = await supabase
      .from("registration_members")
      .update(updatePayload)
      .eq("registration_id", regId);
    if (regErr) console.warn("[checkin] team update error:", regErr);
  } else {
    const { error: singleErr } = await supabase
      .from("registration_members")
      .update(updatePayload)
      .eq("id", memberId);
    if (singleErr) throw new Error(singleErr.message);
  }

  // 3. Keep attendance table in sync
  try {
    if (attended) {
      await supabase.from("attendance").upsert(
        {
          event_id: member.eventId,
          participant_id: member.userId || member.id,
          participant_email: cleanEmail || null,
          participant_name: member.captainName || member.memberName,
          registration_code: regCode || null,
          status: "present",
          source: "admin_desk",
          marked_at: nowIso,
          marked_by: "desk_admin",
        },
        { onConflict: "event_id,participant_id" }
      );
    } else {
      try {
        await supabase.rpc("admin_uncheck_participant_or_team", {
          p_registration_code: regCode || null,
          p_email: cleanEmail || null,
          p_registration_id: regId || null,
          p_event_id: member.eventId || null,
        });
      } catch (rpcErr) {
        console.warn("[checkin] admin_uncheck_participant_or_team rpc warning:", rpcErr);
      }
      // Clean uncheck: delete and cancel attendance records across all identifiers
      if (regCode) {
        await supabase.from("attendance").delete().eq("registration_code", regCode);
        await supabase.from("attendance").update({ status: "cancelled" }).eq("registration_code", regCode);
      }
      if (cleanEmail) {
        await supabase.from("attendance").delete().ilike("participant_email", cleanEmail).in("event_id", aliases);
        await supabase.from("attendance").update({ status: "cancelled" }).ilike("participant_email", cleanEmail).in("event_id", aliases);
      }
      if (member.userId) {
        await supabase.from("attendance").delete().eq("participant_id", member.userId).in("event_id", aliases);
        await supabase.from("attendance").update({ status: "cancelled" }).eq("participant_id", member.userId).in("event_id", aliases);
      }
    }
  } catch (attErr) {
    console.warn("[checkin] attendance sync warning:", attErr);
  }

  return { ...member, attended };
}

/**
 * Check in (or undo) a player across EVERY event they registered for.
 * One tap covers all memberships for the same member (keyed by email), so a
 * participant in several events only needs a single check-in.
 */
export async function adminTogglePlayerCheckin(email: string, attended: boolean): Promise<void> {
  await requireAdmin();

  const clean = (email || "").trim().toLowerCase();
  if (!clean || clean.includes("%") || clean.includes("_")) {
    throw new Error("Invalid email address.");
  }

  const nowIso = new Date().toISOString();
  const updatePayload = attended
    ? { attended: true, attended_at: nowIso, attended_source: "admin_desk" }
    : { attended: false, attended_at: null, attended_source: null };

  const { error } = await supabase
    .from("registration_members")
    .update(updatePayload)
    .ilike("email", clean);
  if (error) throw new Error(error?.message || "Could not update player check-in.");

  // Also sync attendance table
  try {
    if (attended) {
      await supabase
        .from("attendance")
        .update({ status: "present", marked_at: nowIso })
        .ilike("participant_email", clean);
    } else {
      await supabase
        .from("attendance")
        .delete()
        .ilike("participant_email", clean);
      await supabase
        .from("attendance")
        .update({ status: "cancelled" })
        .ilike("participant_email", clean);
    }
  } catch (attErr) {
    console.warn("[checkin] attendance table sync warning:", attErr);
  }
}

/**
 * Check in (or undo) an entire PlayerGroup in one shot.
 * For team events, checking in the team captain marks all registered members of that team.
 * Unchecking permanently cancels and removes attendance records across event aliases.
 */
export async function adminTogglePlayerGroup(
  player: PlayerGroup,
  attended: boolean
): Promise<void> {
  await requireAdmin();

  const regIds = Array.from(
    new Set(player.members.map((m) => m.registrationId).filter(Boolean))
  );
  const memberIds = Array.from(
    new Set(player.members.map((m) => m.id).filter(Boolean))
  );
  const regCodes = Array.from(
    new Set(player.members.map((m) => m.registrationCode).filter(Boolean))
  );
  const emails = Array.from(
    new Set(
      player.members
        .map((m) => (m.email || "").trim().toLowerCase())
        .filter((e) => e && !e.includes("%") && !e.includes("_"))
    )
  );
  const userIds = Array.from(
    new Set(player.members.map((m) => (m.userId || "").trim()).filter(Boolean))
  );
  const eventIds = Array.from(
    new Set(player.members.map((m) => (m.eventId || "").trim().toLowerCase()).filter(Boolean))
  );
  const allAliases = Array.from(
    new Set(eventIds.flatMap((ev) => attendanceEventAliases(ev) || [ev]))
  );

  const nowIso = new Date().toISOString();
  const updatePayload = attended
    ? { attended: true, attended_at: nowIso, attended_source: "admin_desk" }
    : { attended: false, attended_at: null, attended_source: null };

  // 1. Update registration_members table
  if (regCodes.length > 0) {
    const { error: codeErr } = await supabase
      .from("registration_members")
      .update(updatePayload)
      .in("registration_code", regCodes);
    if (codeErr) console.warn("[checkin] reg_members error on regCodes:", codeErr);
  }
  if (regIds.length > 0) {
    const { error: regErr } = await supabase
      .from("registration_members")
      .update(updatePayload)
      .in("registration_id", regIds);
    if (regErr) console.warn("[checkin] reg_members error on regIds:", regErr);
  }
  if (memberIds.length > 0) {
    const { error: memErr } = await supabase
      .from("registration_members")
      .update(updatePayload)
      .in("id", memberIds);
    if (memErr) console.warn("[checkin] reg_members error on memberIds:", memErr);
  }

  // 2. Keep attendance table in sync
  try {
    if (attended) {
      const captain =
        player.members.find(
          (m) =>
            m.captainName &&
            m.memberName.trim().toLowerCase() === m.captainName.trim().toLowerCase()
        ) ||
        player.members.find((m) => m.position === 1 || m.memberRole === "captain") ||
        player.members[0];
      if (captain) {
        const cleanEmail = (captain.email || player.email || "").trim().toLowerCase();
        await supabase.from("attendance").upsert(
          {
            event_id: captain.eventId,
            participant_id: captain.userId || captain.id,
            participant_email: cleanEmail || null,
            participant_name: captain.captainName || captain.memberName || player.playerName,
            registration_code: captain.registrationCode || null,
            status: "present",
            source: "admin_desk",
            marked_at: nowIso,
            marked_by: "desk_admin",
          },
          { onConflict: "event_id,participant_id" }
        );
      }
    } else {
      // Try security definer RPC first (bypasses any RLS constraints)
      try {
        await supabase.rpc("admin_uncheck_participant_or_team", {
          p_registration_code: regCodes[0] || null,
          p_email: emails[0] || null,
          p_registration_id: regIds[0] || null,
          p_event_id: eventIds[0] || null,
        });
      } catch (rpcErr) {
        console.warn("[checkin] admin_uncheck_participant_or_team rpc warning:", rpcErr);
      }

      // UNCHECK: Cleanly remove/cancel attendance records
      for (const code of regCodes) {
        await supabase.from("attendance").delete().eq("registration_code", code);
        await supabase.from("attendance").update({ status: "cancelled" }).eq("registration_code", code);
      }
      for (const em of emails) {
        if (allAliases.length > 0) {
          await supabase.from("attendance").delete().ilike("participant_email", em).in("event_id", allAliases);
          await supabase.from("attendance").update({ status: "cancelled" }).ilike("participant_email", em).in("event_id", allAliases);
        } else {
          await supabase.from("attendance").delete().ilike("participant_email", em);
          await supabase.from("attendance").update({ status: "cancelled" }).ilike("participant_email", em);
        }
      }
      for (const uid of userIds) {
        if (allAliases.length > 0) {
          await supabase.from("attendance").delete().eq("participant_id", uid).in("event_id", allAliases);
          await supabase.from("attendance").update({ status: "cancelled" }).eq("participant_id", uid).in("event_id", allAliases);
        } else {
          await supabase.from("attendance").delete().eq("participant_id", uid);
          await supabase.from("attendance").update({ status: "cancelled" }).eq("participant_id", uid);
        }
      }
    }
  } catch (attErr) {
    console.warn("[checkin] attendance sync warning during group toggle:", attErr);
  }
}

/** Check in (or undo) every member of a team registration in one shot. */
export async function adminBulkToggleCheckin(
  registrationId: string,
  attended: boolean
): Promise<void> {
  await requireAdmin();
  const nowIso = new Date().toISOString();
  const updatePayload = attended
    ? { attended: true, attended_at: nowIso, attended_source: "admin_desk" }
    : { attended: false, attended_at: null, attended_source: null };

  const { error } = await supabase
    .from("registration_members")
    .update(updatePayload)
    .eq("registration_id", registrationId);
  if (error) throw new Error(error?.message || "Could not update team check-in.");

  // Also sync attendance table
  try {
    const { data: members } = await supabase
      .from("registration_members")
      .select("event_id, registration_code, email, user_id, member_name, captain_name")
      .eq("registration_id", registrationId);

    if (members && members.length > 0) {
      const captain = members.find((m: any) => m.position === 1) || members[0];
      const regCode = captain.registration_code;
      const cleanEmail = (captain.email || "").trim().toLowerCase();
      const aliases = attendanceEventAliases(captain.event_id) || [captain.event_id];

      if (attended) {
        await supabase.from("attendance").upsert(
          {
            event_id: captain.event_id,
            participant_id: captain.user_id || registrationId,
            participant_email: cleanEmail || null,
            participant_name: captain.captain_name || captain.member_name,
            registration_code: regCode || null,
            status: "present",
            source: "admin_desk",
            marked_at: nowIso,
            marked_by: "desk_admin",
          },
          { onConflict: "event_id,participant_id" }
        );
      } else {
        if (regCode) {
          await supabase.from("attendance").delete().eq("registration_code", regCode);
          await supabase.from("attendance").update({ status: "cancelled" }).eq("registration_code", regCode);
        }
        if (cleanEmail) {
          await supabase.from("attendance").delete().ilike("participant_email", cleanEmail).in("event_id", aliases);
          await supabase.from("attendance").update({ status: "cancelled" }).ilike("participant_email", cleanEmail).in("event_id", aliases);
        }
      }
    }
  } catch (attErr) {
    console.warn("[checkin] bulk toggle attendance sync warning:", attErr);
  }
}

export interface PlayerGroup {
  key: string;
  playerName: string;
  email: string;
  members: CheckinMember[];
  attended: boolean;
}

/**
 * Scan-activity gate.
 *
 * Coalescing alone is not enough during a real queue. Every scan writes rows, so
 * the realtime listeners keep firing, and a full registration_members re-read
 * every 5-20s competes with the operator for bandwidth and replaces the whole
 * roster mid-scan — which is exactly when the page must feel instant.
 *
 * The gate lets background reloads stand down while a desk is actively scanning.
 * That is safe because the scanned player's own row is already correct locally
 * (applyScan), so the only thing a reload adds during the rush is other desks'
 * scans, which can wait for the queue to pause. The MAX_STARVE ceiling
 * guarantees the roster and the header counters still settle at least once a
 * minute even if scanning never stops.
 */
const SCAN_BUSY_WINDOW_MS = 8000;
const SCAN_MAX_STARVE_MS = 60000;
let lastScanActivityAt = 0;
let lastReloadAt = 0;

/** Record that a local desk scan just happened, so reloads can stand down. */
export function noteCheckinActivity(): void {
  lastScanActivityAt = Date.now();
}

/**
 * True when a background reload should be postponed because this desk is in the
 * middle of a scan burst and has reloaded recently enough to not be stale.
 */
export function shouldDeferCheckinReload(): boolean {
  const now = Date.now();
  if (now - lastScanActivityAt >= SCAN_BUSY_WINDOW_MS) return false;
  return now - lastReloadAt < SCAN_MAX_STARVE_MS;
}

/** Record that a full roster reload actually ran (resets the starve ceiling). */
export function markCheckinReload(): void {
  lastReloadAt = Date.now();
}

/**
 * React hook: live list of check-in members for the admin check-in page.
 * Rows are grouped by player (keyed by case-insensitive email) so a member
 * who registered for several events still only needs one check-in.
 * Filters after fetch (event filter) so realtime updates stay simple.
 *
 * Three things stop a 3000-pass venue run from becoming 3000 full re-reads of
 * registration_members:
 *
 *   - realtime changes are COALESCED (5s trailing, 20s ceiling) instead of
 *     reloading the whole table per row change;
 *   - background reloads STAND DOWN while a desk is scanning (see the gate
 *     above), so a queue never competes with itself;
 *   - applyScan() flips the scanned player locally, so the operator sees the
 *     row change the instant the RPC returns and needs no reload for it.
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

// Keep latest refresh in a ref so Realtime subscription doesn't re-mount on every search keystroke
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Realtime sync: reload when registration_members or attendance changes for this
  // eventId. Events are COALESCED rather than reloading per row — a scan rush
  // writes hundreds of rows and each one used to trigger a full table re-read.
  useEffect(() => {
    const REALTIME_DEBOUNCE_MS = 5000;
    const REALTIME_MAX_WAIT_MS = 20000;
    const RESCAN_DEFER_MS = 2000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstQueuedAt = 0;

    const run = () => {
      timer = null;
      // A desk mid-rush does not need anyone else's rows yet, and re-reading
      // the table now would stall the next scan. Try again shortly.
      if (shouldDeferCheckinReload()) {
        timer = setTimeout(run, RESCAN_DEFER_MS);
        return;
      }
      firstQueuedAt = 0;
      markCheckinReload();
      void refreshRef.current();
    };

    const schedule = () => {
      const now = Date.now();
      if (!firstQueuedAt) firstQueuedAt = now;
      const wait = Math.max(
        0,
        Math.min(REALTIME_DEBOUNCE_MS, REALTIME_MAX_WAIT_MS - (now - firstQueuedAt)),
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, wait);
    };

    const channelName = `admin-checkin-sync-${eventId || "all"}`;
    const eventFilter = eventId ? { filter: `event_id=eq.${eventId}` } : {};
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registration_members",
          ...eventFilter,
        },
        schedule
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          ...eventFilter,
        },
        schedule
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  /**
   * Reflect a just-completed scan in the local list without re-reading the
   * table. The scan RPC marks EVERY membership the player holds (all events),
   * which is the same effect adminTogglePlayerCheckin has, so mirroring it here
   * cannot drift from the server for this player's own scan. Everyone else's
   * changes still arrive via the coalesced reload above.
   *
   * This also stands the background reloads down, which is what keeps the desk
   * responsive while a queue is running.
   */
  const applyScan = useCallback((email: string) => {
    const key = email.trim().toLowerCase();
    if (!key) return;
    noteCheckinActivity();
    setMembers((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.email.trim().toLowerCase() !== key || m.attended) return m;
        changed = true;
        return { ...m, attended: true };
      });
      return changed ? next : prev;
    });
  }, []);

  // Group every membership row under the same player (case-insensitive email).
  //
  // Memoised on `members` only. This is O(rows) with a string normalise per row,
  // and the desk page re-renders several times per scan (scan result, spinner,
  // error) without `members` changing at all — rebuilding the whole map on each
  // of those is what made a long queue feel heavy.
  const { playerList, attendedCount } = useMemo(() => {
    const grouped = new Map<string, PlayerGroup>();

    for (const m of members) {
      const regCode = (m.registrationCode || "").trim().toLowerCase();
      const regId = (m.registrationId || "").trim().toLowerCase();
      const teamName = (m.teamName || "").trim().toLowerCase();
      const isTeam = Boolean(
        (teamName && teamName !== "individual") ||
        regCode ||
        (m.captainName && m.captainName !== m.memberName)
      );

      // Group teams by registrationCode (fallback to registrationId).
      // This ensures all team members sharing code TT-CE09-7H2G00 unify into 1 single squad card.
      const key = isTeam && regCode
        ? `team_code_${regCode}`
        : isTeam && regId
          ? `team_id_${regId}`
          : (m.email || m.userId || m.id).trim().toLowerCase();

      let group = grouped.get(key);
      if (!group) {
        group = {
          key,
          playerName: isTeam ? (m.captainName || m.memberName) : m.memberName,
          email: (m.email || "").trim(),
          members: [],
          attended: false,
        };
        grouped.set(key, group);
      }

      // If team has an explicit captainName set, default the card's lead name to the captain
      if (isTeam && m.captainName && !group.playerName) {
        group.playerName = m.captainName;
      }

      group.members.push(m);
      if (m.attended) group.attended = true;
    }

    // Refine each group's captain name, email, and sort order
    for (const group of grouped.values()) {
      const isCaptain = (mem: CheckinMember) =>
        Boolean(
          mem.captainName &&
          mem.memberName.trim().toLowerCase() === mem.captainName.trim().toLowerCase()
        );

      let captainMember = group.members.find(isCaptain);
      if (!captainMember) {
        captainMember = group.members.find(
          (mem) => mem.position === 1 || mem.memberRole === "captain"
        );
      }

      const explicitCaptainName = group.members.find((mem) => mem.captainName)?.captainName;

      if (captainMember) {
        group.playerName = captainMember.memberName;
        if (captainMember.email) group.email = captainMember.email.trim();
      } else if (explicitCaptainName) {
        group.playerName = explicitCaptainName;
      }

      // Sort members within each group:
      // Exact matched captain first, then position 1 / captain role, then remaining positions
      group.members.sort((a, b) => {
        const aIsExactCap = isCaptain(a);
        const bIsExactCap = isCaptain(b);
        if (aIsExactCap && !bIsExactCap) return -1;
        if (!aIsExactCap && bIsExactCap) return 1;

        const aIsCap = a.position === 1 || a.memberRole === "captain";
        const bIsCap = b.position === 1 || b.memberRole === "captain";
        if (aIsCap && !bIsCap) return -1;
        if (!aIsCap && bIsCap) return 1;

        return (a.position ?? 99) - (b.position ?? 99);
      });
    }

    const list = Array.from(grouped.values());
    return { playerList: list, attendedCount: list.filter((p) => p.attended).length };
  }, [members]);

  return { players: playerList, attendedCount, loading, error, refresh, applyScan };
}
