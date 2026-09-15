import type { TechEvent } from "./eventStore";
import type { ParticipantType } from "./api";
import { isSoloTeamEvent } from "./validation";

/**
 * fees.ts
 * --------
 * Client-side mirror of the Supabase `calculate_registration_fee` trigger's
 * tiered flat-fee model, so the review/payment UI shows exactly what the
 * database will charge.
 *
 *   • Technical (day-2):
 *       one flat pass — the FIRST selected Tech event is charged,
 *       every other selected Tech event in the same batch is free.
 *   • Sports (day-1): flat per event (₹600/team, or ₹75/game for carrom)
 *       — no per-member multiplication.
 *   • Solo/Team events (e.g. Carrom): fee per participant
 *       (₹75 solo / ₹150 for a 2-player team) — fee = registrationFee × members.
 *   • Internal SIMATS: always free.
 */

const TECH_PASS_DAYS = ["day-2"];

export function isTechPassEvent(event: TechEvent | undefined | null): boolean {
  if (!event) return false;
  return TECH_PASS_DAYS.includes(event.dayId);
}

/** Count of filled (non-empty) participant names, at least 1. */
function filledMemberCount(members: { name?: string | null }[]): number {
  const n = members.filter((m) => m.name?.trim()).length;
  return n < 1 ? 1 : n;
}

/**
 * Total payable across the full set of selected events, matching the DB trigger.
 * The first Technical and Non-Technical event in selection order carries the flat pass fee;
 * all other Technical and Non-Technical events are free. Each sports event is charged flat,
 * except solo/team sports (Chess & Carrom) which charge per participant.
 */
export function computeTotalFee(
  events: TechEvent[],
  members: { name?: string | null }[],
  teamType: ParticipantType,
): number {
  if (teamType === "internal") return 0;

  const techPassEvents = events.filter(isTechPassEvent);
  const sportEvents = events.filter((e) => !isTechPassEvent(e));

  // Flat pass: charge only the first selected Technical and Non-Technical event once.
  const techPassFee = techPassEvents.length > 0 ? techPassEvents[0].registrationFee ?? 0 : 0;

  // Sports: each event is charged flat (₹600/team). Solo/team sports
  // (Carrom) charge per participant: ₹75 solo / ₹150 pair.
  const memberCount = filledMemberCount(members);
  const sportsFee = sportEvents.reduce((sum, e) => {
    if (isSoloTeamEvent(e)) return sum + (e.registrationFee ?? 0) * memberCount;
    return sum + (e.registrationFee ?? 0);
  }, 0);

  return techPassFee + sportsFee;
}

/**
 * Explains each charge in a selection for the review/payment UI.
 * Returns one line per sport event plus a combined Technical and Non-Technical pass line.
 */
export function feeBreakdown(events: TechEvent[], members: { name?: string | null }[] = []): string[] {
  const techPassEvents = events.filter(isTechPassEvent);
  const sportEvents = events.filter((e) => !isTechPassEvent(e));

  const lines: string[] = [];
  const memberCount = filledMemberCount(members);

  if (techPassEvents.length > 0) {
    const first = techPassEvents[0];
    const n = techPassEvents.length;
    lines.push(
      `${first.name}${n > 1 ? ` + ${n - 1} more Technical and Non-Technical` : ""} — flat ${first.registrationFee ?? 0}`,
    );
  }

  for (const e of sportEvents) {
    if (isSoloTeamEvent(e)) {
      lines.push(`${e.name} — ${e.registrationFee ?? 0} × ${memberCount} player${memberCount === 1 ? "" : "s"}`);
    } else {
      lines.push(`${e.name} — ${e.registrationFee ?? 0}`);
    }
  }

  return lines;
}
