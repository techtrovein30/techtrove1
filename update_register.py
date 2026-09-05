import sys

with open('src/pages/RegisterPage.tsx', 'r') as f:
    code = f.read()

code = code.replace('eventId: string | null;', 'eventIds: string[];')
code = code.replace('eventId: null,', 'eventIds: [],')
code = code.replace('eventId: preselectedId,', 'eventIds: [preselectedId],')

old_mem = '''function makeEmptyMembers(
  event: TechEvent | undefined,
  captainName = "",
  captainEmail = "",
  captainPhone = "",
): MemberDraft[] {
  if (!event) return [];
  const isSport = isSportEvent(event);
  const required = event.requiredPlayers ?? 1;
  const maxSubs = isSport ? (event.maxSubstitutes ?? 0) : 0;'''

new_mem = '''function makeEmptyMembers(
  required: number,
  maxSubs: number,
  captainName = "",
  captainEmail = "",
  captainPhone = "",
): MemberDraft[] {'''

code = code.replace(old_mem, new_mem)

code = code.replace('makeEmptyMembers(\n            preselectedEvent,\n            user?.fullName ?? "",\n            user?.email ?? "",\n            user?.phone ?? "",\n          )', 'makeEmptyMembers(\n            preselectedEvent?.requiredPlayers ?? 1,\n            isSportEvent(preselectedEvent) ? (preselectedEvent.maxSubstitutes ?? 0) : 0,\n            user?.fullName ?? "",\n            user?.email ?? "",\n            user?.phone ?? "",\n          )')

old_select = '''function selectEvent(ev: TechEvent) {
    const indiv = isIndividualEvent(ev);
    setDraft((d) => ({
      ...d,
      eventId: ev.id,
      members: makeEmptyMembers(
        ev,
        user?.fullName ?? "",
        user?.email ?? "",
        user?.phone ?? "",
      ),
      captainName: d.captainName || (user?.fullName ?? ""),
      teamName: indiv ? (user?.fullName ?? ev.name) : d.teamName,
    }));
    setSelectedDayId(ev.dayId);
    setErrors({});
  }'''

new_select = '''function selectEvent(ev: TechEvent) {
    const isMultiSelect = ev.dayId === "day-2" || ev.dayId === "day-3";
    let newEventIds = [...draft.eventIds];
    
    if (isMultiSelect) {
      if (newEventIds.includes(ev.id)) {
        newEventIds = newEventIds.filter(id => id !== ev.id);
      } else {
        if (newEventIds.length > 0 && !isMultiSelect) newEventIds = [];
        newEventIds.push(ev.id);
      }
    } else {
      newEventIds = [ev.id];
    }
    
    const sEvs = allEvents.filter(e => newEventIds.includes(e.id));
    const maxReq = sEvs.length > 0 ? Math.max(...sEvs.map(e => e.requiredPlayers ?? 1)) : 1;
    const mSubs = sEvs.length > 0 ? Math.max(...sEvs.map(e => isSportEvent(e) ? (e.maxSubstitutes ?? 0) : 0)) : 0;
    
    setDraft((d) => ({
      ...d,
      eventIds: newEventIds,
      members: makeEmptyMembers(
        maxReq,
        mSubs,
        user?.fullName ?? "",
        user?.email ?? "",
        user?.phone ?? ""
      ),
      captainName: d.captainName || (user?.fullName ?? ""),
      teamName: isIndividualEvent(ev) ? (user?.fullName ?? ev.name) : d.teamName,
    }));
    setSelectedDayId(ev.dayId);
    setErrors({});
  }'''

code = code.replace(old_select, new_select)

code = code.replace('setDraft((d) => (d.eventId ? { ...d, eventIds: [], members: [] } : d));', 'setDraft((d) => (d.eventIds.length > 0 ? { ...d, eventIds: [], members: [] } : d));')
code = code.replace('if (step === "sport" && !draft.eventIds[0])', 'if (step === "sport" && draft.eventIds.length === 0)')
code = code.replace('eventId: event.id,', 'eventIds: draft.eventIds,')
code = code.replace('selectedId={draft.eventIds[0]}', 'selectedIds={draft.eventIds}')
code = code.replace('selectedId: string | null;', 'selectedIds: string[];')
code = code.replace('const active = ev.id === selectedId;', 'const active = selectedIds.includes(ev.id);')
code = code.replace('const chosenDayId =\n    (selectedId && events.find((e) => e.id === selectedId)?.dayId) || selectedDayId;', 'const chosenDayId = (selectedIds.length > 0 && events.find((e) => e.id === selectedIds[0])?.dayId) || selectedDayId;')

with open('src/pages/RegisterPage.tsx', 'w') as f:
    f.write(code)
