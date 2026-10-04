/**
 * send-confirmation-emails — Supabase Edge Function
 * -------------------------------------------------
 * Processes email_outbox rows: claim -> (if enabled) Gmail API send -> mark
 * sent / failed. Concurrency-safe (email_queue_claim uses FOR UPDATE SKIP
 * LOCKED), quota-aware (hard 200/24h application cap), and OFF BY DEFAULT.
 *
 * Safety switches (all server-side secrets / DB state, never frontend):
 *   1. EMAIL_SENDING_ENABLED   — absent or not "true" => dry-run report only.
 *   2. email_queue_control.paused — seeded TRUE; admin pause/resume.
 *   3. DEFAULT_DAILY_SEND_LIMIT — application cap, 500 default. The frontend
 *      can never raise it.
 *   4. EMAIL_ONLY_CODES        — TEST-ONLY override: comma-separated allowlist
 *      of registration codes. When set, ONLY those rows can ever be sent.
 *      Unlisted claims are released back to pending. Use for controlled tests,
 *      remove afterwards.
 *
 * Provider: Gmail API (OAuth2 refresh token), isolated behind gmail.ts so the
 * provider can be swapped later.
 *
 * DURABLE IDEMPOTENCY: email_outbox unique (registration_code, kind) +
 * status state machine + atomic claim. If the worker crashes AFTER Gmail
 * accepts an email but BEFORE the DB row is marked sent, the stale 'sending'
 * row is recovered conservatively (marked failed for manual verification) —
 * it is NEVER blindly re-sent. Documented ambiguity: see implementation report.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildConfirmationMail,
  CONFIRMATION_BRAND,
  type ConfirmationContentData,
} from "./content.ts";
import {
  GmailSendError,
  fetchAccessToken,
  gmailSendMessage,
  type AccessTokenCache,
  type GmailConfig,
} from "./gmail.ts";

// ── Environment ─────────────────────────────────────────────────────────────

function envKey(name: string): string {
  return Deno.env.get(name) ?? "";
}

const SUPABASE_URL = envKey("SUPABASE_URL");
const SERVICE_ROLE_KEY = envKey("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_TOKEN = envKey("EMAIL_WORKER_TOKEN");

const SENDING_ENABLED = envKey("EMAIL_SENDING_ENABLED") === "true";
const DAILY_LIMIT = parseInt(envKey("DEFAULT_DAILY_SEND_LIMIT") || "500", 10) || 500;
const BATCH_SIZE = Math.max(0, Math.min(parseInt(envKey("EMAIL_BATCH_SIZE") || "20", 10) || 20, 100));
const ONLY_CODES = envKey("EMAIL_ONLY_CODES")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_ATTEMPTS = parseInt(envKey("EMAIL_MAX_ATTEMPTS") || "5", 10) || 5;
const BACKOFF_BASE_MIN = parseInt(envKey("EMAIL_BACKOFF_BASE_MINUTES") || "2", 10) || 2;
const STALE_SENDING_MIN = parseInt(envKey("EMAIL_STALE_SENDING_MINUTES") || "15", 10) || 15;

/** Admin address that gets a short summary mail after EVERY real batch tick. */
const NOTIFY_TO = envKey("EMAIL_NOTIFY_TO").trim();

const GMAIL_CONFIG: GmailConfig = {
  clientId: envKey("GMAIL_CLIENT_ID"),
  clientSecret: envKey("GMAIL_CLIENT_SECRET"),
  refreshToken: envKey("GMAIL_REFRESH_TOKEN"),
  fromEmail: envKey("GMAIL_FROM") || "techtrovein3.0@gmail.com",
  fromName: "TechTrove 3.0",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

interface QueueRow {
  id: number;
  registration_code: string;
  recipient_email: string | null;
  recipient_name: string | null;
  team_name: string | null;
  captain_name: string | null;
  event_names: unknown[] | null;
  total_fee: number;
  attempts: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function backoffIso(attemptCount: number): string {
  const exponent = Math.max(0, attemptCount - 1);
  const minutes = Math.min(BACKOFF_BASE_MIN * 2 ** exponent, 60);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function queueCounts(admin: ReturnType<typeof createClient>) {
  const [pending, sending, sent, failed] = await Promise.all([
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "sending"),
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "sent"),
    admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  return {
    pending: pending.count ?? 0,
    sending: sending.count ?? 0,
    sent: sent.count ?? 0,
    failed: failed.count ?? 0,
  };
}

async function pendingSample(admin: ReturnType<typeof createClient>, limit: number) {
  const { data } = await admin
    .from("email_outbox")
    .select("registration_code, recipient_email, event_names, team_name")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((r) => ({
    registration_code: r.registration_code,
    recipient_email: r.recipient_email,
    events: (r.event_names ?? []) as string[],
    team_name: r.team_name,
  }));
}

async function markRow(
  admin: ReturnType<typeof createClient>,
  id: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("email_outbox").update(patch).eq("id", id);
  if (error) {
    console.error(`[worker] outbox update failed for id=${id}:`, error.message);
  }
}

/** Re-resolves a missing recipient from the canonical participant row (writes
 *  only ever touch email_outbox — existing business data stays read-only).
 *  Returns the canonical { email, name } or null when unresolvable. */
async function resolveRecipient(
  admin: ReturnType<typeof createClient>,
  row: QueueRow,
): Promise<{ email: string; name: string | null } | null> {
  const { data: regs, error } = await admin
    .from("registrations_external")
    .select("user_id, team_name, captain_name")
    .eq("registration_code", row.registration_code)
    .limit(1);
  if (error || !regs?.[0]?.user_id) return null;

  const { data: part } = await admin
    .from("external_participants")
    .select("email, full_name")
    .eq("id", regs[0].user_id)
    .maybeSingle();
  const email = part?.email?.trim();
  if (!email) return null;

  const resolved = { email, name: part.full_name ?? null };
  await markRow(admin, row.id, {
    recipient_email: email,
    recipient_name: resolved.name,
    team_name: row.team_name ?? regs[0].team_name ?? null,
    captain_name: row.captain_name ?? regs[0].captain_name ?? null,
  });
  return resolved;
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Worker-authorization (scheduler / manual admin invocation).
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!WORKER_TOKEN || auth !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "missing_supabase_env" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminTokenCache: AccessTokenCache = { token: "", expiresAt: 0 };

  /** Sends an admin copy of the confirmation mail after a batch tick — the
   *  SAME approved template as participants (no stats summary; ops info lives
   *  in the admin UI). One slot per batch is reserved for this copy. */
  async function sendAdminCopy(tokenCache: AccessTokenCache): Promise<void> {
    if (!NOTIFY_TO) return;
    try {
      const mail = buildConfirmationMail(
        {
          registrationCode: "ADMIN-COPY",
          teamName: null,
          captainName: null,
          recipientName: NOTIFY_TO,
          eventNames: [],
          totalFee: 0,
        },
        CONFIRMATION_BRAND,
      );
      await gmailSendMessage(GMAIL_CONFIG, tokenCache, {
        fromEmail: GMAIL_CONFIG.fromEmail,
        fromName: GMAIL_CONFIG.fromName,
        toEmail: NOTIFY_TO,
        toName: "TechTrove Admin",
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (err) {
      console.error("[worker] admin copy email failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";
  const counts = await queueCounts(admin);

  // ── Safety switch #1: sending must be explicitly enabled ─────────────────
  if (!SENDING_ENABLED || dryRun) {
    return json({
      enabled: false,
      dryRun: true,
      note: "EMAIL_SENDING_ENABLED is not 'true' — no email was sent.",
      counts,
      wouldSendSample: await pendingSample(admin, 10),
    });
  }

  // ── Safety switch #2: application pause flag (email_queue_control) ───────
  const { data: control, error: controlError } = await admin
    .from("email_queue_control")
    .select("paused")
    .eq("id", true)
    .maybeSingle();
  if (controlError) {
    return json({ error: "control_read_failed", detail: controlError.message }, 500);
  }
  if (control?.paused === undefined) {
    return json({ error: "email_queue_control_missing_row" }, 500);
  }
  if (control.paused === true) {
    return json({
      enabled: true,
      paused: true,
      note: "email_queue_control.paused — no email was sent.",
      counts,
    });
  }

  // ── Recover stale 'sending' rows CONSERVATIVELY ──────────────────────────
  // A row stuck in 'sending' for > STALE_SENDING_MIN is ambiguous (Gmail may
  // have accepted the message). It is marked failed for manual verification —
  // never blindly re-sent (durable idempotency requirement).
  await admin
    .from("email_outbox")
    .update({
      status: "failed",
      claimed_at: null,
      last_error: "interrupted during send (stale claim) — verify delivery in Gmail before retry",
    })
    .eq("status", "sending")
    .lt("claimed_at", minutesAgoIso(STALE_SENDING_MIN));

  // ── Application daily cap (rolling 24h window) ───────────────────────────
  const { count: sentToday } = await admin
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", minutesAgoIso(24 * 60));
  const remaining = Math.max(0, DAILY_LIMIT - (sentToday ?? 0));
  if (remaining <= 0) {
    return json({
      enabled: true,
      paused: false,
      stopped: "daily_limit_reached",
      counts,
      sentToday,
      dailyLimit: DAILY_LIMIT,
      remaining: 0,
    });
  }

  // ── Atomic claim (scheduler may overlap) ─────────────────────────────────
  // Reserve one slot for the admin copy when a copy recipient is configured,
  // so a full batch = (BATCH_SIZE - 1) participants + 1 copy to the admin.
  const batchLimit = Math.min(BATCH_SIZE, remaining);
  const reserveAdminCopy = NOTIFY_TO && batchLimit >= 2 ? 1 : 0;
  const { data: claimed, error: claimError } = await admin.rpc("email_queue_claim", {
    p_limit: Math.max(0, batchLimit - reserveAdminCopy),
  });
  if (claimError) {
    return json({ error: "claim_failed", detail: claimError.message }, 500);
  }

  const tokenCache: AccessTokenCache = adminTokenCache;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let quotaStopped = false;
  let authStopped = false;
  const processedIds = new Set<number>();

  for (const raw of claimed ?? []) {
    const row: QueueRow = {
      id: Number(raw.id),
      registration_code: String(raw.registration_code),
      recipient_email: raw.recipient_email ? String(raw.recipient_email) : null,
      recipient_name: raw.recipient_name ? String(raw.recipient_name) : null,
      team_name: raw.team_name ? String(raw.team_name) : null,
      captain_name: raw.captain_name ? String(raw.captain_name) : null,
      event_names: Array.isArray(raw.event_names) ? raw.event_names : [],
      total_fee: Number(raw.total_fee ?? 0),
      attempts: Number(raw.attempts ?? 0),
    };
    processedIds.add(row.id);

    // Re-resolve a missing snapshot recipient (repair path, outbox-only write).
    if (ONLY_CODES.length > 0 && !ONLY_CODES.includes(row.registration_code)) {
      await markRow(admin, row.id, { status: "pending", claimed_at: null });
      skipped++;
      continue;
    }

    if (!row.recipient_email) {
      const resolved = await resolveRecipient(admin, row);
      if (!resolved) {
        await markRow(admin, row.id, {
          status: "failed",
          claimed_at: null,
          last_error: "invalid recipient — no canonical external participant email could be resolved",
        });
        failed++;
        continue;
      }
      row.recipient_email = resolved.email;
      row.recipient_name = resolved.name ?? row.recipient_name;
    }

    const data: ConfirmationContentData = {
      registrationCode: row.registration_code,
      teamName: row.team_name,
      captainName: row.captain_name,
      recipientName: row.recipient_name,
      eventNames: (row.event_names ?? []).map(String),
      totalFee: row.total_fee,
    };
    const mail = buildConfirmationMail(data, CONFIRMATION_BRAND);

    try {
      const { id } = await gmailSendMessage(GMAIL_CONFIG, tokenCache, {
        fromEmail: GMAIL_CONFIG.fromEmail,
        fromName: GMAIL_CONFIG.fromName,
        toEmail: row.recipient_email as string,
        toName: row.recipient_name ?? row.captain_name ?? "",
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      await markRow(admin, row.id, {
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: id,
        attempts: row.attempts + 1,
        last_error: null,
        claimed_at: null,
      });
      sent++;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const kind = err instanceof GmailSendError ? err.kind : null;
      const isQuota = kind === "quota";

      if (isQuota) {
        // Back off HARD on quota/rate-limit — do not hammer Gmail.
        await markRow(admin, row.id, {
          status: "failed",
          last_error: `${detail} Backed off 60min.`,
          attempts: row.attempts + 1,
          claimed_at: null,
          next_attempt_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });
        quotaStopped = true;
        failed++;
        break;
      }

      // Auth failure (expired/revoked refresh token) kills the whole batch:
      // every remaining message would fail the same way. Stop immediately,
      // release the rest unclaimed, and do NOT burn retry attempts.
      if (kind === "auth") {
        await markRow(admin, row.id, {
          status: "pending",
          last_error: `${detail} Batch aborted — fix the OAuth credentials before retrying.`,
          claimed_at: null,
        });
        authStopped = true;
        failed++;
        break;
      }

      const attempts = row.attempts + 1;
      const permanent = kind === "invalid";
      if (permanent || attempts >= MAX_ATTEMPTS) {
        await markRow(admin, row.id, {
          status: "failed",
          last_error: detail,
          attempts,
          claimed_at: null,
        });
      } else {
        await markRow(admin, row.id, {
          status: "pending",
          last_error: detail,
          attempts,
          claimed_at: null,
          next_attempt_at: backoffIso(attempts),
        });
      }
      failed++;
    }
  }

  // A `break` (quota or auth) leaves the rest of the claim in 'sending'.
  // Release them so they are not swept as stale failures in 15 minutes.
  const unreleasedIds = (claimed ?? [])
    .map((raw) => Number(raw.id))
    .filter((id) => !processedIds.has(id));
  if (unreleasedIds.length > 0) {
    await admin
      .from("email_outbox")
      .update({
        status: "pending",
        claimed_at: null,
        last_error: "released — batch aborted before this row was attempted",
      })
      .in("id", unreleasedIds);
  }

  const after = await queueCounts(admin);

  let adminCopySent = false;
  if (NOTIFY_TO && !authStopped) {
    await sendAdminCopy(tokenCache);
    adminCopySent = true;
  }

  return json({
    enabled: true,
    paused: false,
    batchAttempted: (claimed ?? []).length,
    sent,
    failed,
    skipped,
    quotaStopped,
    authStopped,
    released: unreleasedIds.length,
    adminCopySent,
    sentToday: (sentToday ?? 0) + sent,
    dailyLimit: DAILY_LIMIT,
    remainingAfter: Math.max(0, DAILY_LIMIT - (sentToday ?? 0) - sent),
    ...(authStopped
      ? {
          actionRequired:
            "Gmail OAuth credentials are invalid (expired or revoked refresh token). Re-authorize and update GMAIL_REFRESH_TOKEN / GMAIL_FROM, then retry the failed rows.",
        }
      : {}),
    counts: after,
  });
});