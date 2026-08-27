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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your .env file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
