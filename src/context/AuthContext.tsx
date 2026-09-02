/**
 * AuthContext.tsx
 * ---------------
 * Provides authentication state and actions to the entire app.
 *
 * Uses Supabase Auth's onAuthStateChange so that session state (including
 * page-reload restoration) is handled automatically by the Supabase client.
 *
 * Participant authentication uses Google OAuth only. A participant who has
 * not yet completed their profile is offered the Google profile completion
 * flow, which creates them in exactly one split participant table based on
 * their explicit internal/external selection.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import type { User, ParticipantType } from "../lib/api";
import { getParticipantById } from "../lib/db";
import type { ParticipantRow } from "../lib/db";
import { validateRegisterNumber, validateEmail, validatePhoneNumber } from "../lib/validation";

interface GooglePendingProfile {
  authUserId: string;
  email: string;
  fullName: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Pending Google OAuth user that needs profile completion */
  googlePendingProfile: GooglePendingProfile | null;
  signInWithGoogle: () => Promise<void>;
  /** Complete profile for a Google OAuth user who signed in for the first time */
  completeGoogleProfile: (input: {
    participantType: ParticipantType;
    fullName: string;
    regNumber?: string;
    college?: string;
    phone?: string;
  }) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Build the app User from a participant row (either split table). */
function rowToAuthUser(p: ParticipantRow): User {
  return {
    id: p.id,
    username: p.username,
    fullName: p.full_name,
    email: p.email,
    participantType: p.participant_type,
    regNumber: p.reg_number ?? undefined,
    college: p.college ?? undefined,
    phone: p.phone ?? undefined,
    role: p.role ?? "user",
  };
}

/** Resolve a signed-in auth user to an app User, or null if profile missing. */
async function resolveSessionParticipant(authUserId: string): Promise<User | null> {
  const profile = await getParticipantById(authUserId);
  return profile ? rowToAuthUser(profile) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googlePendingProfile, setGooglePendingProfile] = useState<GooglePendingProfile | null>(null);

  useEffect(() => {
    // Restore session on initial mount
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          const resolved = await resolveSessionParticipant(session.user.id);

          if (resolved) {
            setUser(resolved);
          } else {
            // Google OAuth user without a participant row yet
            const meta = session.user.user_metadata ?? {};
            setGooglePendingProfile({
              authUserId: session.user.id,
              email: session.user.email ?? meta.email ?? "",
              fullName: meta.full_name ?? meta.name ?? session.user.email?.split("@")[0] ?? "",
            });
          }
        }
      })
      .catch((err) => {
        // M12: never leave the app stuck in the loading state
        console.error("AuthContext: session restore failed:", err);
      })
      .finally(() => setLoading(false));

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const resolved = await resolveSessionParticipant(session.user.id);

          if (resolved) {
            setUser(resolved);
            setGooglePendingProfile(null);
          } else {
            // Google OAuth user without a participant row yet
            const meta = session.user.user_metadata ?? {};
            setGooglePendingProfile({
              authUserId: session.user.id,
              email: session.user.email ?? meta.email ?? "",
              fullName: meta.full_name ?? meta.name ?? session.user.email?.split("@")[0] ?? "",
            });
          }
        } else {
          setUser(null);
          setGooglePendingProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      googlePendingProfile,
      async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin + "/login",
          },
        });
        if (error) throw error;
      },
      async completeGoogleProfile(input) {
        if (!googlePendingProfile) throw new Error("No pending Google profile to complete.");

        // M10: enforce the participant type at runtime so we never write a
        // profile to the wrong split table.
        const participantType = input.participantType;
        if (participantType !== "internal" && participantType !== "external") {
          throw new Error("Invalid participant type.");
        }

        const { authUserId, email } = googlePendingProfile;
        const fullName = input.fullName.trim();
        if (!fullName) throw new Error("Full name is required.");

        if (participantType === "internal") {
          const regErr = validateRegisterNumber(input.regNumber, "internal");
          if (regErr) throw new Error(regErr);

          const emailErr = validateEmail(email, "internal");
          if (emailErr) throw new Error(emailErr);

          const phoneErr = validatePhoneNumber(input.phone, false);
          if (phoneErr) throw new Error(phoneErr);
        } else {
          const emailErr = validateEmail(email, "external");
          if (emailErr) throw new Error(emailErr);

          const phoneErr = validatePhoneNumber(input.phone, true);
          if (phoneErr) throw new Error(phoneErr);
        }

        const usernameBase = fullName
          .toLowerCase()
          .split(/\s+/)
          .map((p) => p.replace(/[^a-z0-9]/g, ""))
          .filter(Boolean)
          .join(".") || "member";

        // Check username uniqueness across both participant tables
        let username = usernameBase;
        let attempt = 1;
        while (attempt < 50) {
          const checks = await Promise.all([
            supabase.from("internal_participants").select("id").eq("username", username).maybeSingle(),
            supabase.from("external_participants").select("id").eq("username", username).maybeSingle(),
          ]);
          const taken = checks.some((r) => r.data !== null);
          if (!taken) break;
          attempt++;
          username = `${usernameBase}${attempt}`;
        }

        // A participant belongs to exactly ONE split participant table based
        // on their explicit internal/external selection (never inferred from email).
        const table =
          participantType === "internal" ? "internal_participants" : "external_participants";

        const row = {
          id: authUserId,
          username,
          full_name: fullName,
          email,
          participant_type: participantType,
          reg_number: input.regNumber?.trim().toUpperCase() || null,
          college: input.college?.trim() || null,
          phone: input.phone?.trim() || null,
          role: "user" as const,
        };

        const { error } = await supabase.from(table).upsert(row, { onConflict: "id" });
        if (error) {
          console.error("completeGoogleProfile upsert failed:", error);
          throw new Error("Could not create your participant profile. Please try again.");
        }

        const newUser: User = {
          id: authUserId,
          username,
          fullName,
          email,
          participantType,
          regNumber: input.regNumber?.trim().toUpperCase() || undefined,
          college: input.college?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          role: "user",
        };

        setUser(newUser);
        setGooglePendingProfile(null);
        return newUser;
      },
      async signOut() {
        // M11: wait for the server-side sign-out before clearing local state
        // so we never show a phantom logged-out state.
        try {
          await api.signOut();
        } finally {
          setUser(null);
          setGooglePendingProfile(null);
        }
      },
    }),
    [user, loading, googlePendingProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The context and its hook are intentionally co-located — this is the standard
// React pattern. Suppress the react-refresh fast-refresh advisory for the hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
