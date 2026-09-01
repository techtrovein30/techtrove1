import { describe, test, expect } from "vitest";
import {
  isSportEvent,
  isIndividualEvent,
  validateRegisterNumber,
  validateEmail,
  validatePhoneNumber,
} from "./lib/validation";
import type { TechEvent } from "./lib/eventStore";
import { api } from "./lib/api";

// Sample mock events for testing
const sportsEvent: TechEvent = {
  id: "sp-1",
  dayId: "day-1",
  category: "Sports",
  name: "Cricket",
  description: "Sports cricket tournament",
  registrationOpen: true,
  registrationType: "team",
  requiredPlayers: 11,
  maxSubstitutes: 4,
  registrationFee: 100,
};

const chessEvent: TechEvent = {
  id: "sp-chess",
  dayId: "day-1",
  category: "Sports",
  name: "Chess",
  description: "Individual chess tournament",
  registrationOpen: true,
  registrationType: "individual",
  requiredPlayers: 1,
  maxSubstitutes: 0,
  registrationFee: 50,
};

const technicalEvent: TechEvent = {
  id: "tech-1",
  dayId: "day-2",
  category: "Technical",
  name: "Hackathon",
  description: "Technical hackathon event",
  registrationOpen: true,
  registrationType: "team",
  requiredPlayers: 3,
  maxSubstitutes: 2, // Even if maxSubstitutes set in data, isSportEvent will return false
  registrationFee: 200,
};

const nonTechnicalEvent: TechEvent = {
  id: "nontech-1",
  dayId: "day-3",
  category: "Non-Technical",
  name: "Dance",
  description: "Non-technical dance event",
  registrationOpen: true,
  registrationType: "team",
  requiredPlayers: 4,
  maxSubstitutes: 1,
  registrationFee: 150,
};

describe("Registration System Validation & Dynamic Rules Test Suite", () => {
  // Test Case 1: Internal student + valid register number 19... + @saveetha.com -> PASS
  test("1. Internal student + valid register number 19... + @saveetha.com -> PASS", () => {
    const regErr = validateRegisterNumber("190701001", "internal");
    const emailErr = validateEmail("student19@saveetha.com", "internal");
    const phoneErr = validatePhoneNumber("9876543210", false);

    expect(regErr).toBeNull();
    expect(emailErr).toBeNull();
    expect(phoneErr).toBeNull();
  });

  // Test Case 2: Internal student + register number not starting with 19 -> FAIL
  test("2. Internal student + register number not starting with 19 -> FAIL", () => {
    const regErr = validateRegisterNumber("200701001", "internal");
    expect(regErr).toBe("Internal student register number must start with 19.");
  });

  // Test Case 3: Internal student + email not ending @saveetha.com -> FAIL
  test("3. Internal student + email not ending @saveetha.com -> FAIL", () => {
    const emailErr = validateEmail("student@gmail.com", "internal");
    expect(emailErr).toBe("Internal student email must end with @saveetha.com.");
  });

  // Test Case 4: Internal student + invalid phone number -> FAIL
  test("4. Internal student + invalid phone number -> FAIL", () => {
    const phoneErr = validatePhoneNumber("12345", false);
    expect(phoneErr).toBe("Please enter a valid 10-digit mobile number.");

    const phoneWithLettersErr = validatePhoneNumber("98765abcde", false);
    expect(phoneWithLettersErr).toBe("Please enter a valid 10-digit mobile number.");
  });

  // Test Case 5: External student + valid phone + valid email -> PASS
  test("5. External student + valid phone + valid email -> PASS", () => {
    const emailErr = validateEmail("external.user@othercollege.edu", "external");
    const phoneErr = validatePhoneNumber("9876543210", true);

    expect(emailErr).toBeNull();
    expect(phoneErr).toBeNull();
  });

  // Test Case 6: External student + invalid phone -> FAIL
  test("6. External student + invalid phone -> FAIL", () => {
    const emptyPhoneErr = validatePhoneNumber("", true);
    expect(emptyPhoneErr).toBe("Phone number is required.");

    const shortPhoneErr = validatePhoneNumber("98765", true);
    expect(shortPhoneErr).toBe("Please enter a valid 10-digit mobile number.");
  });

  // Test Case 7: External student + invalid email -> FAIL
  test("7. External student + invalid email -> FAIL", () => {
    const invalidEmailErr = validateEmail("invalid-email-format", "external");
    expect(invalidEmailErr).toBe("Please enter a valid email address.");
  });

  // Test Case 8: External student + non-Saveetha email -> PASS
  test("8. External student + non-Saveetha email -> PASS", () => {
    const emailErr = validateEmail("participant@gmail.com", "external");
    expect(emailErr).toBeNull();
  });

  // Test Case 9: Chess/individual event -> Team name/details must NOT appear
  test("9. Chess/individual event -> Team name/details must NOT appear", () => {
    expect(isIndividualEvent(chessEvent)).toBe(true);
  });

  // Test Case 10: Technical event -> Substitute fields must NOT appear
  test("10. Technical event -> Substitute fields must NOT appear", () => {
    expect(isSportEvent(technicalEvent)).toBe(false);
  });

  // Test Case 11: Non-technical event -> Substitute fields must NOT appear
  test("11. Non-technical event -> Substitute fields must NOT appear", () => {
    expect(isSportEvent(nonTechnicalEvent)).toBe(false);
  });

  // Test Case 12: Team-based event -> Required team fields should still work
  test("12. Team-based event -> Required team fields should still work", () => {
    expect(isIndividualEvent(sportsEvent)).toBe(false);
    expect(isIndividualEvent(technicalEvent)).toBe(false);
  });

  // Test Case 13: Sports event -> Existing sports-specific functionality should remain intact
  test("13. Sports event -> Existing sports-specific functionality should remain intact", () => {
    expect(isSportEvent(sportsEvent)).toBe(true);
  });

  // Test Case 14: Attempt to bypass frontend validation through API -> Must be rejected by backend
  test("14. API reject invalid internal reg number, non-Saveetha email, or invalid substitutes", async () => {
    // Calling createRegistration with invalid internal reg number
    await expect(
      api.createRegistration({
        eventId: "day-2-hackathon",
        teamName: "Team Alpha",
        captainName: "John Doe",
        termsAccepted: true,
        members: [
          {
            name: "John Doe",
            role: "player",
            position: 1,
            participantType: "internal",
            email: "john@gmail.com", // FAIL: not @saveetha.com
            regNumber: "200701001", // FAIL: doesn't start with 19
          },
        ],
      })
    ).rejects.toThrow();
  });
});
