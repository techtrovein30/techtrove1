-- =============================================================================
-- TechTrove 3.0 — Allow multiple events to share one registration_code (flat pass)
-- =============================================================================
-- Run this in your Supabase SQL Editor (idempotent — safe to re-run).
--
-- PROBLEM
--   The Tech/Non-Tech flat-pass model writes ONE row per selected event, and
--   every row in that batch shares the SAME registration_code (so the database
--   charges the ₹75 pass exactly once per batch). But the original schema put a
--   UNIQUE constraint on `registration_code`, which forbids two rows sharing a
--   code. Submitting payment for 2+ selected Tech/Non-Tech events therefore
--   fails on the 2nd insert with:
--
--     duplicate key value violates unique constraint
--     "registrations_external_registration_code_key"
--
-- FIX
--   Drop the UNIQUE on `registration_code` for BOTH registration tables and
--   rely instead on UNIQUE(user_id, event_id) to stop duplicate self-signups
--   (this is the same guard added by deploy.sql, now made authoritative here).
--   Multiple rows may now legitimately share one registration_code, which is
--   exactly what the flat-pass trigger (20240101000006) expects.
-- =============================================================================

-- ── Drop the UNIQUE constraint that blocks sharing a registration_code ─────
-- Supabase's auto-generated constraint names; drop by explicit name if present,
-- then safely drop by matching the column+unique definition as a fallback.
alter table public.registrations_external
  drop constraint if exists registrations_external_registration_code_key;
alter table public.registrations_internal
  drop constraint if exists registrations_internal_registration_code_key;

-- Belt-and-braces: remove ANY unique constraint whose columns are exactly
-- (registration_code) on these tables, regardless of the auto-generated name.
do $$
declare
  cons record;
begin
  for cons in
    select tc.table_name, tc.constraint_name, tc.constraint_type
      from information_schema.table_constraints tc
     where tc.table_schema = 'public'
       and tc.table_name in ('registrations_internal', 'registrations_external')
       and tc.constraint_type = 'UNIQUE'
  loop
    -- Check whether this unique constraint spans exactly the registration_code column.
    if exists (
      select 1
        from information_schema.key_column_usage kcu
       where kcu.constraint_name = cons.constraint_name
         and kcu.table_schema = 'public'
         and kcu.column_name = 'registration_code'
    ) and not exists (
      select 1
        from information_schema.key_column_usage kcu
       where kcu.constraint_name = cons.constraint_name
         and kcu.table_schema = 'public'
         and kcu.column_name <> 'registration_code'
    ) then
      execute format('alter table public.%I drop constraint if exists %I',
                     cons.table_name, cons.constraint_name);
    end if;
  end loop;
end $$;

-- ── Enforce duplicate self-signup protection instead (user_id + event_id) ──
alter table public.registrations_internal
  drop constraint if exists uq_internal_user_event;
alter table public.registrations_internal
  add constraint uq_internal_user_event unique (user_id, event_id);

alter table public.registrations_external
  drop constraint if exists uq_external_user_event;
alter table public.registrations_external
  add constraint uq_external_user_event unique (user_id, event_id);

-- ── Verification (should show 0 unique constraints on registration_code) ──
select tc.table_name, tc.constraint_name
  from information_schema.table_constraints tc
 where tc.table_schema = 'public'
   and tc.table_name in ('registrations_internal', 'registrations_external')
   and tc.constraint_type = 'UNIQUE'
 order by tc.table_name, tc.constraint_name;
