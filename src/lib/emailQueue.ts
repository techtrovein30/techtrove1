/**
 * emailQueue.ts
 * -------------
 * Admin-facing data access for the confirmation-email outbox.
 *
 * Rules enforced here (and re-enforced by RLS + the admin RPCs in
 * query_email_system.txt):
 *   • READ the queue via PostgREST — admission gated by is_admin().
 *   • WRITES happen ONLY through SECURITY DEFINER admin RPCs:
 *       email_queue_retry(id)        — re-queue a FAILED job
 *       email_queue_set_paused(bool) — pause/resume sending
 *   • There is NO arbitrary "send to any address" capability.
 *   • The daily send cap (DEFAULT_DAILY_SEND_LIMIT) lives server-side and
 *     cannot be raised or changed from the frontend.
 */

import { supabase } from "./supabase";
import { requireAdmin } from "./adminGuard";

export type EmailQueueStatus = "pending" | "sending" | "sent" | "failed";

export interface EmailQueueRow {
  id: number;
  registrationCode: string;
  kind: string;
  status: EmailQueueStatus;
  recipientEmail: string | null;
  recipientName: string | null;
  teamName: string | null;
  captainName: string | null;
  eventRefs: string[];
  eventNames: string[];
  totalFee: number;
  attempts: number;
  lastError: string | null;
  claimedAt: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  createdAt: string;
}

export interface EmailQueueCounts {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
}

export interface EmailQueueControl {
  paused: boolean;
  updatedAt: string | null;
}

function friendlyError(err: unknown, fallback: string): Error {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[emailQueue] ${fallback}:`, detail);
  return new Error(fallback);
}

function toRow(r: Record<string, unknown>): EmailQueueRow {
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v ? v : null;
  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : [];
  return {
    id: Number(r.id),
    registrationCode: String(r.registration_code ?? ""),
    kind: String(r.kind ?? "confirmation"),
    status: (r.status ?? "pending") as EmailQueueStatus,
    recipientEmail: asString(r.recipient_email),
    recipientName: asString(r.recipient_name),
    teamName: asString(r.team_name),
    captainName: asString(r.captain_name),
    eventRefs: asArray(r.event_refs),
    eventNames: asArray(r.event_names),
    totalFee: Number(r.total_fee ?? 0),
    attempts: Number(r.attempts ?? 0),
    lastError: asString(r.last_error),
    claimedAt: asString(r.claimed_at),
    sentAt: asString(r.sent_at),
    providerMessageId: asString(r.provider_message_id),
    createdAt: String(r.created_at ?? ""),
  };
}

/** Latest queue rows, newest first. Read-only admin view. */
export async function adminListEmailQueue(limit = 300): Promise<EmailQueueRow[]> {
  await requireAdmin();

  const { data, error } = await supabase
    .from("email_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw friendlyError(error, "Could not load the email queue.");
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

/** Counts by status (pending/sending/sent/failed). */
export async function adminEmailQueueCounts(): Promise<EmailQueueCounts> {
  await requireAdmin();

  const [pending, sending, sent, failed] = await Promise.all([
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "sending"),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "sent"),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  return {
    pending: pending.count ?? 0,
    sending: sending.count ?? 0,
    sent: sent.count ?? 0,
    failed: failed.count ?? 0,
  };
}

/** Reads the admin pause/resume flag (missing row ⇒ treated as paused). */
export async function adminEmailQueueControl(): Promise<EmailQueueControl> {
  await requireAdmin();

  const { data, error } = await supabase
    .from("email_queue_control")
    .select("paused, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) throw friendlyError(error, "Could not read email queue control state.");
  // Default to PAUSED if the control row is missing (SQL not applied yet).
  return {
    paused: data?.paused === true,
    updatedAt: data?.updated_at ? String(data.updated_at) : null,
  };
}

/**
 * Pause/resume sending. This only flips the application-level pause flag —
 * the worker STILL refuses to send while the server-side EMAIL_SENDING_ENABLED
 * secret is off, and the 200/24h cap always applies.
 */
export async function adminEmailQueueSetPaused(paused: boolean): Promise<boolean> {
  await requireAdmin();
  const { data, error } = await supabase.rpc("email_queue_set_paused", { p_paused: paused });
  if (error) throw friendlyError(error, "Could not update the email queue pause state.");
  return data === true;
}

/** Re-queue a single FAILED job for another attempt (admin-confirmed only). */
export async function adminEmailQueueRetry(id: number): Promise<void> {
  await requireAdmin();
  const { error } = await supabase.rpc("email_queue_retry", { p_id: id });
  if (error) throw friendlyError(error, "Could not retry that email job.");
}

export interface EmailBatchKickResult {
  enabled: boolean;
  paused?: boolean;
  stopped?: string;
  note?: string;
  batchAttempted?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  quotaStopped?: boolean;
  sentToday?: number;
  dailyLimit?: number;
  remainingAfter?: number;
  counts?: EmailQueueCounts;
}

/**
 * Triggers ONE worker batch through the JWT-guarded edge function. Returns the
 * worker's response. The worker's own safety switches always apply
 * (EMAIL_SENDING_ENABLED, email_queue_control.paused, 200/24h cap).
 */
export async function adminKickEmailBatch(): Promise<EmailBatchKickResult> {
  await requireAdmin();
  const { data, error } = await supabase.functions.invoke("admin-kick-email-worker", {
    body: {},
  });
  if (error) throw friendlyError(error, "Could not trigger the email batch.");
  return (data ?? {}) as EmailBatchKickResult;
}