/**
 * useEvents.ts
 * ------------
 * React hooks that load event data exclusively from Supabase.
 *
 * All public pages and admin pages should use these hooks instead of
 * the synchronous getDays() / getAllEvents() / getEvent() calls so
 * that the displayed data always reflects what is in the database.
 */

import { useState, useEffect } from "react";
import { getDaysAsync } from "./eventStore";
import type { Day, TechEvent } from "./eventStore";

export type { Day }; 

// ─── useEvents ─────────────────────────────────────────────────────────────

interface UseEventsResult {
  days: Day[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetches all days (with their events) from Supabase.
 * Use on EventsPage, HomePage, etc.
 */
export function useEvents(): UseEventsResult {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDaysAsync()
      .then((d) => {
        if (!cancelled) {
          setDays(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load events.");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [tick]);

  return { days, loading, error, reload: () => setTick((t) => t + 1) };
}

// ─── useAllEvents ───────────────────────────────────────────────────────────

interface UseAllEventsResult {
  days: Day[];
  events: TechEvent[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * All days (with their events) plus a flat list of all events.
 * Use in admin pages and RegisterPage's event picker.
 */
export function useAllEvents(): UseAllEventsResult {
  const { days, loading, error, reload } = useEvents();
  const events = days.flatMap((d) => d.events);
  return { days, events, loading, error, reload };
}

// ─── useEvent ───────────────────────────────────────────────────────────────

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

  const event = eventId
    ? days.flatMap((d) => d.events).find((e) => e.id === eventId)
    : undefined;

  const day = event ? days.find((d) => d.id === event.dayId) : undefined;

  return { event, day, loading, error };
}
