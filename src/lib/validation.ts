import type { ParticipantType } from "./api";
import type { TechEvent } from "./eventStore";

/** Reject event image URLs that could be a data:/javascript:/external vector (M18). */
export function isSafeEventImage(url: string | undefined | null): url is string {
  if (!url) return true;
  // Relative, same-origin image paths (static assets bundled with the app).
  if (url.startsWith("/")) {
    return url.startsWith("/images/") || url.startsWith("/assets/");
  }
  // Absolute URLs must be https and not data:/javascript:.
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve the image to render for an event, or undefined if not allowed. */
export function safeEventImage(url: string | undefined | null): string | undefined {
  return isSafeEventImage(url) ? url : undefined;
}

/** Checks if an event is a sports event (Day 1 / Sports category) */
export function isSportEvent(event?: TechEvent | null): boolean {
  if (!event) return false;
  return event.dayId === "day-1" || event.category?.toLowerCase() === "sports";
}

/** Checks if an event is an individual competition (registrationType === "individual" or requiredPlayers === 1) */
export function isIndividualEvent(event?: TechEvent | null): boolean {
  if (!event) return false;
  return event.registrationType === "individual" || (event.requiredPlayers ?? 1) === 1;
}

/** Validates register number for SIMATS internal students vs external participants */
export function validateRegisterNumber(
  regNumber: string | undefined | null,
  pType: ParticipantType
): string | null {
  if (pType !== "internal") return null;

  const trimmed = regNumber?.trim() ?? "";
  if (!trimmed) {
    return "Internal student register number is required.";
  }
  if (!trimmed.toUpperCase().startsWith("19")) {
    return "Internal student register number must start with 19.";
  }
  return null;
}

/** Validates email address according to participant type */
export function validateEmail(
  email: string | undefined | null,
  pType: ParticipantType
): string | null {
  const trimmed = email?.trim() ?? "";
  if (!trimmed) {
    return "Email is required.";
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return "Please enter a valid email address.";
  }

  if (pType === "internal") {
    if (!trimmed.toLowerCase().endsWith("@saveetha.com")) {
      return "Internal student email must end with @saveetha.com.";
    }
  }

  return null;
}

/** Validates mobile number (10-digit Indian mobile format) */
export function validatePhoneNumber(
  phone: string | undefined | null,
  required: boolean = true
): string | null {
  const trimmed = phone?.trim() ?? "";
  if (!trimmed) {
    if (required) return "Phone number is required.";
    return null;
  }

  // Reject letters, non-digits, or numbers that don't match 10 digits starting with 6-9
  const indianMobileRegex = /^[6-9]\d{9}$/;
  if (!indianMobileRegex.test(trimmed)) {
    return "Please enter a valid 10-digit mobile number.";
  }

  return null;
}

/** Validates a UPI / bank UTR / transaction reference (12-16 alphanumeric). */
export function validateUtrNumber(
  utr: string | undefined | null
): string | null {
  const trimmed = utr?.trim() ?? "";
  if (!trimmed) {
    return "UTR / Transaction ID is required.";
  }
  if (!/^[A-Za-z0-9]{12,16}$/.test(trimmed)) {
    return "Enter a valid UTR / Transaction ID (12–16 alphanumeric characters).";
  }
  return null;
}
