/**
 * steps.ts
 * ---------
 * Shared registration-step constants. Kept in their own module (rather than
 * next to the RegistrationStepper component) so the component file only
 * exports components — satisfying react-refresh/only-export-components.
 *
 * The public flow is intentionally a short 2-step funnel:
 *   1. Event — pick what you are entering
 *   2. Details — accept terms, team/captain and member slots in one go, and
 *      (for external students) submit payment proof right there
 */

export const ALL_STEPS = ["event", "details"] as const;

export type StepId = (typeof ALL_STEPS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  event: "Event",
  details: "Details",
};