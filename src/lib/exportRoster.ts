/**
 * exportRoster.ts
 * ---------------
 * Builds the unified per-student roster CSV used by every admin "Export CSV"
 * button. ONE row per student who appears in at least one registration.
 *
 * Columns:
 *   Student Name | College Name | Captain | Team Members |
 *   Events Registered | Payment Amount (₹) | Payment Status
 *
 * Team members / captain are broken down per event, e.g.
 *   Captain      → "Basketball: Arun; Football: John (self)"
 *   Team Members → "Basketball: Raj, Sam; Football: Peter"
 *
 * "Team Members" is only filled for team events (never individual events) and
 * always excludes the student themselves.
 */

import type { Registration, RegistrationMember } from "./api";
import type { TechEvent } from "./eventStore";
import { getAllParticipants } from "./db";
import type { ParticipantRow } from "./db";
import { isIndividualEvent } from "./validation";

export const STUDENT_ROSTER_HEADERS = [
  "Student Name",
  "College Name",
  "Captain",
  "Team Members",
  "Events Registered",
  "Payment Amount (₹)",
  "Payment Status",
];

interface Occurrence {
  eventName: string;
  captainName: string;
  isCaptain: boolean;
  teammates: string[];
  fee: number;
  status: string;
}

interface StudentAgg {
  name: string;
  college: string;
  occurrences: Occurrence[];
}

/** Resolve a member to their participant profile (email first, then reg no). */
function makeResolver(participants: ParticipantRow[]) {
  const byEmail = new Map<string, ParticipantRow>();
  const byReg = new Map<string, ParticipantRow>();
  const byId = new Map<string, ParticipantRow>();

  for (const p of participants) {
    if (p.email) byEmail.set(p.email.toLowerCase(), p);
    if (p.reg_number) byReg.set(p.reg_number.toLowerCase(), p);
    byId.set(p.id, p);
  }

  return (email?: string, regNumber?: string): ParticipantRow | undefined => {
    if (email) {
      const p = byEmail.get(email.toLowerCase());
      if (p) return p;
    }
    if (regNumber) {
      const p = byReg.get(regNumber.toLowerCase());
      if (p) return p;
    }
    return undefined;
  };
}

export async function buildStudentRosterCsv(
  registrations: Registration[],
  events: TechEvent[],
): Promise<{ headers: string[]; rows: string[][]; filename: string }> {
  // Participants power the college name + a stable per-person key. If the
  // fetch fails we still export with names only, so the button never breaks.
  let participants: ParticipantRow[] = [];
  try {
    participants = await getAllParticipants();
  } catch (err) {
    console.error("exportRoster: could not load participants:", err);
  }
  const resolve = makeResolver(participants);

  const eventById = new Map(events.map((e) => [e.id, e]));
  const students = new Map<string, StudentAgg>();

  const addOccurrence = (
    key: string,
    name: string,
    college: string,
    occ: Occurrence,
  ) => {
    const agg = students.get(key) ?? { name, college, occurrences: [] };
    // Prefer the participant profile's values when available.
    if (!agg.college && college) agg.college = college;
    if (!agg.name && name) agg.name = name;
    agg.occurrences.push(occ);
    students.set(key, agg);
  };

  for (const reg of registrations) {
    const event = eventById.get(reg.eventId);
    const eventName = event?.name ?? reg.eventId;
    const isTeamEvent = !isIndividualEvent(event) || reg.members.length > 1;

    const members: RegistrationMember[] = Array.isArray(reg.members)
      ? reg.members
      : [];
    const allMemberNames = members.map((m) => m.name).filter(Boolean);

    const seenKeys = new Set<string>();

    for (const m of members) {
      const profile = resolve(m.email, m.regNumber);
      const key = profile
        ? `id:${profile.id}`
        : m.email
          ? `email:${m.email.toLowerCase()}`
          : `name:${m.name.trim().toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const name = profile?.full_name ?? m.name;
      const college = profile?.college ?? "";
      const isCaptain = m.name.trim() === reg.captainName.trim();

      addOccurrence(key, name, college, {
        eventName,
        captainName: reg.captainName,
        isCaptain,
        teammates: isTeamEvent
          ? allMemberNames.filter((n) => n !== m.name)
          : [],
        fee: reg.fee ?? 0,
        status: reg.paymentStatus,
      });
    }

    // Robustness: include the registration owner even if they are missing from
    // members[] (should not happen — position 1 is the captain by convention).
    const owner = participants.find((p) => p.id === reg.userId);
    if (owner && !seenKeys.has(`id:${owner.id}`)) {
      addOccurrence(`id:${owner.id}`, owner.full_name, owner.college ?? "", {
        eventName,
        captainName: reg.captainName,
        isCaptain: owner.full_name.trim() === reg.captainName.trim(),
        teammates: isTeamEvent
          ? allMemberNames.filter((n) => n !== owner.full_name)
          : [],
        fee: reg.fee ?? 0,
        status: reg.paymentStatus,
      });
    }
  }

  const rows = Array.from(students.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const eventNames: string[] = [];
      const captains: string[] = [];
      const teamMembers: string[] = [];
      let totalFee = 0;
      const statuses = new Set<string>();

      for (const o of s.occurrences) {
        if (!eventNames.includes(o.eventName)) eventNames.push(o.eventName);

        const captainLabel = o.isCaptain
          ? `${o.captainName} (self)`
          : o.captainName;
        captains.push(`${o.eventName}: ${captainLabel}`);

        if (o.teammates.length > 0) {
          teamMembers.push(`${o.eventName}: ${o.teammates.join(", ")}`);
        }

        totalFee += o.fee;
        statuses.add(o.status);
      }

      return [
        s.name,
        s.college,
        captains.join("; "),
        teamMembers.join("; "),
        eventNames.join("; "),
        String(totalFee),
        Array.from(statuses).join("/"),
      ];
    });

  const date = new Date().toISOString().split("T")[0];
  return {
    headers: STUDENT_ROSTER_HEADERS,
    rows,
    filename: `techtrove_students_${date}.csv`,
  };
}
