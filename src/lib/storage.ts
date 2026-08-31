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

import { supabase } from "./supabase";

export const STORAGE_BUCKET = "uploads";
export const MAX_FILE_SIZE_BYTES = 2097152; // 2 MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

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
 * Sanitizes and extracts the file extension.
 */
function getFileExtension(filename: string, fallback = "jpg"): string {
  const parts = filename.split(".");
  if (parts.length < 2) return fallback;
  const ext = parts.pop()?.toLowerCase() ?? fallback;
  return ext === "jpeg" ? "jpg" : ext;
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

  // Handle case where an old absolute URL might still be present in legacy data
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Strip bucket prefix if accidentally included
  const cleanPath = path.startsWith("uploads/")
    ? path.slice("uploads/".length)
    : path;

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
