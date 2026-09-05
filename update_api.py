import sys
import re

# Fix RegisterPage.tsx
with open('src/pages/RegisterPage.tsx', 'r') as f:
    code = f.read()

code = code.replace('selectedId: string | null;', 'selectedIds: string[];')
code = code.replace('selectedId,\\n  selectedDayId,', 'selectedIds,\\n  selectedDayId,')
code = code.replace('const active = ev.id === selectedId;', 'const active = selectedIds.includes(ev.id);')
code = code.replace('selectedId={draft.eventIds[0]}', 'selectedIds={draft.eventIds}')
code = code.replace('selectedId: string | null;', 'selectedIds: string[];')
code = code.replace('selectedId,\\n  selectedDayId,', 'selectedIds,\\n  selectedDayId,')
with open('src/pages/RegisterPage.tsx', 'w') as f:
    f.write(code)

# Fix api.ts
with open('src/lib/api.ts', 'r') as f:
    api_code = f.read()

old_sig = """  async createRegistration(input: {
    eventId: string;
    teamName: string;
    captainName: string;
    members: RegistrationMember[];
    termsAccepted: boolean;
    utrNumber?: string;
    paymentScreenshotPath?: string;
    paymentScreenshotUrl?: string;
  }): Promise<Registration> {"""

new_sig = """  async createRegistration(input: {
    eventIds: string[];
    teamName: string;
    captainName: string;
    members: RegistrationMember[];
    termsAccepted: boolean;
    utrNumber?: string;
    paymentScreenshotPath?: string;
    paymentScreenshotUrl?: string;
  }): Promise<Registration[]> {"""
api_code = api_code.replace(old_sig, new_sig)

old_body = """    if (!input.termsAccepted) throw new Error("Terms and conditions must be accepted.");

    const event = getEvent(input.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.registrationOpen) throw new Error("Registration for this event is closed.");

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("You need to sign in first.");

    // Determine which split table this registration belongs to.
    const profile = await getParticipantById(authUser.id);
    const participantType: ParticipantType = profile?.participant_type ?? "internal";
    const regTable = REGISTRATION_TABLE_FOR[participantType];

    const isSport = isSportEvent(event);
    const isIndividual = isIndividualEvent(event);
    const required = event.requiredPlayers ?? 1;
    const maxSubs = isSport ? (event.maxSubstitutes ?? 0) : 0;

    const players = input.members.filter((m) => m.role === "player");
    const substitutes = input.members.filter((m) => m.role === "substitute");

    if (!isSport && substitutes.length > 0) {
      throw new Error("Substitute players are not allowed for non-sport events.");
    }
    if (players.length !== required) {
      throw new Error(`This event requires exactly ${required} players.`);
    }
    if (substitutes.length > maxSubs) {
      throw new Error(`This event allows at most ${maxSubs} substitutes.`);
    }

    const captainName = input.captainName.trim() || input.members[0]?.name.trim() || "";
    if (!captainName) throw new Error("Captain name is required.");

    const teamName = isIndividual
      ? (input.teamName.trim() || captainName)
      : input.teamName.trim();
    if (!teamName) throw new Error("Team name is required.");

    // Fee is now securely calculated by the database trigger before insert.
    // The client no longer submits the fee to prevent tampering.

    // Validate each member has required fields
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

    // Check for duplicate registration in the matching split table
    const { data: existing } = await supabase
      .from(regTable)
      .select("id")
      .eq("user_id", authUser.id)
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) throw new Error("You have already registered for this event.");

    const members: RegistrationMember[] = input.members.map((m) => ({
      name: m.name.trim(),
      role: m.role,
      position: m.position,
      participantType: m.participantType,
      email: m.email.trim(),
      regNumber: m.regNumber?.trim() || undefined,
      phone: m.phone?.trim() || undefined,
    }));

    const regId = makeId("R");
    const regCode = makeId("TT");

    const screenshotPath = (input.paymentScreenshotPath ?? input.paymentScreenshotUrl)?.trim();

    const regPayload: RegistrationInsertRow = {
      id: regId,
      registration_code: regCode,
      user_id: authUser.id,
      event_id: event.id,
      team_name: teamName,
      captain_name: captainName,
      // Internal registrations are free and confirmed instantly.
      // External registrations start as pending until payment is verified.
      payment_status: participantType === "internal" ? "confirmed" : "pending",
      terms_accepted: true,
      members,
    };

    if (participantType === "external") {
      if (!input.utrNumber?.trim()) throw new Error("UTR number is required for external participants.");
      if (!screenshotPath) throw new Error("Payment screenshot is required for external participants.");
      regPayload.utr_number = input.utrNumber.trim();
      regPayload.payment_screenshot_path = screenshotPath;
      regPayload.payment_screenshot_url = screenshotPath;
    }

    // Attempt insert; retry once with a fresh code if we hit a unique-code collision.
    let reg: any = null;
    let insertError: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        // Regenerate both IDs on retry
        regPayload.id = makeId("R");
        regPayload.registration_code = makeId("TT");
      }
      const { data, error } = await supabase
        .from(regTable)
        .insert(regPayload)
        .select()
        .single();
      if (!error) { reg = data; insertError = null; break; }
      // 23505 = unique_violation — retry makes sense
      if (error.code !== "23505") { insertError = error; break; }
      insertError = error;
    }

    if (insertError || !reg) {
      throw new Error(insertError?.message ?? "Failed to create registration.");
    }

    return mapRegistrationRow(reg);"""

new_body = """    if (!input.termsAccepted) throw new Error("Terms and conditions must be accepted.");

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

    return results;"""

api_code = api_code.replace(old_body, new_body)

with open('src/lib/api.ts', 'w') as f:
    f.write(api_code)
