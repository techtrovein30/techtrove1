import { describe, it, expect, beforeEach } from "vitest";
import { secureStorage } from "./secureStorage";

const PREFIX = "techtrove3:";

describe("secureStorage (R6 — session storage adapter)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("round-trips values through get/set", () => {
    secureStorage.setItem("supabase.auth.token", "JWT-ABC");
    expect(secureStorage.getItem("supabase.auth.token")).toBe("JWT-ABC");
  });

  it("namespaces keys and never writes to localStorage", () => {
    secureStorage.setItem("supabase.auth.token", "JWT-ABC");
    expect(sessionStorage.getItem(`${PREFIX}supabase.auth.token`)).toBe("JWT-ABC");
    expect(localStorage.length).toBe(0);
  });

  it("removes values on removeItem", () => {
    secureStorage.setItem("supabase.auth.token", "JWT-ABC");
    secureStorage.removeItem("supabase.auth.token");
    expect(secureStorage.getItem("supabase.auth.token")).toBeNull();
    expect(sessionStorage.getItem(`${PREFIX}supabase.auth.token`)).toBeNull();
  });

  it("recovers pre-existing sessionStorage values (page reload)", () => {
    sessionStorage.setItem(`${PREFIX}supabase.auth.token`, "JWT-OLD");
    expect(secureStorage.getItem("supabase.auth.token")).toBe("JWT-OLD");
  });

  it("returns null for missing keys", () => {
    expect(secureStorage.getItem("nope")).toBeNull();
  });
});