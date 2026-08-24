import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/mockApi";
import type { User, ParticipantType } from "../lib/mockApi";

interface AuthContextValue {
  user: User | null;
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
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => api.restoreSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
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
      signOut() {
        api.signOut();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
