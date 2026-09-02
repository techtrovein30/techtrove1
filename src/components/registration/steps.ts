/**
 * steps.ts
 * ---------
 * Shared registration-step constants. Kept in their own module (rather than
 * next to the RegistrationStepper component) so the component file only
 * exports components — satisfying react-refresh/only-export-components.
 */

export const ALL_STEPS = [
  "sport",
  "terms",
  "team",
  "members",
  "review",
  "payment",
] as const;

export type StepId = (typeof ALL_STEPS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  sport: "Event",
  terms: "Terms",
  team: "Team",
  members: "Members",
  review: "Review",
  payment: "Payment",
};