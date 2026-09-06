import { describe, test, expect } from "vitest";
import type { TechEvent } from "./lib/eventStore";
import { computeTotalFee, isTechPassEvent, feeBreakdown } from "./lib/fees";

function ev(partial: Partial<TechEvent> & { id: string }): TechEvent {
  return {
    dayId: "day-1",
    name: partial.id,
    description: "",
    category: "Sports",
    registrationOpen: true,
    registrationFee: 0,
    ...partial,
  } as TechEvent;
}

const techQuiz: TechEvent = ev({ id: "tech-quiz", dayId: "day-2", registrationFee: 75 });
const techHack: TechEvent = ev({ id: "tech-hack", dayId: "day-2", registrationFee: 75 });
const nonTechDance: TechEvent = ev({ id: "nt-dance", dayId: "day-3", registrationFee: 75 });
const carrom: TechEvent = ev({ id: "sp-carrom", dayId: "day-1", registrationFee: 75 });
const cricket: TechEvent = ev({ id: "sp-cricket", dayId: "day-1", registrationFee: 600 });

describe("isTechPassEvent", () => {
  test("true for day-2 and day-3", () => {
    expect(isTechPassEvent(techQuiz)).toBe(true);
    expect(isTechPassEvent(nonTechDance)).toBe(true);
  });
  test("false for sports", () => {
    expect(isTechPassEvent(carrom)).toBe(false);
    expect(isTechPassEvent(cricket)).toBe(false);
  });
});

describe("computeTotalFee", () => {
  test("internal is always free", () => {
    expect(computeTotalFee([cricket], [], "internal")).toBe(0);
  });

  test("single tech event charges flat 75", () => {
    expect(computeTotalFee([techQuiz], [], "external")).toBe(75);
  });

  test("multiple tech/non-tech events charge flat 75 once (batch pass)", () => {
    const events = [techQuiz, techHack, nonTechDance];
    expect(computeTotalFee(events, [], "external")).toBe(75);
  });

  test("sports are charged flat per event (no per-member multiply)", () => {
    expect(computeTotalFee([cricket], [], "external")).toBe(600);
    expect(computeTotalFee([carrom, cricket], [], "external")).toBe(675);
  });

  test("tech pass + sports combined", () => {
    const events = [techQuiz, techHack, cricket];
    expect(computeTotalFee(events, [], "external")).toBe(675);
  });
});

describe("feeBreakdown", () => {
  test("groups tech/non-tech into one pass line", () => {
    const lines = feeBreakdown([techQuiz, techHack, carrom]);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("flat 75");
    expect(lines[1]).toContain("carrom");
  });
});
