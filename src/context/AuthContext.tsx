/**
 * AuthContext.tsx
 * ---------------
 * Provides authentication state and actions to the entire app.
 *
 * Updated to use Supabase Auth's onAuthStateChange so that session
 * state (including page-reload restoration) is handled automatically
 * by the Supabase client rather than manual localStorage reads.
 *
 * Supports both email/password and Google OAuth sign-in.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/mockApi";
import type { User, ParticipantType } from "../lib/mockApi";
import { getParticipantById, PARTICIPANT_TABLE_FOR } from "../lib/db";
import type { ParticipantRow } from "../lib/db";

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
  signIn: (identifier: string, password: string) => Promise<User>;
  signUp: (
    participantType: ParticipantType,
    input: {
      fullName: string;
      regNumber?: string;
      email?: string;
      college?: string;
      phone?: string;
      password: string;
    },
  ) => Promise<User>;
  signInWithGoogle: () => Promise<void>;
  /** Complete profile for a Google OAuth user who signed in for the first time */
  completeGoogleProfile: (input: {
    participantType: ParticipantType;
    regNumber?: string;
    college?: string;
    phone?: string;
  }) => Promise<User>;
  signOut: () => void;
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
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
      setLoading(false);
    });

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
      async signIn(identifier, password) {
        const u = await api.signIn(identifier, password);
        setUser(u);
        return u;
      },
      async signUp(participantType, input) {
        const u =
          participantType === "internal"
            ? await api.signUpInternal({
                fullName: input.fullName,
                regNumber: input.regNumber ?? "",
                email: input.email ?? "",
                password: input.password,
              })
            : await api.signUpExternal({
                fullName: input.fullName,
                email: input.email ?? "",
                college: input.college ?? "",
                phone: input.phone ?? "",
                password: input.password,
              });
        setUser(u);
        return u;
      },
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

        const { authUserId, email, fullName } = googlePendingProfile;
        const username = fullName
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .map((p) => p.replace(/[^a-z0-9]/g, ""))
          .filter(Boolean)
          .join(".");

        const profileData = {
          id: authUserId,
          username,
          full_name: fullName,
          email,
          participant_type: input.participantType,
          reg_number: input.regNumber?.trim().toUpperCase() || null,
          college: input.college?.trim() || null,
          phone: input.phone?.trim() || null,
          role: "user" as const,
        };

        const table = PARTICIPANT_TABLE_FOR[input.participantType];
        const { error } = await supabase.from(table).upsert(profileData, { onConflict: "id" });
        if (error) throw new Error(error.message);

        const newUser: User = {
          id: authUserId,
          username,
          fullName,
          email,
          participantType: input.participantType,
          regNumber: input.regNumber?.trim().toUpperCase() || undefined,
          college: input.college?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          role: "user",
        };

        setUser(newUser);
        setGooglePendingProfile(null);
        return newUser;
      },
      signOut() {
        api.signOut();
        setUser(null);
        setGooglePendingProfile(null);
      },
    }),
    [user, loading, googlePendingProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
