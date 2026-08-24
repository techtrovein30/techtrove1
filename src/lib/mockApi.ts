import { getEvent } from "../data/techtrove";
import { storageGet, storageRemove, storageSet } from "./storage";

export type ParticipantType = "internal" | "external";

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  participantType: ParticipantType;
  regNumber?: string;
  college?: string;
  phone?: string;
}

export interface Session {
  userId: string;
}

export type MemberRole = "player" | "substitute";

export interface RegistrationMember {
  name: string;
  role: MemberRole;
  position: number;
}

export type PaymentStatus = "pending" | "recorded";

export interface Registration {
  id: string;
  registrationCode: string;
  userId: string;
  eventId: string;
  teamName: string;
  captainName: string;
  fee: number;
  paymentStatus: PaymentStatus;
  termsAccepted: boolean;
  members: RegistrationMember[];
  createdAt: string;
}

interface StoredUser extends User {
  passwordHash: string;
}

const USERS_KEY = "tt.users";
const SESSION_KEY = "tt.session";
const REGISTRATIONS_KEY = "tt.registrations";

function delay(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPassword(password: string): string {
  // Demo only. A real backend must never see or store passwords like this.
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = (Math.imul(31, h) + password.charCodeAt(i)) | 0;
  }
  return String(h);
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

function deriveUsername(fullName: string): string {
  const parts = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(".") : "member";
}

function uniqueUsername(users: StoredUser[], fullName: string): string {
  const base = deriveUsername(fullName);
  if (!users.some((u) => u.username === base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${i}`;
    if (!users.some((u) => u.username === candidate)) return candidate;
  }
}

function isSaveethaEmail(email: string): boolean {
  return /^[^\s@]+@saveetha\.[a-z.]+$/i.test(email.trim());
}

function listUsers(): StoredUser[] {
  // Backfill usernames for accounts created before usernames existed.
  return storageGet<StoredUser[]>(USERS_KEY, []).map((u) => ({
    ...u,
    username: u.username ?? deriveUsername(u.fullName),
  }));
}

function saveUsers(users: StoredUser[]): void {
  storageSet(USERS_KEY, users);
}

function publicUser(u: StoredUser): User {
  const { passwordHash: _ignored, ...user } = u;
  return user;
}

function requireSession(): User {
  const session = storageGet<Session | null>(SESSION_KEY, null);
  if (!session) throw new Error("You need to sign in first.");
  const user = listUsers().find((u) => u.id === session.userId);
  if (!user) throw new Error("Session expired. Please sign in again.");
  return publicUser(user);
}

export const api = {
  async signUpInternal(input: {
    fullName: string;
    regNumber: string;
    email: string;
    password: string;
  }): Promise<User> {
    await delay();
    const users = listUsers();
    const email = input.email.trim().toLowerCase();
    if (!isSaveethaEmail(email)) {
      throw new Error("Internal students must register with their Saveetha email (e.g. name@saveetha.com).");
    }
    const regNumber = input.regNumber.trim().toUpperCase();
    if (users.some((u) => u.regNumber === regNumber)) {
      throw new Error("An account with this registration number already exists. Try signing in.");
    }
    if (users.some((u) => u.email === email)) {
      throw new Error("An account with this email already exists. Try signing in.");
    }
    const user: StoredUser = {
      id: makeId("U"),
      username: uniqueUsername(users, input.fullName),
      fullName: input.fullName.trim(),
      email,
      participantType: "internal",
      regNumber,
      college: "SIMATS",
      passwordHash: hashPassword(input.password),
    };
    users.push(user);
    saveUsers(users);
    storageSet(SESSION_KEY, { userId: user.id } satisfies Session);
    return publicUser(user);
  },

  async signUpExternal(input: {
    fullName: string;
    email: string;
    college: string;
    phone: string;
    password: string;
  }): Promise<User> {
    await delay();
    const users = listUsers();
    const email = input.email.trim().toLowerCase();
    if (users.some((u) => u.email === email)) {
      throw new Error("An account with this email already exists. Try signing in.");
    }
    const user: StoredUser = {
      id: makeId("U"),
      username: uniqueUsername(users, input.fullName),
      fullName: input.fullName.trim(),
      email,
      participantType: "external",
      college: input.college.trim(),
      phone: input.phone.trim(),
      passwordHash: hashPassword(input.password),
    };
    users.push(user);
    saveUsers(users);
    storageSet(SESSION_KEY, { userId: user.id } satisfies Session);
    return publicUser(user);
  },

  async signIn(identifier: string, password: string): Promise<User> {
    await delay();
    const id = identifier.trim().toLowerCase();
    const user = listUsers().find(
      (u) =>
        u.username.toLowerCase() === id ||
        u.email === id ||
        (u.regNumber && u.regNumber.toLowerCase() === id),
    );
    if (!user || user.passwordHash !== hashPassword(password)) {
      throw new Error("Invalid credentials. Check your details and try again.");
    }
    storageSet(SESSION_KEY, { userId: user.id } satisfies Session);
    return publicUser(user);
  },

  restoreSession(): User | null {
    try {
      return requireSession();
    } catch {
      return null;
    }
  },

  signOut(): void {
    storageRemove(SESSION_KEY);
  },

  async createRegistration(input: {
    eventId: string;
    teamName: string;
    captainName: string;
    players: string[];
    substitutes: string[];
    termsAccepted: boolean;
  }): Promise<Registration> {
    await delay(700);

    // Server-side style validation, mirroring what a real backend enforces.
    if (!input.termsAccepted) throw new Error("Terms and conditions must be accepted.");

    const event = getEvent(input.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.registrationOpen) throw new Error("Registration for this event is closed.");

    const user = requireSession();

    const required = event.requiredPlayers ?? 1;
    const maxSubs = event.maxSubstitutes ?? 0;

    const players = input.players.map((p) => p.trim()).filter(Boolean);
    const substitutes = input.substitutes.map((p) => p.trim()).filter(Boolean);

    if (players.length !== required) {
      throw new Error(`This event requires exactly ${required} players.`);
    }
    if (substitutes.length > maxSubs) {
      throw new Error(`This event allows at most ${maxSubs} substitutes.`);
    }

    const existing = listRegistrations();
    if (
      existing.some((r) => r.userId === user.id && r.eventId === event.id)
    ) {
      throw new Error("You have already registered for this event.");
    }

    const registration: Registration = {
      id: makeId("R"),
      registrationCode: makeId("TT"),
      userId: user.id,
      eventId: event.id,
      teamName: input.teamName.trim(),
      captainName: input.captainName.trim(),
      fee: event.registrationFee ?? 0,
      paymentStatus: "pending",
      termsAccepted: true,
      members: [
        ...players.map((name, i) => ({ name, role: "player" as const, position: i + 1 })),
        ...substitutes.map((name, i) => ({
          name,
          role: "substitute" as const,
          position: i + 1,
        })),
      ],
      createdAt: new Date().toISOString(),
    };

    existing.push(registration);
    storageSet(REGISTRATIONS_KEY, existing);
    return registration;
  },

  async listMyRegistrations(): Promise<Registration[]> {
    await delay(300);
    const user = requireSession();
    return listRegistrations()
      .filter((r) => r.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getRegistrationByCode(code: string): Promise<Registration> {
    await delay(300);
    const reg = listRegistrations().find(
      (r) => r.registrationCode.toLowerCase() === code.toLowerCase(),
    );
    if (!reg) throw new Error("Registration not found.");
    return reg;
  },
};

function listRegistrations(): Registration[] {
  return storageGet<Registration[]>(REGISTRATIONS_KEY, []);
}
