import { describe, it, expect } from "vitest";
import {
  validateUploadFile,
  getUploadSignedUrl,
  MAX_FILE_SIZE_BYTES,
} from "./storage";

describe("Unified Storage Module", () => {
  describe("validateUploadFile", () => {
    it("accepts valid JPEG, PNG, and WebP files under 2 MB", () => {
      const jpg = new File(["dummy content"], "test.jpg", { type: "image/jpeg" });
      const png = new File(["dummy content"], "test.png", { type: "image/png" });
      const webp = new File(["dummy content"], "test.webp", { type: "image/webp" });

      expect(validateUploadFile(jpg)).toEqual({ valid: true });
      expect(validateUploadFile(png)).toEqual({ valid: true });
      expect(validateUploadFile(webp)).toEqual({ valid: true });
    });

    it("rejects files larger than 2 MB (2097152 bytes)", () => {
      // Create a mock large file
      const largeFile = new File(["x"], "large.png", { type: "image/png" });
      Object.defineProperty(largeFile, "size", { value: MAX_FILE_SIZE_BYTES + 1 });

      const result = validateUploadFile(largeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("2 MB limit");
    });

    it("rejects unsupported MIME types", () => {
      const pdf = new File(["dummy content"], "document.pdf", { type: "application/pdf" });
      const gif = new File(["dummy content"], "animation.gif", { type: "image/gif" });
      const text = new File(["dummy content"], "note.txt", { type: "text/plain" });

      expect(validateUploadFile(pdf).valid).toBe(false);
      expect(validateUploadFile(gif).valid).toBe(false);
      expect(validateUploadFile(text).valid).toBe(false);
    });

    it("handles null or undefined input gracefully", () => {
      // @ts-expect-error testing runtime falsy input
      const result = validateUploadFile(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Please select a file");
    });
  });

  describe("getUploadSignedUrl", () => {
    it("returns null for null or empty paths", async () => {
      expect(await getUploadSignedUrl(null)).toBeNull();
      expect(await getUploadSignedUrl(undefined)).toBeNull();
      expect(await getUploadSignedUrl("")).toBeNull();
    });

    it("returns legacy absolute URLs without calling storage", async () => {
      const legacyUrl = "https://odozwlmavgrazgpnjmze.supabase.co/storage/v1/object/public/payment_screenshots/123.jpg";
      const result = await getUploadSignedUrl(legacyUrl);
      expect(result).toBe(legacyUrl);
    });
  });
});
