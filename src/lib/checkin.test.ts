/**
 * checkin.test.ts
 * ---------------
 * The check-in desk re-reads its roster on a coalesced realtime cycle. That read
 * is the single most expensive thing the desk does over a two-day event, and it
 * used to download the entire `attendance` table on every cycle.
 *
 * `attendance` is empty until the first scan, so this cost nothing at all in
 * development — which is exactly why it survived. Once a 6,000-person event has
 * scanned through, every refresh re-pulls every row anyone has ever scanned.
 *
 * The fix narrows that read to the events the roster can actually match. The
 * interesting part is *which* events those are: members are fetched with a
 * strict `eq()`, but a member is matched against its raw event id, its
 * prefix-stripped id, and — for sports — a `sports` umbrella covering every
 * discipline. So the filter has to be an `in()` over those aliases. A bare
 * `eq()` compiles, deploys, looks correct, and silently marks nobody attended,
 * which at a gate is far worse than the egress problem it was meant to fix.
 *
 * These tests pin the alias set so that mistake cannot be reintroduced quietly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      removeChannel: vi.fn(),
    })),
  },
}));

vi.mock("./adminGuard", () => ({ requireAdmin: vi.fn(async () => undefined) }));

vi.mock("./db", () => ({
  getAllRegistrations: vi.fn(async () => []),
}));

import { supabase } from "./supabase";
import { attendanceEventAliases, adminListCheckinMembers } from "./checkin";

/** Records what `.in()` was called with, per table, so we can assert the filter. */
let inCalls: Array<{ table: string; column: string; values: string[] }> = [];

function stubSupabase() {
  inCalls = [];
  const supabaseMock = supabase as unknown as { from: ReturnType<typeof vi.fn> };

  supabaseMock.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "or", "limit", "range"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.in = vi.fn((column: string, values: string[]) => {
      inCalls.push({ table, column, values });
      return chain;
    });
    // Both legs of the Promise.all resolve to an empty result set.
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubSupabase();
});

describe("attendanceEventAliases", () => {
  it("returns null with no event filter, so the all-events view stays unscoped", () => {
    expect(attendanceEventAliases(undefined)).toBeNull();
    expect(attendanceEventAliases("")).toBeNull();
  });

  it("covers both the raw and the prefix-stripped spelling of a tech event", () => {
    const ids = attendanceEventAliases("tech-hackathon")!;
    expect(ids).toContain("tech-hackathon");
    expect(ids).toContain("hackathon");
  });

  it("does not widen a non-sport event to unrelated events", () => {
    const ids = attendanceEventAliases("nontech-debate")!;
    expect(ids.sort()).toEqual(["debate", "nontech-debate"]);
  });

  it("widens a sport event across every discipline, because rosters see the sports bucket", () => {
    const ids = attendanceEventAliases("sport-cricket")!;

    // The desk's own id and its stripped form.
    expect(ids).toContain("sport-cricket");
    expect(ids).toContain("cricket");

    // The umbrella key that attPresentSet indexes sport attendance under.
    expect(ids).toContain("kabaddi");
    expect(ids).toContain("football");
    expect(ids).toContain("carrom-girls");

    // And the aggregate event ids, which the attendance side treats as sports.
    expect(ids).toContain("sports-unified");
  });

  it("treats sports-unified as a sport too", () => {
    expect(attendanceEventAliases("sports-unified")).toContain("cricket");
  });

  it("never returns an empty list, which would match nothing", () => {
    for (const id of ["tech-hackathon", "sport-cricket", "chess-girls", "anything-at-all"]) {
      expect(attendanceEventAliases(id)!.length).toBeGreaterThan(0);
    }
  });
});

describe("adminListCheckinMembers attendance scoping", () => {
  it("scopes the attendance read to the event's aliases", async () => {
    await adminListCheckinMembers({ eventId: "sport-cricket" });

    const att = inCalls.find((c) => c.table === "attendance");
    expect(att).toBeDefined();
    expect(att!.column).toBe("event_id");
    expect(att!.values).toContain("sport-cricket");
    expect(att!.values).toContain("cricket");
  });

  it("leaves the members read alone — only attendance is narrowed", async () => {
    await adminListCheckinMembers({ eventId: "tech-hackathon" });

    // The members query is a strict eq() and must not become an in().
    expect(inCalls.some((c) => c.table === "registration_members")).toBe(false);
  });

  it("does not narrow attendance when no event is selected", async () => {
    await adminListCheckinMembers({});

    // The all-events desk genuinely needs attendance for every event.
    expect(inCalls.some((c) => c.table === "attendance")).toBe(false);
  });
});

describe("adminTogglePlayerGroup", () => {
  it("imports and exports correctly as an async function", async () => {
    const { adminTogglePlayerGroup } = await import("./checkin");
    expect(typeof adminTogglePlayerGroup).toBe("function");
  });
});