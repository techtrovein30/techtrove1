/**
 * content.test.ts — pure unit tests for the confirmation-email content builder.
 * Template verifies against the organizing-team copy (25 Sep 2026).
 */

import { describe, expect, it } from "vitest";
import { buildConfirmationMail, CONFIRMATION_BRAND } from "./content.ts";

const BASE_DATA = {
  registrationCode: "TTX-1234-AB",
  teamName: "Team Phoenix",
  captainName: "Aarav",
  recipientName: "Aarav",
  eventNames: ["CodeGolf", "Robo Wars"],
  totalFee: 150,
};

describe("buildConfirmationMail", () => {
  it("uses the approved subject and static greeting", () => {
    const mail = buildConfirmationMail(BASE_DATA);
    expect(mail.subject).toContain("Registration Confirmed");
    expect(mail.subject).toContain(CONFIRMATION_BRAND.festName);
    expect(mail.html).toContain("Dear Participant");
    expect(mail.text).toContain("Greetings from SIMATS Engineering!");
  });

  it("shows both event days with venue and event categories", () => {
    const mail = buildConfirmationMail(BASE_DATA, CONFIRMATION_BRAND);
    expect(mail.html).toContain("October 5, 2026");
    expect(mail.html).toContain("Sports Events");
    expect(mail.html).toContain("October 6, 2026");
    expect(mail.html).toContain("Technical &amp; Non-Technical Events");
    expect(mail.html).toContain(CONFIRMATION_BRAND.venue);
    expect(mail.text).toContain("October 5, 2026");
    expect(mail.text).toContain("Technical & Non-Technical Events");
  });

  it("signs off with the organizing team", () => {
    const mail = buildConfirmationMail(BASE_DATA);
    expect(mail.html).toContain(`${CONFIRMATION_BRAND.festName} Organizing Team`);
    expect(mail.text).toContain("SIMATS Engineering");
  });

  it("escapes brand strings (XSS hygiene)", () => {
    const mail = buildConfirmationMail(BASE_DATA, {
      ...CONFIRMATION_BRAND,
      festName: '<b class="x">Techtrove</b>',
      venue: '<script>alert(1)</script>',
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain('<b class="x">');
  });
});

// ── Data-safety rule: no internal payment fields in an email ───────────────

describe("data-safety / internal-field exclusions", () => {
  const mail = buildConfirmationMail(BASE_DATA);
  const body = `${mail.subject}\n${mail.html}\n${mail.text}`;

  const internalMarkers = [
    "UTR",
    "utr_no",
    "screenshot",
    "payment_review",
    "review_note",
    "id_card",
    "reg_number",
    "user_id",
    "storage",
    "phone",
    "membership",
    "certificate",
    "TTX-1234-AB",
    "₹150",
  ];

  it("never leaks internal payment / participant fields", () => {
    for (const marker of internalMarkers) {
      expect(body).not.toContain(marker);
    }
  });
});