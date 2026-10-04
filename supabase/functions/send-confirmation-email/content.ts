/**
 * content.ts
 * -----------
 * Pure confirmation-email content builder for the TechTrove 3.0 email worker.
 * No runtime globals — unit-testable from vitest. Template copy authored by
 * the organizing team (25 Sep 2026); fully static greeting "Dear Participant,"
 * with the two-day event split.
 *
 * Data-safety: no internal payment fields (UTR, screenshots, storage paths,
 * phone numbers, review notes, id-card paths) ever appear in this mail.
 */

export interface ConfirmationContentData {
  registrationCode: string;
  teamName: string | null;
  captainName: string | null;
  recipientName: string | null;
  eventNames: string[];
  totalFee: number;
}

export interface BrandConfig {
  festName: string;
  tagline: string;
  eventDate: string;
  venue: string;
  whatsappUrl: string;
  supportEmail: string;
}

export const CONFIRMATION_BRAND: BrandConfig = {
  festName: "Techtrove 3.0",
  tagline: "SIMATS Engineering",
  eventDate: "October 5 – 6, 2026",
  venue: "SIMATS Engineering",
  whatsappUrl: "https://chat.whatsapp.com/F3ca20zjmVoJcu6FCYGPSZ",
  supportEmail: "techtroveversion3@gmail.com",
};

export interface BuiltMail {
  subject: string;
  html: string;
  text: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds the confirmation email for ONE registration_code. The current
 * template is a static, team-authored confirmation (per-code personalization
 * is intentionally not part of the approved copy).
 */
export function buildConfirmationMail(
  _data: ConfirmationContentData,
  brand: BrandConfig = CONFIRMATION_BRAND,
): BuiltMail {
  const subject = `Registration Confirmed — ${brand.festName}`;

  const dayBlock = (date: string, events: string) =>
    `<div style="background:#1e1e27;border:1px dashed #7c3aed66;border-radius:8px;padding:12px 16px;margin:10px 0;">` +
    `<p style="margin:0;font-size:14px;"><b>📅 Date:</b> ${esc(date)}</p>` +
    `<p style="margin:0;font-size:14px;"><b>📍 Venue:</b> ${esc(brand.venue)}</p>` +
    `<p style="margin:0;font-size:14px;"><b>🎯 Events:</b> ${esc(events)}</p>` +
    `</div>`;

  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#0b0b0f;font-family:Arial,Helvetica,sans-serif;">` +
    `<div style="max-width:600px;margin:0 auto;padding:32px 20px;">` +
    `<div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">` +
    `<h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;letter-spacing:1px;">${esc(brand.festName)}</h1>` +
    `<p style="margin:6px 0 0;color:#f3e8ff;font-size:13px;letter-spacing:3px;text-transform:uppercase;">${esc(brand.tagline)}</p>` +
    `</div>` +
    `<div style="background:#16161d;color:#ededed;padding:32px;border-radius:0 0 12px 12px;line-height:1.7;font-size:15px;">` +
    `<p style="margin:0 0 14px;"><strong>Dear Participant,</strong></p>` +
    `<p style="margin:0 0 14px;">Greetings from SIMATS Engineering!</p>` +
    `<p style="margin:0 0 14px;">We are pleased to confirm that your registration for <strong>${esc(brand.festName)}</strong> has been successfully completed.</p>` +
    dayBlock("October 5, 2026", "Sports Events") +
    dayBlock("October 6, 2026", "Technical & Non-Technical Events") +
    `<p style="margin:0 0 14px;">Your registration has been successfully recorded. We look forward to welcoming you to ${esc(brand.festName)}.</p>` +
    `<p style="margin:0 0 14px;">Further details regarding reporting time, venue, and event-specific instructions will be communicated shortly.</p>` +
    `<p style="margin:0;">Regards,<br/>${esc(brand.festName)} Organizing Team<br/>SIMATS Engineering</p>` +
    `</div>` +
    `<p style="text-align:center;color:#6b7280;font-size:11px;margin:18px 0;">${esc(brand.festName)} · ${esc(brand.tagline)}</p>` +
    `</div></body></html>`;

  const text =
    `Registration Confirmed — ${brand.festName}\n\n` +
    `Dear Participant,\n\n` +
    `Greetings from SIMATS Engineering!\n\n` +
    `We are pleased to confirm that your registration for ${brand.festName} ` +
    `has been successfully completed.\n\n` +
    `📅 Date: October 5, 2026\n` +
    `📍 Venue: ${brand.venue}\n` +
    `🎯 Events: Sports Events\n\n` +
    `📅 Date: October 6, 2026\n` +
    `📍 Venue: ${brand.venue}\n` +
    `🎯 Events: Technical & Non-Technical Events\n\n` +
    `Your registration has been successfully recorded. We look forward to welcoming ` +
    `you to ${brand.festName}.\n\n` +
    `Further details regarding reporting time, venue, and event-specific ` +
    `instructions will be communicated shortly.\n\n` +
    `Regards,\n` +
    `${brand.festName} Organizing Team\n` +
    `SIMATS Engineering`;

  return { subject, html, text };
}