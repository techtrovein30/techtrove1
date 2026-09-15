/**
 * supabase.ts
 * -----------
 * Singleton Supabase client for TechTrove 3.0.
 * Import `supabase` from this module everywhere you need to
 * interact with the Supabase backend.
 *
 * Keys are read from Vite env variables (.env file) and are
 * never bundled into version control (.env is in .gitignore).
 */

import { createClient } from "@supabase/supabase-js";
import { secureStorage } from "./secureStorage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your .env file."
  );
}

/** The Supabase project origin (trailing slashes stripped), used as a trust
 *  boundary for validating stored/legacy storage URLs. */
export const SUPABASE_URL = (supabaseUrl ?? "").replace(/\/+$/, "");

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // R6 (M14): keep the JWT out of localStorage — memory-only storage so a
    // stolen/copied cookie can never be replayed. Sessions end on page refresh
    // (same behaviour as persistSession: false).
    storage: secureStorage,
  },
});
