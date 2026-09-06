import type { TechEvent } from "./eventStore";
import type { ParticipantType } from "./api";

/**
 * fees.ts
 * --------
 * Client-side mirror of the Supabase `calculate_registration_fee` trigger's
 * tiered flat-fee model, so the review/payment UI shows exactly what the
 * database will charge.
 *
 *   • Technical (day-2) / Non-Technical (day-3):
 *       one flat pass — the FIRST selected Tech/Non-Tech event is charged,
 *       every other selected Tech/Non-Tech event in the same batch is free.
 *   • Sports (day-1): flat per event (₹600/team, or ₹75/game for carrom/chess)
 *       — no per-member multiplication.
 *   • Internal SIMATS: always free.
 */

const TECH_PASS_DAYS = ["day-2", "day-3"];

export function isTechPassEvent(event: TechEvent | undefined | null): boolean {
  if (!event) return false;
  return TECH_PASS_DAYS.includes(event.dayId);
}

/**
 * Total payable across the full set of selected events, matching the DB trigger.
 * The first Tech/Non-Tech event in selection order carries the flat pass fee;
 * all other Tech/Non-Tech events are free. Each sports event is charged flat.
 */
export function computeTotalFee(
  events: TechEvent[],
  _members: unknown[],
  teamType: ParticipantType,
): number {
  if (teamType === "internal") return 0;

  const techPassEvents = events.filter(isTechPassEvent);
  const sportEvents = events.filter((e) => !isTechPassEvent(e));

  // Flat pass: charge only the first selected Tech/Non-Tech event once.
  const techPassFee = techPassEvents.length > 0 ? techPassEvents[0].registrationFee ?? 0 : 0;

  // Sports: each event is charged flat (₹600/team or ₹75/game).
  const sportsFee = sportEvents.reduce((sum, e) => sum + (e.registrationFee ?? 0), 0);

  return techPassFee + sportsFee;
}

/**
 * Explains each charge in a selection for the review/payment UI.
 * Returns one line per sport event plus a combined Tech/Non-Tech pass line.
 */
export function feeBreakdown(events: TechEvent[]): string[] {
  const techPassEvents = events.filter(isTechPassEvent);
  const sportEvents = events.filter((e) => !isTechPassEvent(e));

  const lines: string[] = [];

  if (techPassEvents.length > 0) {
    const first = techPassEvents[0];
    const n = techPassEvents.length;
    lines.push(
      `${first.name}${n > 1 ? ` + ${n - 1} more Tech/Non-Tech` : ""} — flat ${first.registrationFee ?? 0}`,
    );
  }

  for (const e of sportEvents) {
    lines.push(`${e.name} — ${e.registrationFee ?? 0}`);
  }

  return lines;
}
