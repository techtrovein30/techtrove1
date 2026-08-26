/**
 * adminApi.ts
 * -----------
 * All admin-privileged data operations for the TechTrove 3.0 admin panel.
 *
 * ARCHITECTURE NOTE:
 * Every function in this module performs its own role check so that no admin
 * action can succeed even if called programmatically from the console.
 * When a real backend is connected, replace the localStorage reads/writes
 * inside each function with fetch() calls — the admin page components will
 * not need to change.
 *
 * SECURITY NOTE:
 * This is a client-side localStorage implementation intended for demo/
 * development use. It does NOT provide production-grade security.
 * Replace with server-side authentication before real deployment.
 */

import { storageGet, storageSet, storageRemove } from "./storage";
import { storageGet as sg } from "./storage";
import type { User, Registration } from "./mockApi";

// ─── Internal types ────────────────────────────────────────────────────────

interface StoredUser extends User {
  passwordHash: string;
}

interface Session {
  userId: string;
}

// ─── Storage keys ──────────────────────────────────────────────────────────

const USERS_KEY = "tt.users";
const SESSION_KEY = "tt.session";
const REGISTRATIONS_KEY = "tt.registrations";
const ADMIN_SEEDED_KEY = "tt.admin.seeded";

// ─── Bootstrap admin credential (developer-only, never rendered in UI) ─────
// Change this password from the Settings page after first login.
const BOOTSTRAP_USERNAME = "wch-admin";
const BOOTSTRAP_PASSWORD_HASH = _hash("TechTrove@2025");

function _hash(password: string): string {
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = (Math.imul(31, h) + password.charCodeAt(i)) | 0;
  }
  return String(h);
}

function _makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function listStoredUsers(): StoredUser[] {
  return storageGet<StoredUser[]>(USERS_KEY, []);
}

function saveStoredUsers(users: StoredUser[]): void {
  storageSet(USERS_KEY, users);
}

function listStoredRegistrations(): Registration[] {
  return storageGet<Registration[]>(REGISTRATIONS_KEY, []);
}

function saveStoredRegistrations(regs: Registration[]): void {
  storageSet(REGISTRATIONS_KEY, regs);
}

function publicUser(u: StoredUser): User {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ignored, ...user } = u;
  return user;
}

// ─── Admin seeding ─────────────────────────────────────────────────────────

/**
 * Ensures one admin account exists in storage. Called once on app load via
 * the AdminLoginPage. Never exposes credentials through the public website.
 */
export function seedAdminIfNeeded(): void {
  const alreadySeeded = storageGet<boolean>(ADMIN_SEEDED_KEY, false);
  if (alreadySeeded) return;

  const users = listStoredUsers();
  const adminExists = users.some((u) => u.role === "admin");
  if (!adminExists) {
    const adminUser: StoredUser = {
      id: _makeId("ADM"),
      username: BOOTSTRAP_USERNAME,
      fullName: "TechTrove Admin",
      email: "admin@techtrove.internal",
      participantType: "internal",
      college: "SIMATS",
      role: "admin",
      passwordHash: BOOTSTRAP_PASSWORD_HASH,
    };
    users.push(adminUser);
    saveStoredUsers(users);
  }
  storageSet(ADMIN_SEEDED_KEY, true);
}

// ─── Role verification ─────────────────────────────────────────────────────

function getCurrentAdminUser(): User {
  const session = storageGet<Session | null>(SESSION_KEY, null);
  if (!session) throw new Error("Not authenticated.");
  const user = listStoredUsers().find((u) => u.id === session.userId);
  if (!user) throw new Error("Session expired.");
  if (user.role !== "admin") throw new Error("Insufficient permissions.");
  return publicUser(user);
}

export function isCurrentUserAdmin(): boolean {
  try {
    getCurrentAdminUser();
    return true;
  } catch {
    return false;
  }
}

// ─── Admin sign-in ─────────────────────────────────────────────────────────

/**
 * Authenticates a user then verifies they are an admin.
 * If the credentials are correct but role is not 'admin', the session is
 * immediately cleared so no partial session persists.
 */
export async function adminSignIn(
  identifier: string,
  password: string
): Promise<User> {
  await new Promise((r) => setTimeout(r, 500));

  const id = identifier.trim().toLowerCase();
  const user = listStoredUsers().find(
    (u) =>
      u.username.toLowerCase() === id ||
      u.email === id ||
      (u.regNumber && u.regNumber.toLowerCase() === id)
  );

  if (!user || user.passwordHash !== _hash(password)) {
    throw new Error("Invalid credentials.");
  }

  if (user.role !== "admin") {
    // Correct password but not an admin — give identical error to prevent
    // confirming that the account exists.
    throw new Error("Invalid credentials.");
  }

  storageSet(SESSION_KEY, { userId: user.id } satisfies Session);
  return publicUser(user);
}

export function adminSignOut(): void {
  storageRemove(SESSION_KEY);
}

// ─── Statistics ────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  internalUsers: number;
  externalUsers: number;
  totalRegistrations: number;
  pendingPayments: number;
  recordedPayments: number;
  totalRevenue: number;
  perEvent: Record<string, number>; // eventId → count
  recentRegistrations: Registration[];
}

export function getAdminStats(): AdminStats {
  getCurrentAdminUser();

  const users = listStoredUsers().filter((u) => u.role !== "admin");
  const regs = listStoredRegistrations();

  const perEvent: Record<string, number> = {};
  let pending = 0;
  let recorded = 0;
  let revenue = 0;

  for (const r of regs) {
    perEvent[r.eventId] = (perEvent[r.eventId] ?? 0) + 1;
    if (r.paymentStatus === "pending") pending++;
    else recorded++;
    if (r.paymentStatus === "recorded") revenue += r.fee;
  }

  const recent = [...regs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return {
    totalUsers: users.length,
    internalUsers: users.filter((u) => u.participantType === "internal").length,
    externalUsers: users.filter((u) => u.participantType === "external").length,
    totalRegistrations: regs.length,
    pendingPayments: pending,
    recordedPayments: recorded,
    totalRevenue: revenue,
    perEvent,
    recentRegistrations: recent,
  };
}

// ─── User management ───────────────────────────────────────────────────────

export function adminListUsers(): User[] {
  getCurrentAdminUser();
  return listStoredUsers()
    .filter((u) => u.role !== "admin")
    .map(publicUser);
}

export function adminGetUser(userId: string): User {
  getCurrentAdminUser();
  const user = listStoredUsers().find((u) => u.id === userId);
  if (!user) throw new Error("User not found.");
  return publicUser(user);
}

export function adminGetUserRegistrations(userId: string): Registration[] {
  getCurrentAdminUser();
  return listStoredRegistrations().filter((r) => r.userId === userId);
}

export interface AdminUserPatch {
  fullName?: string;
  college?: string;
  phone?: string;
}

export function adminUpdateUser(userId: string, patch: AdminUserPatch): User {
  getCurrentAdminUser();
  const users = listStoredUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error("User not found.");
  if (users[idx].role === "admin") throw new Error("Cannot edit admin accounts from this view.");

  const allowed: AdminUserPatch = {};
  if (patch.fullName !== undefined) allowed.fullName = patch.fullName.trim();
  if (patch.college !== undefined) allowed.college = patch.college.trim();
  if (patch.phone !== undefined) allowed.phone = patch.phone.trim();

  users[idx] = { ...users[idx], ...allowed };
  saveStoredUsers(users);
  return publicUser(users[idx]);
}

export function adminDeleteUser(userId: string): void {
  const admin = getCurrentAdminUser();
  if (admin.id === userId) throw new Error("You cannot delete your own admin account.");

  const users = listStoredUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error("User not found.");
  if (users[idx].role === "admin") throw new Error("Cannot delete admin accounts.");

  // Remove the user
  users.splice(idx, 1);
  saveStoredUsers(users);

  // Remove their registrations to prevent orphaned data
  const regs = listStoredRegistrations().filter((r) => r.userId !== userId);
  saveStoredRegistrations(regs);
}

// ─── Registration management ───────────────────────────────────────────────

export function adminListRegistrations(): Registration[] {
  getCurrentAdminUser();
  return [...listStoredRegistrations()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function adminGetRegistration(regId: string): Registration {
  getCurrentAdminUser();
  const reg = listStoredRegistrations().find((r) => r.id === regId);
  if (!reg) throw new Error("Registration not found.");
  return reg;
}

export interface AdminRegistrationPatch {
  teamName?: string;
  captainName?: string;
  paymentStatus?: "pending" | "recorded";
}

export function adminUpdateRegistration(
  regId: string,
  patch: AdminRegistrationPatch
): Registration {
  getCurrentAdminUser();
  const regs = listStoredRegistrations();
  const idx = regs.findIndex((r) => r.id === regId);
  if (idx === -1) throw new Error("Registration not found.");

  const allowed: Partial<Registration> = {};
  if (patch.teamName !== undefined) allowed.teamName = patch.teamName.trim();
  if (patch.captainName !== undefined) allowed.captainName = patch.captainName.trim();
  if (patch.paymentStatus !== undefined) allowed.paymentStatus = patch.paymentStatus;

  regs[idx] = { ...regs[idx], ...allowed };
  saveStoredRegistrations(regs);
  return regs[idx];
}

export function adminDeleteRegistration(regId: string): void {
  getCurrentAdminUser();
  const regs = listStoredRegistrations();
  const idx = regs.findIndex((r) => r.id === regId);
  if (idx === -1) throw new Error("Registration not found.");
  regs.splice(idx, 1);
  saveStoredRegistrations(regs);
}

// ─── Admin settings ────────────────────────────────────────────────────────

export interface AdminAccountInfo {
  id: string;
  username: string;
  fullName: string;
  email: string;
}

export function getAdminAccountInfo(): AdminAccountInfo {
  const admin = getCurrentAdminUser();
  return {
    id: admin.id,
    username: admin.username,
    fullName: admin.fullName,
    email: admin.email,
  };
}

export function adminChangePassword(
  currentPassword: string,
  newPassword: string
): void {
  const session = storageGet<Session | null>(SESSION_KEY, null);
  if (!session) throw new Error("Not authenticated.");

  const users = listStoredUsers();
  const idx = users.findIndex((u) => u.id === session.userId);
  if (idx === -1) throw new Error("Session expired.");
  if (users[idx].role !== "admin") throw new Error("Insufficient permissions.");
  if (users[idx].passwordHash !== _hash(currentPassword)) {
    throw new Error("Current password is incorrect.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  users[idx] = { ...users[idx], passwordHash: _hash(newPassword) };
  saveStoredUsers(users);
}

export function getStorageUsageSummary(): {
  users: number;
  registrations: number;
  estimatedBytes: number;
} {
  getCurrentAdminUser();
  const users = listStoredUsers().filter((u) => u.role !== "admin").length;
  const registrations = listStoredRegistrations().length;

  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      bytes += (localStorage.getItem(key) ?? "").length * 2; // UTF-16
    }
  }

  return { users, registrations, estimatedBytes: bytes };
}

// Re-export sg to satisfy import in files that only use adminApi
void sg;
