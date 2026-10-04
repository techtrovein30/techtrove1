-- =============================================================================
-- CLOSE SPORTS (DAY 1) REGISTRATION FOR INTERNAL / SIMATS PARTICIPANTS
-- =============================================================================
-- Run this in the Supabase SQL editor. It is idempotent — safe to re-run.
--
-- WHAT THIS DOES
--   Blocks NEW registrations for sports events by internal participants.
--   External participants are completely unaffected.
--
-- WHAT THIS DOES NOT DO
--   * It does NOT touch, delete or modify any registration that already exists.
--     This is a BEFORE INSERT trigger, so existing internal sports registrations
--     keep working exactly as they are — check-in, passes and certificates are
--     all unaffected.
--   * It does NOT close sports for external participants.
--   * It does NOT close Technical / Non-Technical (Day 2) events for anyone.
--
-- WHY THIS IS NEEDED IN ADDITION TO THE APP
--   The React app already rejects this in api.ts before it builds the insert,
--   but that insert is a plain PostgREST POST that anyone can replay from the
--   browser console with their own JWT. Only a database-side trigger is
--   authoritative.
--
-- SPORTS DEFINITION
--   Matches the definition already used everywhere else in this database
--   (query_fix_attendance_and_counts.sql, query_sports_unified_checkin.sql):
--       day_id = 'day-1'  OR  category starts with 'sport'
--   plus an id-prefix fallback, because some sports rows are referenced as
--   'sport-*' rather than by their events.id.
--
--   NOTE: if a Day 2 event is ever created with a category starting with
--   "Sport", it is treated as sports here too — which is already how attendance
--   and the unified sports pass treat it.
--
-- IF YOU WANT TO RE-OPEN SPORTS FOR INTERNAL PARTICIPANTS LATER
--   drop trigger if exists trg_block_internal_sports_registration
--     on public.registrations_internal;
--   drop trigger if exists trg_block_internal_sports_registration
--     on public.registrations_external;
-- =============================================================================

-- ── 1. The guard ────────────────────────────────────────────────────────────
create or replace function public.block_internal_sports_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id   text := lower(btrim(coalesce(new.event_id::text, '')));
  v_is_sport   boolean;
  v_is_internal boolean;
begin
  -- Is this row a sports registration?
  v_is_sport :=
    (v_event_id like 'sport-%')
    or exists (
      select 1
        from public.events e
       where lower(btrim(coalesce(e.id::text, ''))) = v_event_id
         and (
              coalesce(e.day_id::text, '') = 'day-1'
           or lower(coalesce(e.category::text, '')) like 'sport%'
         )
    );

  if not v_is_sport then
    return new;
  end if;

  -- Is this row an INTERNAL participant?
  --   * a row in registrations_internal is internal by definition;
  --   * a row in registrations_external could still carry an internal member in
  --     its members[] payload, so check that too and close that bypass as well.
  v_is_internal :=
    (tg_table_name = 'registrations_internal')
    or lower(coalesce(new.members::jsonb -> 0 ->> 'participantType', '')) = 'internal';

  if v_is_internal then
    raise exception
      'Sports registration is closed for SIMATS students. Please pick a Technical or Non-Technical event.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.block_internal_sports_registration() is
  'Blocks NEW sports (day-1) registrations by internal/SIMATS participants. Existing registrations are untouched.';

-- ── 2. Attach to both registration tables ──────────────────────────────────
drop trigger if exists trg_block_internal_sports_registration
  on public.registrations_internal;
create trigger trg_block_internal_sports_registration
  before insert on public.registrations_internal
  for each row execute function public.block_internal_sports_registration();

drop trigger if exists trg_block_internal_sports_registration
  on public.registrations_external;
create trigger trg_block_internal_sports_registration
  before insert on public.registrations_external
  for each row execute function public.block_internal_sports_registration();


-- =============================================================================
-- 3. VERIFY (read-only — safe to run)
-- =============================================================================
-- Confirm both triggers exist:
--
--   select tgname, tgrelid::regclass as table, tgenabled
--     from pg_trigger
--    where tgname = 'trg_block_internal_sports_registration';
--   -- expect 2 rows: registrations_internal + registrations_external
--
-- Confirm which events are treated as sports (these are now closed to internal):
--
--   select id, name, category, day_id
--     from public.events
--    where day_id = 'day-1' or lower(coalesce(category,'')) like 'sport%'
--    order by day_id, id;
--
-- EXISTING internal sports registrations that are being PRESERVED (read-only):
--
--   select count(*) as existing_internal_sports_registrations
--     from public.registrations_internal r
--    where exists (
--      select 1 from public.events e
--       where lower(btrim(coalesce(e.id::text,''))) = lower(btrim(coalesce(r.event_id::text,'')))
--         and (coalesce(e.day_id::text,'') = 'day-1'
--              or lower(coalesce(e.category::text,'')) like 'sport%')
--    );
--
-- Confirm the trigger is live with a rollback-safe test (insert is discarded):
--
--   begin;
--   -- pick a real day-1 event id and a fake user id first
--   insert into public.registrations_internal
--     (id, registration_code, user_id, event_id, team_name, captain_name,
--      payment_status, terms_accepted, members)
--   values
--     ('__trigger_test__', '__trigger_test__', gen_random_uuid(),
--      (select id from public.events where day_id = 'day-1' limit 1),
--      'Test', 'Test', 'confirmed', true, '[]'::jsonb);
--   -- EXPECT: ERROR  Sports registration is closed for SIMATS students...
--   rollback;
-- =============================================================================
