/**
 * coordinatorApi.test.ts
 * ---------------------
 * These tests used to drive a localStorage fallback: assign a coordinator, mark
 * attendance, assert the numbers changed. All of that logic has moved into the
 * database (mark_event_attendance, admin_assign_event_coordinator, ...), because
 * a browser-only copy meant one coordinator saw a different roster than another
 * and the "checks" could be bypassed by opening devtools.
 *
 * So what is left here is the client half of the contract, which is where the
 * bugs that actually reach the venue now live:
 *
 *   - exactly one argument reaches the RPC: the token. If the client ever starts
 *     sending a user id or an email, the server can be talked into marking
 *     attendance for somebody else;
 *   - the `reason` vocabulary the SQL returns survives the trip into the UI
 *     unmapped, so `not_paid` does not silently become "Attendance Error";
 *   - the already_attended branch keeps ok:false AND the original timestamp,
 *     because that is what the duplicate screen renders;
 *   - nothing writes to a table directly, and nothing fails open.
 *
 * The server-side behaviour itself is covered by the SQL suite against
 * Postgres; duplicating it here would only test the mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ data: [], error: null })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(async () => {}),
    })),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  },
}));

vi.mock("./adminGuard", () => ({ requireAdmin: vi.fn(async () => undefined) }));

vi.mock("./eventStore", () => ({
  getDaysAsync: vi.fn(async () => []),
  adminUpdateEvent: vi.fn(async () => {}),
}));

vi.mock("./db", () => ({
  getRegistrationEventRows: vi.fn(async () => []),
  getRegistrationCountsByEvent: vi.fn(async () => ({})),
  getRegistrationsByEvent: vi.fn(async () => []),
}));

import {
  markEventAttendance,
  adminAssignCoordinator,
  adminRemoveCoordinator,
  adminGetCoordinatorSummaries,
  getAssignedCoordinatorEvent,
  parseAttendanceToken,
  getAttendanceEventStats,
} from "./coordinatorApi";
import { supabase } from "./supabase";
import { requireAdmin } from "./adminGuard";
import { getRegistrationEventRows, getRegistrationCountsByEvent } from "./db";
import type { User } from "./api";

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const adminGuard = requireAdmin as unknown as ReturnType<typeof vi.fn>;

const TOKEN = "9f2a4c7e1b3d5f6081a2c3e4f5061728";

const student: User = {
  id: "usr_student",
  username: "alice",
  email: "alice@example.com",
  fullName: "Alice Student",
  college: "Tech University",
  phone: "9876543210",
  participantType: "internal",
  role: "user",
};

const APPOINTEE: User = {
  id: "usr_coordinator",
  username: "carol",
  email: "carol@example.com",
  fullName: "Prof. Carol",
  college: "Tech University",
  phone: "9988776655",
  participantType: "internal",
  role: "coordinator",
};

/** Rows are the exact jsonb shapes query_coordinator_attendance.sql returns. */
function rpcReturns(data: unknown) {
  rpc.mockResolvedValueOnce({ data, error: null });
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockReset();
  adminGuard.mockClear();
  adminGuard.mockResolvedValue(undefined);
});

describe("parseAttendanceToken", () => {
  it("accepts the event wire format and its human variants", () => {
    expect(parseAttendanceToken(`TTE1:${TOKEN}`)).toBe(TOKEN);
    expect(parseAttendanceToken(`TTE1:${TOKEN.toUpperCase()}`)).toBe(TOKEN);
    expect(parseAttendanceToken(`  tte1:${TOKEN}  `)).toBe(TOKEN);
    expect(parseAttendanceToken(TOKEN)).toBe(TOKEN);
    expect(parseAttendanceToken("9F2A4C7E - 1B3D5F60 - 81A2C3E4 - F5061728")).toBe(TOKEN);
    expect(parseAttendanceToken(`https://techtrove.live/attendance?token=TTE1:${TOKEN}`)).toBe(TOKEN);
    expect(parseAttendanceToken(`https://techtrove.live/attendance?token=${TOKEN}`)).toBe(TOKEN);
  });

  it("returns an empty string rather than junk the RPC would have to reject", () => {
    // "" reaches the RPC as an empty string and comes back as invalid_qr. The old
    // parser returned null here, which the caller then interpolated into the
    // query as the literal text "null".
    expect(parseAttendanceToken("")).toBe("");
    expect(parseAttendanceToken("    ")).toBe("");
    expect(parseAttendanceToken("some_free_text_code")).toBe("");
    expect(parseAttendanceToken(`${TOKEN.slice(0, 31)}`)).toBe("");
    expect(parseAttendanceToken(`${TOKEN}f`)).toBe("");
    expect(parseAttendanceToken(TOKEN.replace("9", "z"))).toBe("");
  });

  it("refuses a personal pass so a participant cannot mark themselves in", () => {
    expect(parseAttendanceToken(`TTQ1:${TOKEN}`)).toBe("");
    expect(parseAttendanceToken(`https://techtrove.live/checkin?pass=TTQ1:${TOKEN}`)).toBe("");
  });
});

describe("markEventAttendance", () => {
  it("sends only the token, never the caller's identity", async () => {
    rpcReturns({ ok: true, reason: "success", event_name: "Code Sprint", marked_at: "2026-01-01T10:00:00Z" });

    await markEventAttendance(`TTE1:${TOKEN}`, student);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("mark_event_attendance");
    // The whole point of the hardening: the server derives who and which event
    // from auth.uid() and the token. An extra p_user_id here would hand the
    // client a say in who gets marked present.
    expect(Object.keys(args)).toEqual(["p_token"]);
    expect(args.p_token).toBe(TOKEN);
  });

  it("does not call the RPC at all when nobody is signed in", async () => {
    const res = await markEventAttendance(TOKEN, null);
    expect(res).toEqual({
      ok: false,
      reason: "not_logged_in",
      message: "Please login to mark attendance.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a successful scan", async () => {
    rpcReturns({
      ok: true,
      reason: "success",
      message: "Attendance marked for Code Sprint.",
      event_id: "e1",
      event_name: "Code Sprint",
      marked_at: "2026-01-01T10:00:00Z",
    });

    const res = await markEventAttendance(TOKEN, student);

    expect(res).toEqual({
      ok: true,
      reason: "success",
      message: "Attendance marked for Code Sprint.",
      eventName: "Code Sprint",
      markedAt: "2026-01-01T10:00:00Z",
    });
  });

  it("falls back to a generic success message if the RPC omits one", async () => {
    rpcReturns({ ok: true, reason: "success", event_name: "Code Sprint" });
    const res = await markEventAttendance(TOKEN, student);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/attendance marked/i);
  });

  it("keeps already_attended at ok:false and preserves the first timestamp", async () => {
    // The duplicate screen is keyed off ok:false + already_attended and renders
    // markedAt. Flipping ok to true would send the student to a success screen
    // and re-marking the time would silently rewrite when they arrived.
    rpcReturns({
      ok: false,
      reason: "already_attended",
      event_name: "Code Sprint",
      marked_at: "2026-01-01T10:00:00Z",
    });

    const res = await markEventAttendance(TOKEN, student);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("already_attended");
    expect(res.markedAt).toBe("2026-01-01T10:00:00Z");
    expect(res.eventName).toBe("Code Sprint");
    // The client builds this message so it can name the original arrival time.
    expect(res.message).toMatch(/already marked/i);
  });

  it("passes every failure reason through without collapsing it into 'error'", async () => {
    // If the client normalises these, a student who has not paid is told they
    // have an invalid QR and hunts for a typo instead of going to the desk.
    const cases: Array<[string, string]> = [
      ["not_registered", "You are not registered for this event."],
      ["not_paid", "Payment for your registration is not verified yet."],
      ["no_profile", "No registration matches your account email."],
      ["invalid_qr", "Invalid attendance QR."],
      ["event_disabled", "Attendance is closed for this event."],
      ["not_logged_in", "Please login to mark attendance."],
    ];

    for (const [reason, message] of cases) {
      rpcReturns({ ok: false, reason, message });
      const res = await markEventAttendance(TOKEN, student);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(reason);
      expect(res.message).toBe(message);
    }
  });

  it("reports an RPC transport failure as an error rather than throwing", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
    const res = await markEventAttendance(TOKEN, student);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("error");
  });
});

describe("adminAssignCoordinator", () => {
  it("assigns through the RPC and never writes event_coordinators directly", async () => {
    rpcReturns({
      ok: true,
      coordinator: { id: "c1", user_id: null, name: "Prof. Carol", email: "carol@example.com", mobile: "9988776655" },
    });

    const coord = await adminAssignCoordinator({
      eventId: "e1",
      userId: APPOINTEE.id,
      name: APPOINTEE.fullName,
      email: APPOINTEE.email,
      mobile: APPOINTEE.phone || "",
    });

    expect(rpc).toHaveBeenCalledWith("admin_assign_event_coordinator", {
      p_event_id: "e1",
      p_name: "Prof. Carol",
      p_email: "carol@example.com",
      p_mobile: "9988776655",
    });
    expect(coord.eventId).toBe("e1");
    expect(coord.email).toBe("carol@example.com");
    // user_id is nullable server-side: an appointee who has never signed in has
    // no id yet, and claim_coordinator_links() fills it in later.
    expect(coord.userId).toBe("");
  });

  it("requires admin and does not proceed when the guard fails", async () => {
    // The old code did `await requireAdmin().catch(() => {})`, so a logged-out or
    // non-admin caller fell straight through to the write. The database said no,
    // but only because RLS was enabled — and the admin UI had already lost the
    // error it should have shown.
    adminGuard.mockRejectedValueOnce(new Error("Not authenticated."));

    await expect(
      adminAssignCoordinator({
        eventId: "e1",
        userId: "u1",
        name: "N",
        email: "n@example.com",
        mobile: "9999999999",
      })
    ).rejects.toThrow("Not authenticated.");

    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces a refusal from the RPC instead of reporting success", async () => {
    rpcReturns({ ok: false, message: "Event not found." });

    await expect(
      adminAssignCoordinator({ eventId: "nope", userId: "u1", name: "N", email: "n@example.com", mobile: "9" })
    ).rejects.toThrow("Event not found.");
  });

  it("rejects empty input before touching the database", async () => {
    await expect(
      adminAssignCoordinator({ eventId: "e1", userId: "u1", name: "  ", email: "a@b.com", mobile: "9" })
    ).rejects.toThrow(/Name/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("adminRemoveCoordinator", () => {
  it("removes through the RPC and enforces the admin guard", async () => {
    rpcReturns({ ok: true });

    await adminRemoveCoordinator("e1");

    expect(rpc).toHaveBeenCalledWith("admin_remove_event_coordinator", { p_event_id: "e1" });
  });

  it("stops when the admin guard rejects", async () => {
    adminGuard.mockRejectedValueOnce(new Error("Not an admin."));
    await expect(adminRemoveCoordinator("e1")).rejects.toThrow("Not an admin.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("getAssignedCoordinatorEvent", () => {
  const coordinatorRow = {
    id: "c1",
    event_id: "e1",
    user_id: "usr_coordinator",
    name: "Prof. Carol",
    email: "carol@example.com",
    mobile: "9988776655",
    created_at: "2026-01-01T00:00:00Z",
  };

  async function loadWith(rows: Record<string, unknown>[]) {
    const { getDaysAsync } = await import("./eventStore");
    vi.mocked(getDaysAsync).mockResolvedValue([
      {
        id: "day-1",
        title: "Day 1",
        events: [{ id: "e1", name: "Code Sprint", date: "2026-01-01", time: "10:00" }],
      },
    ] as never);

    // A thenable-shaped builder: every chain level has to keep offering the same
    // methods, because adminListCoordinators ends in .order() while the member
    // and attendance reads end in .eq().
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["select", "eq", "order"]) builder[method] = vi.fn(chain);
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });

    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  }

  it("matches the signed-in user by id", async () => {
    await loadWith([coordinatorRow]);
    const assigned = await getAssignedCoordinatorEvent(APPOINTEE);
    expect(assigned?.event.id).toBe("e1");
  });

  it("matches an appointee who has not signed in yet, by email", async () => {
    await loadWith([{ ...coordinatorRow, user_id: null }]);
    const neverSignedIn = { ...APPOINTEE, id: "usr_different" };
    const assigned = await getAssignedCoordinatorEvent(neverSignedIn);
    expect(assigned?.event.id).toBe("e1");
  });

  it("does not grant access because the display name happens to match", async () => {
    // Names are not identifiers: two people can share one, and anybody can type
    // one into their profile. The previous version matched
    // c.name === user.fullName, which handed a stranger the coordinator dashboard.
    await loadWith([{ ...coordinatorRow, user_id: null, email: "someone.else@example.com" }]);
    const impostor = { ...APPOINTEE, email: "impostor@example.com", fullName: "Prof. Carol" };
    const assigned = await getAssignedCoordinatorEvent(impostor);
    expect(assigned).toBeNull();
  });
});

describe("adminGetCoordinatorSummaries headcount", () => {
  const DAY = [
    {
      id: "day-1",
      title: "Day 1",
      events: [
        { id: "kabaddi", name: "Kabaddi" },
        { id: "hackathon", name: "Hackathon" },
        { id: "flat", name: "Flat Pass" },
      ],
    },
  ];

  const member = (eventId: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${eventId}-m${i}`,
      event_id: eventId,
      registration_id: `${eventId}-r0`,
      member_name: `Player ${i}`,
      email: `${eventId}-p${i}@example.com`,
      attended: false,
    }));

  const reg = (eventId: string, id: string, members: unknown) => ({
    id,
    registration_code: id.toUpperCase(),
    event_id: eventId,
    user_id: `usr-${id}`,
    team_name: "T",
    captain_name: "C",
    fee: 0,
    payment_status: "recorded",
    terms_accepted: true,
    members,
    created_at: "2026-09-15T00:00:00Z",
  });

  async function summarise(regs: unknown[], members: unknown[], attendance: unknown[] = []) {
    const { getDaysAsync } = await import("./eventStore");
    vi.mocked(getDaysAsync).mockResolvedValue(DAY as never);
    vi.mocked(getRegistrationEventRows).mockResolvedValue(regs as never);

    const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
    from.mockImplementation((table: string) => {
      const rows = table === "registration_members" ? members : table === "attendance" ? attendance : [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const method of ["select", "eq", "order"]) builder[method] = vi.fn(chain);
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return builder;
    });

    const summaries = await adminGetCoordinatorSummaries();
    return Object.fromEntries(summaries.map((s) => [s.event.id, s]));
  }

  beforeEach(() => {
    vi.mocked(getRegistrationEventRows).mockResolvedValue([] as never);
  });

  it("counts every person in a team, not the one registration row", async () => {
    // One Kabaddi registration with 12 members is 12 students, so a coordinator
    // marking the whole squad in reaches 12/12. Counting the row gave 12/1 = 1200%.
    const rows = [
      { ...reg("kabaddi", "kabaddi-r0", [{ name: "A" }, { name: "B" }, { name: "C" }]) },
    ];
    const map = await summarise(rows, member("kabaddi", 3), member("kabaddi", 3).map((m) => ({ ...m, attended: true })));

    expect(map.kabaddi.totalParticipants).toBe(3);
    expect(map.kabaddi.attendedCount).toBe(3);
    expect(map.kabaddi.attendancePercentage).toBe(100);
  });

  it("does not let a partial registration_members table shrink the roster", async () => {
    // registration_members is trigger-populated, so it can lag or miss rows. The
    // old `members.length > 0 ? members.length : regs` rule threw the registrations
    // away for any event that had even one row, reporting 3 of 14 students.
    const regs = Array.from({ length: 14 }, (_, i) => reg("hackathon", `hackathon-r${i}`, [{ name: `S${i}` }]));
    const map = await summarise(regs, member("hackathon", 3));

    expect(map.hackathon.totalParticipants).toBe(14);
  });

  it("ignores member rows whose registration was deleted", async () => {
    // Orphan rows survive a registration delete. They are not people who plan to
    // arrive, so they must not inflate the roster or the attendance percentage.
    const orphans = [
      ...member("kabaddi", 12),
      { id: "orphan", event_id: "kabaddi", registration_id: "gone", member_name: "Ghost", email: "ghost@example.com" },
    ];
    const map = await summarise([reg("kabaddi", "kabaddi-r0", [{ name: "A" }, { name: "B" }])], orphans);

    expect(map.kabaddi.totalParticipants).toBe(2);
  });

  it("counts a registration with no members array as one student", async () => {
    // 4330 of 4396 rows are single-member flat passes, and a flat pass covering
    // several events is one row per event.
    const map = await summarise(
      [reg("flat", "flat-r0", []), reg("flat", "flat-r1", null), reg("flat", "flat-r2", undefined)],
      [],
    );

    expect(map.flat.totalParticipants).toBe(3);
  });

  it("never reports more arrivals than the roster, even with duplicate scans", async () => {
    const regs = [reg("kabaddi", "kabaddi-r0", [{ name: "A" }, { name: "B" }])];
    const scans = Array.from({ length: 9 }, (_, i) => ({ event_id: "kabaddi", participant_id: `x${i}` }));
    const map = await summarise(regs, member("kabaddi", 2), scans);

    expect(map.kabaddi.totalParticipants).toBe(2);
    expect(map.kabaddi.attendedCount).toBe(2);
    expect(map.kabaddi.attendancePercentage).toBe(100);
  });

  it("reports 0% rather than dividing by zero for an event nobody registered for", async () => {
    const map = await summarise([], []);

    expect(map.flat.totalParticipants).toBe(0);
    expect(map.flat.attendancePercentage).toBe(0);
  });
});

describe("getAttendanceEventStats desk headcounts", () => {
  const EVENTS = [{ id: "hackathon", name: "Hackathon", category: "tech", day_id: "day-2" }];

  /** Serve each table its own rows; anything else comes back empty. */
  function tables(overrides: Record<string, unknown[]>) {
    const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
    from.mockImplementation((table: string) => {
      const rows = overrides[table] ?? [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const method of ["select", "eq", "in", "order", "range"]) builder[method] = vi.fn(chain);
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return builder;
    });
  }

  beforeEach(() => {
    // The hub RPC is absent on this project, so the direct-query path is the
    // one that actually decides what the desk displays.
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    vi.mocked(getRegistrationCountsByEvent).mockResolvedValue({} as never);
    vi.mocked(getRegistrationEventRows).mockClear();
    vi.mocked(supabase.from).mockClear();
  });

  it("counts registrations per event from the cheap count read, never from member JSON", async () => {
    vi.mocked(getRegistrationCountsByEvent).mockResolvedValue({ hackathon: 12 } as never);
    tables({
      events: EVENTS,
      attendance: [
        { event_id: "hackathon", participant_email: "a@x.com", participant_id: "u1", status: "present" },
        { event_id: "hackathon", participant_email: "b@x.com", participant_id: "u2", status: "present" },
      ],
    });

    const stats = await getAttendanceEventStats();

    expect(stats.hackathon).toEqual({ total: 12, attended: 2 });
    // The regression guard: this is the whole point of the change. The desk
    // reloads on its coalesced cycle, and the member JSON for every
    // registration in the schema was being downloaded just to count rows.
    expect(getRegistrationCountsByEvent).toHaveBeenCalled();
    expect(getRegistrationEventRows).not.toHaveBeenCalled();
  });

  it("still reports an event nobody registered for instead of dropping it", async () => {
    tables({ events: EVENTS });

    const stats = await getAttendanceEventStats();

    expect(stats.hackathon).toEqual({ total: 0, attended: 0 });
  });

  it("keeps the exact event id working alongside the normalised aliases", async () => {
    vi.mocked(getRegistrationCountsByEvent).mockResolvedValue({ hackathon: 3 } as never);
    tables({ events: EVENTS });

    const stats = await getAttendanceEventStats();

    expect(stats.hackathon).toEqual(stats["tech-hackathon"]);
    expect(stats.hackathon.total).toBe(3);
  });

  it("takes attendance from the aggregate view instead of the member table", async () => {
    vi.mocked(getRegistrationCountsByEvent).mockResolvedValue({ kabaddi: 8 } as never);
    tables({
      events: [{ id: "kabaddi", name: "Kabaddi", category: "sports", day_id: "day-1" }],
      registration_member_stats: [{ event_id: "kabaddi", attended_people: 5 }],
    });

    const stats = await getAttendanceEventStats();

    expect(stats.kabaddi.attended).toBe(5);
    expect(stats.kabaddi.total).toBe(8);
  });

  it("never reads the full member table when no event is a sport", async () => {
    // The regression guard for the ~3.7 MB read. A non-sports event needs no
    // email list at all, so registration_members must not be queried; the
    // aggregate view alone answers the question.
    vi.mocked(getRegistrationCountsByEvent).mockResolvedValue({ hackathon: 4 } as never);
    tables({ events: EVENTS });

    const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
    await getAttendanceEventStats();

    const queriedTables = from.mock.calls.map((c) => c[0]);
    expect(queriedTables).toContain("registration_member_stats");
    expect(queriedTables).not.toContain("registration_members");
  });

  it("counts one person once on the unified sports pass across two sports", async () => {
    // The reason the sports read is still allowed to fetch emails at all: a
    // single pass admits someone to every sport, so attending two of them must
    // read as one arrival, not two.
    vi.mocked(getRegistrationCountsByEvent).mockResolvedValue({ kabaddi: 1, football: 1 } as never);
    tables({
      events: [
        { id: "kabaddi", name: "Kabaddi", category: "sports", day_id: "day-1" },
        { id: "football", name: "Football", category: "sports", day_id: "day-1" },
      ],
      registration_member_stats: [
        { event_id: "kabaddi", attended_people: 1 },
        { event_id: "football", attended_people: 1 },
      ],
      registration_members: [
        { event_id: "kabaddi", email: "sam@example.com" },
        { event_id: "football", email: "sam@example.com" },
      ],
    });

    const stats = await getAttendanceEventStats();

    expect(stats["sports-unified-master"].attended).toBe(1);
    expect(stats["sports-unified-master"].total).toBe(2);
  });
});
