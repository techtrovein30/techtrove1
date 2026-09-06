/**
 * storage.ts
 * ----------
 * Unified Supabase Storage helpers for TechTrove 3.0.
 *
 * All uploads (payment proofs and student ID cards) are stored in a single
 * private bucket ('uploads') with strict folder isolation and 2 MB limits:
 *   - Payment proofs: `payment-proofs/{user_id}/{registration_id}.{extension}`
 *   - ID cards:       `id-cards/{user_id}/{student_id}.{extension}`
 *
 * Stored references in the database use the relative storage path (not public URLs).
 * Authorized access uses short-lived temporary signed URLs.
 */

import { supabase, SUPABASE_URL } from "./supabase";

export const STORAGE_BUCKET = "uploads";
export const MAX_FILE_SIZE_BYTES = 2097152; // 2 MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

// Only ordinary URL-safe path segments are allowed in storage paths. Rejecting
// separators and ".." prevents path traversal via user-controlled segments.
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Throws if `segment` contains characters that could escape its folder. */
function assertSafePathSegment(segment: string, label: string): void {
  if (
    !segment ||
    segment.length === 0 ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("..") ||
    !SAFE_PATH_SEGMENT.test(segment)
  ) {
    throw new Error(`Invalid ${label}.`);
  }
}

/**
 * True when every '/' separated segment is a safe, non-empty path segment.
 * Rejects "." and ".." segments (path traversal) as well as separators and
 * characters outside the URL-safe allowlist.
 */
export function isSafeRelativeStoragePath(path: string): boolean {
  return path.split("/").every(
    (seg) =>
      seg.length > 0 &&
      seg !== "." &&
      seg !== ".." &&
      !seg.includes("..") &&
      SAFE_PATH_SEGMENT.test(seg)
  );
}

/** True when an absolute URL belongs to this project's Supabase storage origin. */
function isTrustedStorageUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  const projectUrl = (SUPABASE_URL ?? "").toLowerCase();
  return projectUrl !== "" && normalized.startsWith(`${projectUrl}/storage/`);
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates file size (<= 2MB) and MIME type (JPG, PNG, WebP).
 */
export function validateUploadFile(file: File): ValidationResult {
  if (!file) {
    return { valid: false, error: "Please select a file to upload." };
  }

  // Type check
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Unsupported file format. Please upload a JPG, PNG, or WebP image.",
    };
  }

  // Size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "File size exceeds the 2 MB limit. Please select a smaller file.",
    };
  }

  return { valid: true };
}

/**
 * Sanitizes and extracts the file extension, restricted to an allowlist of
 * known image extensions so it can never inject path separators.
 */
function getFileExtension(filename: string, fallback = "jpg"): string {
  const parts = filename.split(".");
  if (parts.length < 2) return fallback;
  const raw = parts.pop()?.toLowerCase() ?? "";
  const ext = raw === "jpeg" ? "jpg" : raw;
  return ALLOWED_EXTENSIONS.has(ext) ? ext : fallback;
}

/**
 * Uploads a payment proof screenshot to `payment-proofs/{userId}/{registrationId}.{ext}`.
 * Returns the stored relative path upon success.
 */
export async function uploadPaymentProof(
  userId: string,
  registrationId: string,
  file: File
): Promise<string> {
  const validation = validateUploadFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (!userId) throw new Error("User session required for upload.");
  if (!registrationId) throw new Error("Registration ID required for upload.");
  assertSafePathSegment(userId, "user id");
  assertSafePathSegment(registrationId, "registration id");

  const ext = getFileExtension(file.name);
  const path = `payment-proofs/${userId}/${registrationId}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) {
    console.error("Payment proof upload failed:", error);
    throw new Error("Failed to upload payment proof: " + error.message);
  }

  return path;
}

/**
 * Replaces an existing payment proof screenshot for a registration WITHOUT
 * changing the stored path, so the registration row never needs an update.
 *
 * The existing path is re-validated to stay inside the caller's own
 * `payment-proofs/{userId}/` folder before it is overwritten (upsert). This is
 * what makes participant-side re-upload work without any database change.
 */
export async function reuploadPaymentProof(
  userId: string,
  existingPath: string | null | undefined,
  file: File
): Promise<string> {
  const validation = validateUploadFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (!userId) throw new Error("User session required for upload.");

  // Strip bucket prefix if accidentally included.
  const cleanPath = existingPath?.startsWith("uploads/")
    ? existingPath.slice("uploads/".length)
    : (existingPath ?? "");

  const expectedPrefix = `payment-proofs/${userId}/`;
  if (
    !cleanPath ||
    cleanPath.length === 0 ||
    !cleanPath.startsWith(expectedPrefix) ||
    !isSafeRelativeStoragePath(cleanPath)
  ) {
    throw new Error(
      "No previous payment screenshot was found for this registration. Please contact support.",
    );
  }

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(cleanPath, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    console.error("Payment proof re-upload failed:", error);
    throw new Error("Failed to re-upload the payment screenshot. Please try again.");
  }

  return cleanPath;
}

/**
 * Uploads a student ID card image to `id-cards/{userId}/{studentId}.{ext}`.
 * Returns the stored relative path upon success.
 */
export async function uploadIdCard(
  userId: string,
  studentId: string,
  file: File
): Promise<string> {
  const validation = validateUploadFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (!userId) throw new Error("User session required for upload.");
  if (!studentId) throw new Error("Student ID required for upload.");
  assertSafePathSegment(userId, "user id");
  assertSafePathSegment(studentId, "student id");

  const ext = getFileExtension(file.name);
  const path = `id-cards/${userId}/${studentId}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) {
    console.error("ID card upload failed:", error);
    throw new Error("Failed to upload ID card: " + error.message);
  }

  return path;
}

/**
 * Generates a temporary signed URL for viewing a private file.
 * Defaults to a 5-minute (300 seconds) expiration.
 */
export async function getUploadSignedUrl(
  path: string | null | undefined,
  expiresInSeconds = 300
): Promise<string | null> {
  if (!path) return null;

  // Legacy absolute URLs are only trusted when they belong to this project's
  // Supabase storage origin. Anything else (arbitrary http/https) is rejected.
  if (path.startsWith("http://") || path.startsWith("https://")) {
    if (!isTrustedStorageUrl(path)) {
      console.error("Refusing to use untrusted storage URL:", path);
      return null;
    }
    return path;
  }

  // Strip bucket prefix if accidentally included
  const cleanPath = path.startsWith("uploads/")
    ? path.slice("uploads/".length)
    : path;

  if (!isSafeRelativeStoragePath(cleanPath)) {
    console.error("Refusing to create signed URL for unsafe path:", cleanPath);
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.error("Failed to create signed URL for", cleanPath, error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error("Exception creating signed URL:", err);
    return null;
  }
}

/**
 * Deletes a payment proof object from the uploads bucket on behalf of an admin.
 *
 * Called during the "Request Re-upload" flow so the old screenshot is genuinely
 * removed from Storage (not merely hidden by nulling the DB reference).
 *
 * The caller is responsible for ensuring the admin is authenticated; the
 * existing Storage RLS policy "Users and admins can delete uploads" enforces
 * this at the Supabase layer.
 *
 * Throws if the path is unsafe or if Storage deletion reports an error.
 */
export async function adminDeletePaymentProof(path: string): Promise<void> {
  // Strip bucket prefix if accidentally included (same convention as the rest
  // of this file: stored paths are already relative to the bucket).
  const cleanPath = path.startsWith("uploads/")
    ? path.slice("uploads/".length)
    : path;

  if (!cleanPath || !isSafeRelativeStoragePath(cleanPath)) {
    throw new Error(
      "Cannot delete: invalid or unsafe Storage path: " + JSON.stringify(path),
    );
  }

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([cleanPath]);

  if (error) {
    console.error("[admin] Storage deletion failed for", cleanPath, error);
    throw new Error(
      "Failed to delete the old payment screenshot from Storage: " + error.message,
    );
  }
}
