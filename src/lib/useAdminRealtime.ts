import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { SetStateAction } from "react";
import { supabase } from "./supabase";
import { adminListRegistrations, adminListUsers } from "./adminApi";
import type { Registration, User } from "./api";

/**
 * Shared store for one expensive admin read.
 *
 * Two problems it solves, both of which showed up as PostgREST egress:
 *
 *  1. Every consumer used to fetch independently, so a screen that mounted the
 *     users list AND the registrations list paid for both, and remounting a
 *     page paid again. Concurrent callers now share a single in-flight request.
 *
 *  2. Every postgres_changes event re-fetched immediately, so a burst of edits
 *     (or a scan rush writing hundreds of rows) turned into hundreds of
 *     full-table downloads. Events are now coalesced: one reload per quiet
 *     window, with a ceiling so a continuous stream still refreshes.
 */
interface SharedResource<T> {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => T;
  /** False until the first load has resolved — drives the panel's spinner. */
  isLoaded: () => boolean;
  /** Coalesced reload — the path realtime events take. */
  scheduleRefresh: () => void;
  /** Immediate reload — the path a user-initiated Refresh button takes. */
  refresh: () => Promise<T>;
  /** Local write (optimistic UI), never triggers the network. */
  patch: (next: SetStateAction<T>) => void;
  /** Drops the cached data. Call on sign-out / user change. */
  reset: () => void;
}

const EMPTY: never[] = [];

function createResource<T>(
  label: string,
  loader: () => Promise<T>,
  opts?: { debounceMs?: number; maxWaitMs?: number },
): SharedResource<T> {
  const debounceMs = opts?.debounceMs ?? 1200;
  const maxWaitMs = opts?.maxWaitMs ?? 5000;

  let snapshot: T = EMPTY as unknown as T;
  let loaded = false;
  let inFlight: Promise<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstQueuedAt = 0;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const load = (): Promise<T> => {
    // Single-flight: N callers asking at once get N references to one request.
    if (inFlight) return inFlight;
    inFlight = loader()
      .then((data) => {
        snapshot = data;
        loaded = true;
        emit();
        return data;
      })
      .catch((err) => {
        console.error(`[useAdminRealtime] ${label} failed:`, err);
        // Keep the last good data on screen rather than blanking the panel.
        if (!loaded) {
          snapshot = EMPTY as unknown as T;
          emit();
        }
        return snapshot;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const run = () => {
    timer = null;
    firstQueuedAt = 0;
    void load();
  };

  const scheduleRefresh = () => {
    const now = Date.now();
    if (!firstQueuedAt) firstQueuedAt = now;
    const wait = Math.max(0, Math.min(debounceMs, maxWaitMs - (now - firstQueuedAt)));
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, wait);
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    isLoaded: () => loaded,
    scheduleRefresh,
    refresh: load,
    patch: (next) => {
      snapshot =
        typeof next === "function"
          ? (next as (prev: T) => T)(snapshot)
          : next;
      loaded = true;
      emit();
    },
    reset: () => {
      // Cancel any in-flight reload so a late response cannot repopulate the
      // store with the previous user's data after sign-out.
      inFlight = null;
      if (timer) clearTimeout(timer);
      timer = null;
      firstQueuedAt = 0;
      snapshot = EMPTY as unknown as T;
      loaded = false;
      emit();
    },
  };
}

const registrations = createResource<Registration[]>(
  "registrations",
  adminListRegistrations,
);

const users = createResource<User[]>("users", adminListUsers);

/**
 * Drops every cached admin read.
 *
 * These stores are module-level, so they outlive the components that read them
 * and survive client-side navigation. Without this, signing out and back in
 * within the same SPA session would leave the previous admin's registrations
 * and participant list sitting in memory and briefly on screen. Wired into both
 * sign-out paths.
 */
export function invalidateAdminRealtimeCache(): void {
  registrations.reset();
  users.reset();
}

/**
 * One Realtime channel per table set, shared by every mounted consumer and torn
 * down when the last one unmounts. Without the ref count, two panels on the
 * same route meant two channels and two reload paths for identical data.
 */
function createSharedChannel(
  name: string,
  tables: string[],
  onChange: () => void,
): () => () => void {
  let refs = 0;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  return () => {
    refs += 1;
    if (!channel) {
      let built = supabase.channel(name);
      for (const table of tables) {
        built = built.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          onChange,
        );
      }
      channel = built.subscribe();
    }

    return () => {
      refs -= 1;
      if (refs <= 0 && channel) {
        supabase.removeChannel(channel);
        channel = null;
        refs = 0;
      }
    };
  };
}

const subscribeRegistrationChanges = createSharedChannel(
  "admin-registrations-sync",
  ["registrations_internal", "registrations_external"],
  registrations.scheduleRefresh,
);

const subscribeUserChanges = createSharedChannel(
  "admin-users-sync",
  ["internal_participants", "external_participants"],
  users.scheduleRefresh,
);

/** Loads `resource` once per mount and reports when the first load settles. */
function useResource<T>(resource: SharedResource<T>, subscribe: () => () => void) {
  const value = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  const [loading, setLoading] = useState(() => !resource.isLoaded());

  useEffect(() => {
    let cancelled = false;
    const settle = () => {
      if (!cancelled) setLoading(false);
    };
    void resource.refresh().then(settle, settle);
    return () => {
      cancelled = true;
    };
  }, [resource]);

  useEffect(() => subscribe(), [subscribe]);

  return { value, loading };
}

/**
 * Hook to fetch all registrations and keep them in sync with the database via Realtime.
 */
export function useAdminRegistrations() {
  const { value, loading } = useResource(registrations, subscribeRegistrationChanges);
  const setRegistrations = useCallback(
    (next: SetStateAction<Registration[]>) => registrations.patch(next),
    [],
  );
  const refresh = useCallback(() => registrations.refresh(), []);

  return { registrations: value, setRegistrations, loading, refresh };
}

/**
 * Hook to fetch all users (participants) and keep them in sync with the database via Realtime.
 */
export function useAdminUsers() {
  const { value, loading } = useResource(users, subscribeUserChanges);
  const refresh = useCallback(() => users.refresh(), []);

  return { users: value, loading, refresh };
}
