/**
 * useEvents.ts
 * ------------
 * React hooks that read event data from Supabase through a single shared
 * store, so many components on one screen cost one fetch instead of one each.
 *
 * Flow:
 *   Any component calls useAllEvents() / useEvent()
 *     → shared store serves its cached days if they are younger than the TTL
 *     → otherwise one in-flight fetch is shared by every waiting caller
 *     → all subscribers re-render from the same array
 *
 * The previous version kept its own useState + useEffect per caller and called
 * getDaysAsync() on every mount. useAllEvents() is used twice on RegisterPage
 * and twice on a couple of admin pages, so a single page load issued the same
 * pair of queries several times over - 25 call sites across 16 files. That is
 * redundant egress and redundant Postgres statements on the busiest screens.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getDaysAsync } from "./eventStore";
import type { Day, TechEvent } from "./eventStore";

export type { Day };

// Events change a handful of times per day (an admin edits a venue, a
// coordinator). A short TTL keeps the picker honest without refetching on
// every navigation, and an explicit reload() still bypasses it.
const EVENT_LIST_TTL_MS = 60_000;

interface EventsState {
  days: Day[];
  loading: boolean;
  error: string | null;
}

let state: EventsState = { days: [], loading: true, error: null };
let inFlight: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): EventsState {
  return state;
}

/**
 * Populate the shared store. Callers that arrive while a fetch is already
 * running join that fetch instead of starting their own.
 */
function ensureLoaded(force = false): void {
  const isFresh = state.days.length > 0 && Date.now() - loadedAt < EVENT_LIST_TTL_MS;
  if (!force && isFresh) return;
  if (inFlight) return;

  state = { ...state, loading: true, error: null };
  emit();

  inFlight = getDaysAsync()
    .then((days) => {
      state = { days, loading: false, error: null };
      loadedAt = Date.now();
    })
    .catch((err: unknown) => {
      state = {
        days: state.days,
        loading: false,
        error: err instanceof Error && err.message ? err.message : "Failed to load events.",
      };
    })
    .finally(() => {
      inFlight = null;
      emit();
    });
}

// ─── useEvents ──────────────────────────────────────────────────────────────

interface UseEventsResult {
  days: Day[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * All days (with their events) from Supabase, shared across every component
 * that asks for them.
 */
export function useEvents(): UseEventsResult {
  const { days, loading, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const reload = useCallback(() => {
    ensureLoaded(true);
  }, []);

  useEffect(() => {
    ensureLoaded();
  }, []);

  return { days, loading, error, reload };
}

// ─── useAllEvents ────────────────────────────────────────────────────────────

interface UseAllEventsResult {
  days: Day[];
  events: TechEvent[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * All days (with their events) + a flat list of all events.
 * Use in admin pages and RegisterPage's event picker.
 */
export function useAllEvents(): UseAllEventsResult {
  const { days, loading, error, reload } = useEvents();
  const events = days.flatMap((d) => d.events);
  return { days, events, loading, error, reload };
}

// ─── useEvent ────────────────────────────────────────────────────────────────

interface UseEventResult {
  event: TechEvent | undefined;
  day: Day | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Looks up a single event by ID.
 * Use in EventDetailPage, RegisterSuccessPage, ProfilePage, etc.
 */
export function useEvent(eventId: string | undefined): UseEventResult {
  const { days, loading, error } = useEvents();

  const event = eventId ? days.flatMap((d) => d.events).find((e) => e.id === eventId) : undefined;
  const day = event ? days.find((d) => d.id === event.dayId) : undefined;

  return { event, day, loading, error };
}