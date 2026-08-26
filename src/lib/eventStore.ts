/**
 * eventStore.ts
 * -------------
 * localStorage-backed event store for TechTrove 3.0.
 *
 * On first access, seeds data from the static techtrove.ts file so all
 * existing event data is preserved. Subsequent reads come from localStorage,
 * allowing the admin panel to add/edit/delete events dynamically.
 *
 * Public pages import from this module instead of techtrove.ts directly.
 * The static techtrove.ts data is never modified — it serves as fallback.
 *
 * FUTURE MIGRATION: Replace storageGet/storageSet calls with fetch() calls
 * to a backend API. The module's exported function signatures stay the same,
 * so no admin page component needs to change.
 */

import { storageGet, storageSet } from "./storage";
import { days as staticDays } from "../data/techtrove";
import type { Day, TechEvent } from "../data/techtrove";

// Re-export types so consumers can import from one place
export type { Day, TechEvent };

const EVENTS_KEY = "tt.events";
const SEEDED_KEY = "tt.events.seeded";

// ─── Internal helpers ──────────────────────────────────────────────────────

function loadDays(): Day[] {
  try {
    const stored = storageGet<Day[] | null>(EVENTS_KEY, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
  } catch {
    /* fall through to static data */
  }
  return staticDays;
}

function saveDays(days: Day[]): void {
  storageSet(EVENTS_KEY, days);
}

// ─── Seeding ───────────────────────────────────────────────────────────────

/**
 * Call once on admin panel startup to migrate static event data into
 * localStorage. Safe to call multiple times — only seeds once.
 */
export function seedEventsIfNeeded(): void {
  const seeded = storageGet<boolean>(SEEDED_KEY, false);
  if (seeded) return;
  saveDays(staticDays);
  storageSet(SEEDED_KEY, true);
}

// ─── Public read API (used by public pages) ────────────────────────────────

export function getDays(): Day[] {
  return loadDays();
}

export function getAllEvents(): TechEvent[] {
  return loadDays().flatMap((d) => d.events);
}

export function getEvent(id: string | undefined): TechEvent | undefined {
  if (!id) return undefined;
  return getAllEvents().find((e) => e.id === id);
}

export function getDay(id: string): Day | undefined {
  return loadDays().find((d) => d.id === id);
}

// ─── Admin write API ───────────────────────────────────────────────────────

export function adminUpdateEvent(
  eventId: string,
  patch: Partial<TechEvent>
): TechEvent {
  const days = loadDays();
  let found: TechEvent | null = null;

  const updated = days.map((d) => ({
    ...d,
    events: d.events.map((e) => {
      if (e.id !== eventId) return e;
      found = { ...e, ...patch, id: e.id, dayId: e.dayId };
      return found;
    }),
  }));

  if (!found) throw new Error("Event not found.");
  saveDays(updated);
  return found;
}

export function adminToggleRegistration(eventId: string): TechEvent {
  const days = loadDays();
  let found: TechEvent | null = null;

  const updated = days.map((d) => ({
    ...d,
    events: d.events.map((e) => {
      if (e.id !== eventId) return e;
      found = { ...e, registrationOpen: !e.registrationOpen };
      return found;
    }),
  }));

  if (!found) throw new Error("Event not found.");
  saveDays(updated);
  return found;
}

function makeEventId(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `evt-${rand}`;
}

export function adminAddEvent(dayId: string, event: Omit<TechEvent, "id" | "dayId">): TechEvent {
  const days = loadDays();
  const dayIdx = days.findIndex((d) => d.id === dayId);
  if (dayIdx === -1) throw new Error("Day not found.");

  const newEvent: TechEvent = {
    ...event,
    id: makeEventId(),
    dayId,
  };

  days[dayIdx] = { ...days[dayIdx], events: [...days[dayIdx].events, newEvent] };
  saveDays(days);
  return newEvent;
}

export function adminDeleteEvent(eventId: string): void {
  const days = loadDays();
  const updated = days.map((d) => ({
    ...d,
    events: d.events.filter((e) => e.id !== eventId),
  }));
  saveDays(updated);
}

export function adminUpdateDay(dayId: string, patch: Partial<Omit<Day, "id" | "events">>): Day {
  const days = loadDays();
  const idx = days.findIndex((d) => d.id === dayId);
  if (idx === -1) throw new Error("Day not found.");
  days[idx] = { ...days[idx], ...patch, id: dayId, events: days[idx].events };
  saveDays(days);
  return days[idx];
}
