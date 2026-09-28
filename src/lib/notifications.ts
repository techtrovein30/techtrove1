/**
 * notifications.ts
 * ----------------
 * User-facing notification system for TechTrove 3.0.
 *
 * Notifications are stored in the Supabase `notifications` table.
 * The admin panel creates notifications (e.g., when requesting a payment
 * screenshot reupload), and the user sees them via the NotificationBell
 * component in the Navbar.
 */

import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────

export type NotificationType = "reupload_requested" | "info" | "warning";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  registrationId?: string;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  registration_id: string | null;
  created_at: string;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    read: row.read,
    registrationId: row.registration_id ?? undefined,
    createdAt: row.created_at,
  };
}

// ─── User-facing reads ─────────────────────────────────────────────────────

/**
 * Fetch all notifications for the current user, newest first.
 * Limited to the 50 most recent.
 */
export async function getUserNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[notifications] Fetch failed:", error.message);
    return [];
  }

  return (data as NotificationRow[]).map(rowToNotification);
}

/**
 * Get the unread notification count for the current user.
 */
export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("read", false);

  if (error) {
    console.warn("[notifications] Unread count failed:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) {
    console.warn("[notifications] Mark read failed:", error.message);
  }
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  if (error) {
    console.warn("[notifications] Mark all read failed:", error.message);
  }
}

// ─── Admin-facing writes ───────────────────────────────────────────────────

/**
 * Create a notification for a user when an admin requests a payment
 * screenshot re-upload. Called from adminApi.ts.
 */
export async function createReuploadNotification(
  userId: string,
  registrationId: string,
  teamName: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: "reupload_requested",
    title: "Payment screenshot re-upload requested",
    message: `Your payment proof for team "${teamName}" needs to be re-uploaded. Reason: ${reason}`,
    read: false,
    registration_id: registrationId,
  });

  if (error) {
    // Non-fatal: log but don't throw, so the admin operation still succeeds
    console.error("[notifications] Failed to create reupload notification:", error.message);
  }
}

// ─── Realtime subscription ─────────────────────────────────────────────────

/**
 * Subscribe to new notifications for a specific user via Supabase Realtime.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(
  userId: string,
  onNewNotification: (notification: Notification) => void,
): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as NotificationRow;
        onNewNotification(rowToNotification(row));
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
