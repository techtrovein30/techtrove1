import { describe, it, expect } from "vitest";
import {
  isSafeEventImage,
  safeEventImage,
  validateRegisterNumber,
  validateEmail,
  validatePhoneNumber,
  validateUtrNumber,
  isSportEvent,
  isIndividualEvent,
} from "./validation";

describe("validation.ts helpers", () => {
  describe("safeEventImage / isSafeEventImage (M18)", () => {
    it("allows same-origin image assets", () => {
      expect(isSafeEventImage("/images/hero.webp")).toBe(true);
      expect(safeEventImage("/images/hero.webp")).toBe("/images/hero.webp");
      expect(isSafeEventImage("/assets/banner.jpg")).toBe(true);
    });

    it("rejects data:, javascript:, and non-image relative paths", () => {
      expect(isSafeEventImage("data:text/html;base64,xxx")).toBe(false);
      expect(isSafeEventImage("javascript:alert(1)")).toBe(false);
      expect(isSafeEventImage("/sensitive/profile")).toBe(false);
      expect(safeEventImage("data:text/html;base64,xxx")).toBeUndefined();
    });

    it("allows https absolute URLs but rejects http and malformed", () => {
      expect(isSafeEventImage("https://cdn.example.com/a.png")).toBe(true);
      expect(isSafeEventImage("http://cdn.example.com/a.png")).toBe(false);
      expect(isSafeEventImage("not a url")).toBe(false);
    });
  });

  describe("validateRegisterNumber", () => {
    it("requires register number for internal students", () => {
      expect(validateRegisterNumber("", "internal")).toMatch(/required/i);
      expect(validateRegisterNumber("19abcd1234", "internal")).toBeNull();
      expect(validateRegisterNumber("20abcd1234", "internal")).toMatch(/must start with 19/i);
    });
    it("ignores external participants", () => {
      expect(validateRegisterNumber("", "external")).toBeNull();
    });
  });

  describe("validateEmail", () => {
    it("validates format and internal domain", () => {
      expect(validateEmail("a@saveetha.com", "internal")).toBeNull();
      expect(validateEmail("a@gmail.com", "internal")).toMatch(/saveetha/i);
      expect(validateEmail("bad", "external")).toMatch(/valid email/i);
      expect(validateEmail("", "external")).toMatch(/required/i);
    });
  });

  describe("validatePhoneNumber", () => {
    it("accepts valid 10-digit Indian mobiles and rejects others", () => {
      expect(validatePhoneNumber("9876543210", true)).toBeNull();
      expect(validatePhoneNumber("7876543210", true)).toBeNull();
      expect(validatePhoneNumber("5876543210", true)).toMatch(/10-digit/i);
      expect(validatePhoneNumber("98765432", true)).toMatch(/10-digit/i);
      expect(validatePhoneNumber("", true)).toMatch(/required/i);
      expect(validatePhoneNumber("", false)).toBeNull();
    });
  });

  describe("validateUtrNumber", () => {
    it("requires 12-16 alphanumeric", () => {
      expect(validateUtrNumber("ABCD12345678")).toBeNull();
      expect(validateUtrNumber("ABCD1234")).toMatch(/12/);
      expect(validateUtrNumber("")).toMatch(/required/i);
    });
  });

  describe("isSportEvent / isIndividualEvent", () => {
    const sport = { dayId: "day-1", category: "Sports" } as never;
    const individual = { registrationType: "individual", requiredPlayers: 1 } as never;
    const team = { registrationType: "team", requiredPlayers: 4 } as never;

    it("detects sports and individual events", () => {
      expect(isSportEvent(sport)).toBe(true);
      expect(isSportEvent(team)).toBe(false);
      expect(isIndividualEvent(individual)).toBe(true);
      expect(isIndividualEvent(team)).toBe(false);
    });
    it("handles undefined", () => {
      expect(isSportEvent(undefined)).toBe(false);
      expect(isIndividualEvent(null)).toBe(false);
    });
  });
});