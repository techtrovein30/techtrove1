-- =============================================================================
-- TechTrove 3.0 — Deploy hardening for concurrent signups
-- =============================================================================
-- Run this in your Supabase SQL Editor before going live.
--
-- It closes the double-registration race that can occur when many users
-- submit at the same moment (e.g. event launch). The previous guard in code
-- was a "check SELECT, then INSERT" with no DB-level guarantee, so two
-- simultaneous requests from the same user could both pass the check and
-- create duplicate registrations.
--
-- This adds a UNIQUE constraint on (user_id, event_id) to each registration
-- table. Postgres serializes the inserts, so a duplicate is now impossible
-- regardless of how many requests arrive at once.
--
-- It ALSO drops the UNIQUE constraint on `registration_code`, which is required
-- for the multi-event flat-pass model: multiple selected Tech/Non-Tech events
-- share ONE registration_code, so that column cannot be unique. The
-- (user_id, event_id) constraint below is what actually prevents duplicates.
--
-- Safe to re-run (idempotent).

-- ── Allow multiple events to share one registration_code (flat pass) ────────
-- The Tech/Non-Tech flat pass writes one row per event sharing a single
-- registration_code, so the code itself must NOT be UNIQUE. See
-- migrations/20240101000007_shared_registration_code.sql for the full migration.
alter table public.registrations_internal
  drop constraint if exists registrations_internal_registration_code_key;
alter table public.registrations_external
  drop constraint if exists registrations_external_registration_code_key;

-- ── registrations_internal ─────────────────────────────────────────────────
alter table public.registrations_internal
  drop constraint if exists uq_internal_user_event;

alter table public.registrations_internal
  add constraint uq_internal_user_event unique (user_id, event_id);

-- ── registrations_external ─────────────────────────────────────────────────
alter table public.registrations_external
  drop constraint if exists uq_external_user_event;

alter table public.registrations_external
  add constraint uq_external_user_event unique (user_id, event_id);
