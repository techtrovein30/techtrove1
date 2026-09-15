/**
 * secureStorage.ts
 * ----------------
 * A hardened Supabase auth storage adapter.
 *
 * The Supabase JS client normally persists the access JWT in localStorage,
 * where it survives browser restarts and can be copied out by anyone with
 * access to DevTools — the exact "session cookie" theft vector that cost us.
 *
 * This adapter keeps the JWT ONLY in an in-memory cache:
 *   1. The token lives in the JS heap of the open tab and nowhere else.
 *   2. Nothing is written to localStorage or sessionStorage, so a stolen
 *      browser profile / DevTools dump / synced storage yields NO session.
 *   3. On first load it MIGRATES any legacy stored copy into memory and then
 *      permanently erases every durable copy, so no lingering tokens remain
 *      on disk.
 *
 * Trade-off: a page refresh ends the session (the user signs in again). That
 * is the price of not leaving a replayable cookie behind, and it is the same
 * behaviour as `persistSession: false`.
 */

import type { SupportedStorage } from "@supabase/supabase-js";

const KEY_PREFIX = "techtrove3:";
const memoryCache = new Map<string, string>();

/** Erase every durable copy under our namespace (local + session storage). */
function purgeDurableKeys(): void {
  for (const store of [localStorage, sessionStorage] as const) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(KEY_PREFIX)) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    } catch {
      // Storage unavailable — ignore.
    }
  }
}

/**
 * One-time migration: if a previous build persisted a key's value (localStorage
 * or sessionStorage), load it into memory, then wipe all durable copies. After
 * the first successful read the durable token is gone for good.
 */
function migrateAndPurge(key: string): string | null {
  const namespaced = KEY_PREFIX + key;
  let value: string | null = null;

  for (const store of [localStorage, sessionStorage] as const) {
    try {
      const existing = store.getItem(namespaced);
      if (existing !== null && existing !== value) value = existing;
    } catch {
      // Storage unavailable — ignore.
    }
  }

  if (value !== null) memoryCache.set(namespaced, value);
  purgeDurableKeys();
  return value;
}

export const secureStorage: SupportedStorage = {
  getItem(key: string): string | null {
    const namespaced = KEY_PREFIX + key;

    const cached = memoryCache.get(namespaced);
    if (cached !== undefined) return cached;

    // Legacy durable copy → load into memory once, then erase on disk.
    return migrateAndPurge(key);
  },

  setItem(key: string, value: string): void {
    // Memory only. If storage silently re-created a durable key (e.g. by a
    // dependency), wipe it so the token can never linger on disk.
    purgeDurableKeys();
    memoryCache.set(KEY_PREFIX + key, value);
  },

  removeItem(key: string): void {
    const namespaced = KEY_PREFIX + key;
    memoryCache.delete(namespaced);
    purgeDurableKeys();
  },
};