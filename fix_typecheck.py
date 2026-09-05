import re

# Fix api.ts
with open('src/lib/api.ts', 'r') as f:
    api_code = f.read()

# Fix the residual old block in api.ts that wasn't replaced properly.
# Actually I'll just rewrite the whole `createRegistration` method again using regex.
pattern = re.compile(r'async createRegistration\(input: \{.*?\}\): Promise<Registration(?:\[\])?> \{.*?\n  \},', re.DOTALL)
new_method = '''async createRegistration(input: {
    eventIds: string[];
    teamName: string;
    captainName: string;
    members: RegistrationMember[];
    termsAccepted: boolean;
    utrNumber?: string;
    paymentScreenshotPath?: string;
    paymentScreenshotUrl?: string;
  }): Promise<Registration[]> {
    if (!input.termsAccepted) throw new Error("Terms and conditions must be accepted.");

    if (input.eventIds.length === 0) throw new Error("No events selected.");

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    const profile = await getParticipantById(authUser.id);
    const participantType: ParticipantType = profile?.participant_type ?? "internal";
    const regTable = REGISTRATION_TABLE_FOR[participantType];

    for (const m of input.members) {
      if (!m.name.trim()) throw new Error("All team members must have a name.");
      const emailErr = validateEmail(m.email, m.participantType);
      if (emailErr) throw new Error(`${m.name}: ${emailErr}`);

      if (m.participantType === "internal") {
        const regErr = validateRegisterNumber(m.regNumber, "internal");
        if (regErr) throw new Error(`${m.name}: ${regErr}`);

        if (m.phone && m.phone.trim()) {
          const phoneErr = validatePhoneNumber(m.phone, false);
          if (phoneErr) throw new Error(`${m.name}: ${phoneErr}`);
        }
      } else {
        const phoneErr = validatePhoneNumber(m.phone, true);
        if (phoneErr) throw new Error(`${m.name}: ${phoneErr}`);
      }
    }

    const { data: existing } = await supabase
      .from(regTable)
      .select("id")
      .eq("user_id", authUser.id)
      .in("event_id", input.eventIds)
      .limit(1);

    if (existing && existing.length > 0) throw new Error("You have already registered for one or more of these events.");

    const regCode = makeId("TT");
    const screenshotPath = (input.paymentScreenshotPath ?? input.paymentScreenshotUrl)?.trim();
    
    if (participantType === "external") {
      if (!input.utrNumber?.trim()) throw new Error("UTR number is required for external participants.");
      if (!screenshotPath) throw new Error("Payment screenshot is required for external participants.");
    }

    const results: Registration[] = [];

    for (const eventId of input.eventIds) {
      const event = getEvent(eventId);
      if (!event) throw new Error("Event not found.");
      if (!event.registrationOpen) throw new Error("Registration for this event is closed.");

      const isIndividual = isIndividualEvent(event);
      const captainName = input.captainName.trim() || input.members[0]?.name.trim() || "";
      if (!captainName) throw new Error("Captain name is required.");

      const teamName = isIndividual ? (input.teamName.trim() || captainName) : input.teamName.trim();
      if (!teamName) throw new Error("Team name is required.");

      const regId = makeId("R");
      
      const regPayload: RegistrationInsertRow = {
        id: regId,
        registration_code: regCode,
        user_id: authUser.id,
        event_id: event.id,
        team_name: teamName,
        captain_name: captainName,
        payment_status: participantType === "internal" ? "confirmed" : "pending",
        terms_accepted: true,
        members: input.members.map((m) => ({
          name: m.name.trim(),
          role: m.role,
          position: m.position,
          participantType: m.participantType,
          email: m.email.trim(),
          regNumber: m.regNumber?.trim() || undefined,
          phone: m.phone?.trim() || undefined,
        })),
      };

      if (participantType === "external") {
        regPayload.utr_number = input.utrNumber!.trim();
        regPayload.payment_screenshot_path = screenshotPath!;
        regPayload.payment_screenshot_url = screenshotPath!;
      }

      const { data, error } = await supabase.from(regTable).insert(regPayload).select().single();
      if (error) {
        throw new Error(error.message || "Failed to create registration for event " + event.name);
      }
      results.push(mapRegistrationRow(data));
    }

    return results;
  },'''

api_code = pattern.sub(new_method, api_code, count=1)
with open('src/lib/api.ts', 'w') as f:
    f.write(api_code)

# Fix RegisterPage.tsx
with open('src/pages/RegisterPage.tsx', 'r') as f:
    rp_code = f.read()

rp_code = rp_code.replace('registrationCode={encodeURIComponent(registration.registrationCode)}', 'registrationCode={encodeURIComponent(registration[0].registrationCode)}')
rp_code = rp_code.replace('encodeURIComponent(registration.registrationCode)', 'encodeURIComponent(registration[0].registrationCode)')
rp_code = rp_code.replace('const maxRequiredPlayers =', '// const maxRequiredPlayers =')
rp_code = rp_code.replace('const maxSubsAllowed =', '// const maxSubsAllowed =')
rp_code = rp_code.replace('selectedId:', 'selectedIds:')
rp_code = rp_code.replace('selectedId &&', 'selectedIds.length > 0 &&')
rp_code = rp_code.replace('=== selectedId', '=== selectedIds[0]')
rp_code = rp_code.replace('selectedId={draft.eventIds[0]}', 'selectedIds={draft.eventIds}')

with open('src/pages/RegisterPage.tsx', 'w') as f:
    f.write(rp_code)

# Fix test file
with open('src/registration_validation.test.ts', 'r') as f:
    test_code = f.read()
test_code = test_code.replace('eventId:', 'eventIds: [')
test_code = test_code.replace(',\n      teamName:', '],\n      teamName:')
with open('src/registration_validation.test.ts', 'w') as f:
    f.write(test_code)
