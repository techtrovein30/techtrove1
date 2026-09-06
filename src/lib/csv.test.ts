import { describe, it, expect } from "vitest";
import { csvEscapeField, toCsv } from "./csv";

describe("CSV export hardening (C05/N2)", () => {
  describe("csvEscapeField", () => {
    it("neutralizes leading formula characters", () => {
      expect(csvEscapeField("=cmd|' /C calc'!A0")).toBe(`"'=cmd|' /C calc'!A0"`);
      expect(csvEscapeField("+SUM(A1:A2)")).toBe(`"'+SUM(A1:A2)"`);
      expect(csvEscapeField("-1+1")).toBe(`"'-1+1"`);
      expect(csvEscapeField("@admin")).toBe(`"'@admin"`);
      expect(csvEscapeField("\tfile")).toBe(`"'\tfile"`);
      expect(csvEscapeField("\rfile")).toBe(`"'\rfile"`);
      expect(csvEscapeField("\n@cmd")).toBe(`"'\n@cmd"`);
    });

    it("leaves safe fields untouched", () => {
      expect(csvEscapeField("TechTrove")).toBe('"TechTrove"');
      expect(csvEscapeField("Team Alpha!")).toBe('"Team Alpha!"');
      expect(csvEscapeField(1234)).toBe('"1234"');
      expect(csvEscapeField(null)).toBe('""');
      expect(csvEscapeField(undefined)).toBe('""');
    });

    it("RFC-4180 escapes embedded double quotes", () => {
      expect(csvEscapeField('say "hi"')).toBe('"say ""hi"""');
    });

    it("does not neutralize formula characters that are not at the start", () => {
      expect(csvEscapeField("team=alpha")).toBe('"team=alpha"');
    });
  });

  describe("toCsv", () => {
    it("produces a CRLF CSV with escaped headers and rows", () => {
      const csv = toCsv(
        ["Name", "Fee"],
        [["Team, A", 300], ["=Bad", 0]],
      );
      expect(csv).toBe('"Name","Fee"\r\n"Team, A","300"\r\n"\'=Bad","0"');
    });
  });
});