/**
 * admin-kick-email-worker — Supabase Edge Function (JWT-verified)
 * -----------------------------------------------------------------
 * Admin-only trigger for one confirmation-email batch.
 *
 * Why this exists: the confirmation worker
 * (https://<ref>.supabase.co/functions/v1/send-confirmation-email) uses a
 * static Bearer token (EMAIL_WORKER_TOKEN) and has JWT verification OFF, so it
 * is not callable from the browser. This function sits in front of it:
 *   1. Supabase verifies the caller's JWT (deployed with verify_jwt = true).
 *   2. It re-checks the caller is an ADMIN (browser session can only read its
 *      own participant row, and we require role = 'admin').
 *   3. It forwards one POST to the worker with EMAIL_WORKER_TOKEN.
 *
 * It never exposes the worker token to the client and never bypasses the
 * worker's own safety switches (EMAIL_SENDING_ENABLED, email_queue_control
 * paused, 200/24h cap) — it just invokes the worker exactly like ops would.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

/** Reflect the caller origin so the admin SPA can call this from its own domain. */
function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, accept",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const workerToken = Deno.env.get("EMAIL_WORKER_TOKEN") ?? "";

  if (!supabaseUrl || !anonKey || !workerToken) {
    return json({ error: "missing_supabase_env" }, 500, origin);
  }

  // ── 1. Caller identity (JWT already validated by the platform) ───────────
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "unauthorized" }, 401, origin);
  }

  // ── 2. Admin re-check (RLS lets the session read only its own row) ────────
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [internal, external] = await Promise.all([
    client.from("internal_participants").select("id, role").eq("role", "admin").maybeSingle(),
    client.from("external_participants").select("id, role").eq("role", "admin").maybeSingle(),
  ]);
  const isAdmin = !!internal.data || !!external.data;
  if (!isAdmin) {
    return json({ error: "forbidden_admin_role_required" }, 403, origin);
  }

  // ── 3. Forward one batch to the worker (its safety switches still apply) ──
  const workerUrl = `${supabaseUrl}/functions/v1/send-confirmation-email`;
  const res = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerToken}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
});