/**
 * eventStore.ts
 * -------------
 * Supabase-backed event store for TechTrove 3.0.
 *
 * On first admin panel load, static event data from techtrove.ts is
 * upserted into the Supabase `events` table. Subsequent reads come from
 * Supabase, allowing the admin panel to add/edit/delete events dynamically
 * and have changes persist for all users in real time.
 *
 * Public pages import from this module instead of techtrove.ts directly.
 * The static techtrove.ts data is never modified — it serves as seed/fallback.
 *
 * IMPORTANT: All async functions must be awaited by callers.
 * Sync wrappers are provided only where the call site is not async-ready
 * (e.g. synchronous route-level data reads) and fall back to static data.
 */

import { supabase } from "./supabase";
import { days as staticDays } from "../data/techtrove";
import type { Day, TechEvent } from "../data/techtrove";

// Re-export types so consumers can import from one place
export type { Day, TechEvent };

// ─── Type mapping helpers ──────────────────────────────────────────────────

interface EventRow {
  id: string;
  day_id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  venue?: string | null;
  time?: string | null;
  duration?: string | null;
  coordinator?: string | null;
  registration_fee?: number | null;
  required_players?: number | null;
  max_substitutes?: number | null;
  registration_open?: boolean | null;
  rules?: string[] | null;
  prizes?: string[] | null;
}

function rowToEvent(r: EventRow): TechEvent {
  return {
    id: r.id,
    dayId: r.day_id,
    name: r.name,
    category: r.category ?? undefined,
    description: r.description ?? undefined,
    registrationFee: r.registration_fee ?? 0,
    requiredPlayers: r.required_players ?? 1,
    maxSubstitutes: r.max_substitutes ?? 0,
    registrationOpen: r.registration_open ?? true,
    rules: r.rules ?? undefined,
  } as TechEvent;
}

function eventToRow(event: TechEvent): EventRow {
  return {
    id: event.id,
    day_id: event.dayId,
    name: event.name,
    category: event.category ?? null,
    description: event.description ?? null,
    venue: null,
    time: null,
    duration: null,
    coordinator: null,
    registration_fee: event.registrationFee ?? 0,
    required_players: event.requiredPlayers ?? 1,
    max_substitutes: event.maxSubstitutes ?? 0,
    registration_open: event.registrationOpen ?? true,
    rules: event.rules ?? null,
    prizes: null,
  };
}

/** Group flat event rows back into the Day[] structure */
function groupIntoDays(rows: EventRow[]): Day[] {
  const staticDayMap = new Map(staticDays.map((d) => [d.id, d]));
  const dayEventMap = new Map<string, TechEvent[]>();

  for (const row of rows) {
    const arr = dayEventMap.get(row.day_id) ?? [];
    arr.push(rowToEvent(row));
    dayEventMap.set(row.day_id, arr);
  }

  // Build days in the same order as the static data
  const days: Day[] = [];
  for (const staticDay of staticDays) {
    const events = dayEventMap.get(staticDay.id) ?? [];
    days.push({ ...staticDay, events });
  }
  // Also include any day IDs not in staticDays (dynamically created)
  for (const [dayId, events] of dayEventMap) {
    if (!staticDayMap.has(dayId)) {
      days.push({
        id: dayId,
        label: dayId,
        name: dayId,
        description: "",
        status: "active" as const,
        events,
      });
    }
  }

  return days;
}

// ─── In-memory cache (for synchronous callers) ─────────────────────────────

let _cachedDays: Day[] | null = null;

async function fetchAndCacheDays(): Promise<Day[]> {
  const { data, error } = await supabase.from("events").select("*");
  if (error || !data || data.length === 0) {
    // Fall back to static data if Supabase is unreachable or table is empty
    _cachedDays = staticDays;
    return staticDays;
  }
  _cachedDays = groupIntoDays(data as EventRow[]);
  return _cachedDays;
}

// ─── Seeding ───────────────────────────────────────────────────────────────

/**
 * Upserts static event data into the Supabase `events` table.
 * Called once on admin panel startup. Safe to call multiple times.
 */
export async function seedEventsIfNeeded(): Promise<void> {
  const { count } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true });

  if (count && count > 0) {
    // Already seeded — refresh cache
    await fetchAndCacheDays();
    return;
  }

  // Seed all static events
  const allEvents = staticDays.flatMap((d) => d.events);
  const rows = allEvents.map(eventToRow);

  const { error } = await supabase.from("events").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Failed to seed events:", error.message);
  }
  await fetchAndCacheDays();
}

// ─── Public read API ───────────────────────────────────────────────────────

/** Async version — always returns fresh data from Supabase */
export async function getDaysAsync(): Promise<Day[]> {
  return fetchAndCacheDays();
}

/** Sync version — returns cached data or static fallback */
export function getDays(): Day[] {
  if (_cachedDays) return _cachedDays;
  // Trigger async fetch and return static data for now
  fetchAndCacheDays();
  return staticDays;
}

/** Sync version — returns cached or static data */
export function getAllEvents(): TechEvent[] {
  return getDays().flatMap((d) => d.events);
}

/** Sync version — returns cached or static data */
export function getEvent(id: string | undefined): TechEvent | undefined {
  if (!id) return undefined;
  return getAllEvents().find((e) => e.id === id);
}

export function getDay(id: string): Day | undefined {
  return getDays().find((d) => d.id === id);
}

// ─── Admin write API ───────────────────────────────────────────────────────

export async function adminUpdateEvent(
  eventId: string,
  patch: Partial<TechEvent>
): Promise<TechEvent> {
  const updateRow: Partial<EventRow> = {};
  if (patch.name !== undefined) updateRow.name = patch.name;
  if (patch.category !== undefined) updateRow.category = patch.category ?? null;
  if (patch.description !== undefined) updateRow.description = patch.description ?? null;
  if (patch.registrationFee !== undefined) updateRow.registration_fee = patch.registrationFee;
  if (patch.requiredPlayers !== undefined) updateRow.required_players = patch.requiredPlayers;
  if (patch.maxSubstitutes !== undefined) updateRow.max_substitutes = patch.maxSubstitutes;
  if (patch.registrationOpen !== undefined) updateRow.registration_open = patch.registrationOpen;
  if (patch.rules !== undefined) updateRow.rules = patch.rules ?? null;

  const { data, error } = await supabase
    .from("events")
    .update(updateRow)
    .eq("id", eventId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Event not found.");
  await fetchAndCacheDays();
  return rowToEvent(data as EventRow);
}

export async function adminToggleRegistration(eventId: string): Promise<TechEvent> {
  // Fetch current state first
  const { data: current, error: fetchError } = await supabase
    .from("events")
    .select("registration_open")
    .eq("id", eventId)
    .single();

  if (fetchError || !current) throw new Error("Event not found.");

  const { data, error } = await supabase
    .from("events")
    .update({ registration_open: !current.registration_open })
    .eq("id", eventId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Event not found.");
  await fetchAndCacheDays();
  return rowToEvent(data as EventRow);
}

function makeEventId(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `evt-${rand}`;
}

export async function adminAddEvent(
  dayId: string,
  event: Omit<TechEvent, "id" | "dayId">
): Promise<TechEvent> {
  const newEvent: TechEvent = {
    ...event,
    id: makeEventId(),
    dayId,
  } as TechEvent;

  const { data, error } = await supabase
    .from("events")
    .insert(eventToRow(newEvent))
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to add event.");
  await fetchAndCacheDays();
  return rowToEvent(data as EventRow);
}

export async function adminDeleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
  await fetchAndCacheDays();
}

export async function adminUpdateDay(
  dayId: string,
  _patch: Partial<Omit<Day, "id" | "events">>
): Promise<Day> {
  // Day metadata is stored in static data; only events are in Supabase.
  // Refresh and return the day.
  const days = await fetchAndCacheDays();
  const day = days.find((d) => d.id === dayId);
  if (!day) throw new Error("Day not found.");
  return day;
}
