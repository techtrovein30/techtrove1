/**
 * useEvents.ts
 * ------------
 * React hooks that load event data exclusively from Supabase and subscribe
 * to real-time changes so that admin edits are instantly reflected everywhere.
 *
 * Flow:
 *   Admin saves event → Supabase events table updated
 *     → Realtime channel fires
 *       → getDaysAsync() re-fetches
 *         → React state updates
 *           → Every open tab shows new data immediately (no refresh needed)
 */

import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { getDaysAsync } from "./eventStore";
import type { Day, TechEvent } from "./eventStore";

export type { Day };

// ─── useEvents ──────────────────────────────────────────────────────────────

interface UseEventsResult {
  days: Day[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetches all days (with events) from Supabase and keeps them live via
 * Supabase Realtime.  Any INSERT / UPDATE / DELETE on the `events` table
 * will automatically re-fetch and update the returned `days` array.
 */
export function useEvents(): UseEventsResult {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // manual reload trigger

  // ── initial fetch + re-fetch on manual reload ─────────────────────────
  useEffect(() => {
    let cancelled = false;

    getDaysAsync()
      .then((d) => {
        if (!cancelled) {
          setDays(d);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load events.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  // ── Supabase Realtime subscription ────────────────────────────────────
  // Listens for any change on the `events` table and re-fetches the full
  // day+event tree.  This makes admin edits appear instantly everywhere.
  useEffect(() => {
    // Use a unique channel name per subscription so re-mounts (React StrictMode
    // double-invokes effects in dev) never collide on the same channel, which
    // otherwise throws "cannot add postgres_changes callbacks after subscribe()".
    const rand = new Uint32Array(4);
    crypto.getRandomValues(rand);
    const channel = supabase
      .channel(`events-realtime-${Array.from(rand, (n) => n.toString(36)).join("")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          // Re-fetch from Supabase when any event row changes
          getDaysAsync()
            .then(setDays)
            .catch(() => {}); // silently ignore — we still have cached data
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // only once per mount

  return { days, loading, error, reload: () => { setLoading(true); setError(null); setTick((t) => t + 1); } };
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
 * All days (with their events) + a flat list of all events, kept live via
 * Realtime.  Use in admin pages and RegisterPage's event picker.
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
 * Looks up a single event by ID, kept live via Realtime.
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
