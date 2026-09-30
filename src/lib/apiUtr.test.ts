import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkUtrExists } from "./api";
import { supabase } from "./supabase";

vi.mock("./supabase", () => {
  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    },
  };
});

describe("checkUtrExists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { exists: false } for short or empty UTRs", async () => {
    const resEmpty = await checkUtrExists("");
    expect(resEmpty.exists).toBe(false);

    const resShort = await checkUtrExists("123");
    expect(resShort.exists).toBe(false);
  });

  it("returns { exists: false } when RPC reports UTR does not exist in database", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: false,
      error: null,
    } as any);

    const res = await checkUtrExists("192524381123");
    expect(res.exists).toBe(false);
    expect(Boolean(res.exists)).toBe(false);
  });

  it("returns { exists: true } when RPC reports UTR already exists in database", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: true,
      error: null,
    } as any);

    const res = await checkUtrExists("192524381123");
    expect(res.exists).toBe(true);
    expect(Boolean(res.exists)).toBe(true);
  });

  it("passes excludeRegistrationCode when supplied to ignore current batch", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: false,
      error: null,
    } as any);

    await checkUtrExists("192524381123", "TT-L8K2-A4FG9Z");
    expect(supabase.rpc).toHaveBeenCalledWith("check_utr_exists", {
      p_utr: "192524381123",
      p_exclude_code: "TT-L8K2-A4FG9Z",
    });
  });
});
