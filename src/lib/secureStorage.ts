/**
 * secureStorage.ts
 * ----------------
 * R6 (M14): a hardened Supabase auth storage adapter.
 *
 * The Supabase JS client normally persists the access JWT in localStorage,
 * where any XSS can read it. This adapter:
 *   1. Keeps the token in an in-memory cache for the lifetime of the tab.
 *   2. Persists to sessionStorage (NOT localStorage), so the token never
 *      survives on disk after the tab/window is closed.
 *   3. Namespaces keys and tolerates storage being unavailable (private
 *      browsing, disabled cookies/storage) by falling back to memory only.
 *
 * The CSP header (see vite.config.ts) is the complementary defense; together
 * they meaningfully shrink the XSS token-theft surface on a client-only app.
 */

import type { SupportedStorage } from "@supabase/supabase-js";

const KEY_PREFIX = "techtrove3:";

const memoryCache = new Map<string, string>();

/** Safe sessionStorage access — throws rarely (disabled/private modes). */
function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the in-memory cache still keeps the session.
  }
}

function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore — memory cache is cleared regardless.
  }
}

export const secureStorage: SupportedStorage = {
  getItem(key: string): string | null {
    const namespaced = KEY_PREFIX + key;
    if (memoryCache.has(namespaced)) {
      return memoryCache.get(namespaced) ?? null;
    }
    const fromSession = readSession(namespaced);
    if (fromSession !== null) {
      memoryCache.set(namespaced, fromSession);
    }
    return fromSession;
  },

  setItem(key: string, value: string): void {
    const namespaced = KEY_PREFIX + key;
    memoryCache.set(namespaced, value);
    writeSession(namespaced, value);
  },

  removeItem(key: string): void {
    const namespaced = KEY_PREFIX + key;
    memoryCache.delete(namespaced);
    removeSession(namespaced);
  },
};