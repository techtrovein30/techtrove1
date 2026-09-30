-- ============================================================================
-- Coordinator-Based QR Attendance System Migration
-- ----------------------------------------------------------------------------
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- Safe to re-run: every statement is idempotent, and this is an UPGRADE of a
-- script that has already been applied - it never drops or renames a column,
-- so existing coordinator and attendance rows are preserved.
--
-- WHAT THIS VERSION FIXES
-- -----------------------
-- 1. mark_event_attendance THREW on every single call. The participant tables
--    (internal_participants / external_participants) and registration_members
--    store `id` / `user_id` as uuid, but the function compared them with
--    `v_uid::text`:
--        select full_name from public.internal_participants where id = v_uid::text
--    -> ERROR: operator does not exist: uuid = text
--    CREATE FUNCTION does not resolve this at install time (PL/pgSQL compiles
--    the body lazily), so the script installed cleanly and the RPC has never
--    worked in production. Every comparison below is now cast on the right
--    side for the table it touches.
--
-- 2. Registration was matched on `registration_members.user_id`, which is the
--    registration OWNER, not the member being checked in. A team captain
--    scanning the QR satisfied the check for their whole team. Membership is
--    now matched on the member's own email only.
--
-- 3. `attendance` had an `FOR ALL TO authenticated USING (is_admin())` policy,
--    which let any admin client insert or delete attendance rows directly and
--    bypass every check in the RPC. Attendance is now read-only to the client;
--    every write goes through a SECURITY DEFINER function.
--
-- 4. There was no payment gate. Attendance is now refused for registrations
--    that are not payment-verified (reason: not_paid), matching the legacy
--    check-in flow.
--
-- 5. `events.attendance_token` was added as `add column if not exists ...
--    unique`. If the column already existed, the UNIQUE was silently skipped on
--    every re-run. There is now an explicitly named unique index.
--
-- 6. `event_coordinators.user_id` was NOT NULL, so a coordinator could not be
--    appointed until they had already signed in. It is now nullable: an admin
--    can appoint by email and the link is claimed on first sign-in.
--
-- 7. There was no way to close attendance independently of registration. A
--    dedicated `events.attendance_open` flag now controls it.
-- ============================================================================


-- === 1. Event attendance token ==============================================

alter table public.events
  add column if not exists attendance_token text;

-- Backfill for any event that never received one.
update public.events
   set attendance_token = lower(replace(gen_random_uuid()::text, '-', ''))
 where attendance_token is null;

-- Set default for future inserts.
alter table public.events
  alter column attendance_token set default lower(replace(gen_random_uuid()::text, '-', ''));

-- Repair anything the old, looser script could have left behind BEFORE creating
-- the constraints below. Two ways that happens:
--
--   a) an event whose token was written by hand, or by an older build that used
--      a shorter format - `mark_event_attendance` would then reject it forever
--      and the coordinator would be stuck with an unscanable code;
--   b) two events sharing a token - created before the unique index existed, or
--      by a client-side upsert that raced. Both QRs would mark attendance in
--      whichever event the RPC happened to find first.
--
-- Rewriting a bad token is safe: the old value never successfully scanned,
-- because the RPC has always required a match in events.attendance_token.
-- Reissuing a duplicated one invalidates only the printed code for that event,
-- which the coordinator can re-display immediately.
do $$
declare
  v_row record;
begin
  -- (a) malformed values
  for v_row in
    select id, attendance_token
      from public.events
     where attendance_token is not null
       and attendance_token !~ '^[0-9a-f]{32}$'
  loop
    raise notice 'reissuing malformed attendance token for event %', v_row.id;
    update public.events
       set attendance_token = lower(replace(gen_random_uuid()::text, '-', ''))
     where id = v_row.id;
  end loop;

  -- (b) duplicates: keep the earliest event's token, reissue the rest. Ordered
  -- by creation so the choice is deterministic across re-runs.
  for v_row in
    select id, row_number() over (order by created_at nulls last, id) as rn
      from public.events
     where attendance_token is not null
  loop
    continue when v_row.rn = 1;
    if (select count(*) from public.events e
         where e.attendance_token = (select attendance_token from public.events where id = v_row.id)) > 1 then
      raise notice 'reissuing duplicated attendance token for event %', v_row.id;
      update public.events
         set attendance_token = lower(replace(gen_random_uuid()::text, '-', ''))
       where id = v_row.id;
    end if;
  end loop;
end $$;

-- Explicit named indexes instead of inline UNIQUE, so a re-run against a
-- database where the column already exists still ends up with the guarantee.
-- A fixed-width alphabet cannot collide by accident, and two events sharing a
-- code would let one event's QR mark attendance in the other.
create unique index if not exists events_attendance_token_key
  on public.events (attendance_token)
  where attendance_token is not null;

-- Only ever a value the server issued. The client-side extractor applies the
-- same shape, so a malformed token cannot reach the RPC at all.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_attendance_token_format'
  ) then
    alter table public.events
      add constraint events_attendance_token_format
      check (attendance_token is null or attendance_token ~ '^[0-9a-f]{32}$');
  end if;
end $$;

-- Dedicated attendance switch. Closing registrations no longer has to double as
-- closing attendance; attendance_open defaults to true, which preserves the
-- current behaviour for every existing event.
alter table public.events
  add column if not exists attendance_open boolean not null default true;


-- === 2. Event Coordinators table =============================================
-- Enforces: ONE main coordinator per event via UNIQUE(event_id)
create table if not exists public.event_coordinators (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null references public.events(id) on delete cascade,
  user_id     text,
  name        text not null,
  email       text not null,
  mobile      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint event_coordinators_event_id_unique unique (event_id)
);

-- CREATE TABLE IF NOT EXISTS is a no-op when the deployed table already exists,
-- so every column added below has to be added explicitly too. Without this,
-- updated_at stays missing on an upgraded database and the upserts in
-- admin_assign_event_coordinator / claim_coordinator_links() fail at runtime with
-- `column "updated_at" of relation "event_coordinators" does not exist` - a
-- failure that only shows up when somebody assigns a coordinator, not when this
-- script is run.
alter table public.event_coordinators
  add column if not exists updated_at timestamptz not null default now();

-- Loosening a NOT NULL is always safe: existing rows keep their value, and an
-- admin can now appoint someone by email before they have ever signed in. The
-- RLS policies below match on email, so the coordinator is recognised the moment
-- they sign in, and claim_coordinator_links() pins the user_id down afterwards.
alter table public.event_coordinators
  alter column user_id drop not null;

create index if not exists event_coordinators_user_id_idx
  on public.event_coordinators (user_id);
create index if not exists event_coordinators_email_idx
  on public.event_coordinators (lower(email));

-- Enable RLS
alter table public.event_coordinators enable row level security;

-- Admin SELECT. Writes are deliberately NOT permitted here: they go through
-- admin_assign_event_coordinator / admin_remove_event_coordinator, which is the
-- only place the "one coordinator per event" rule and the validation live.
drop policy if exists "coordinators_admin_all" on public.event_coordinators;
drop policy if exists "coordinators_admin_read" on public.event_coordinators;
create policy "coordinators_admin_read" on public.event_coordinators
  for select to authenticated
  using (public.is_admin());

-- Coordinators read their own row. Matched on user_id when known, otherwise on
-- the email they were appointed with.
drop policy if exists "coordinators_self_read" on public.event_coordinators;
create policy "coordinators_self_read" on public.event_coordinators
  for select to authenticated
  using (
    (user_id is not null and user_id = auth.uid()::text)
    or lower(btrim(email)) = public.current_user_email()
  );


-- === 3. Dedicated Attendance table ==========================================
-- Enforces: ONE attendance record per participant per event via UNIQUE(event_id, participant_id)
create table if not exists public.attendance (
  id                uuid primary key default gen_random_uuid(),
  event_id          text not null references public.events(id) on delete cascade,
  participant_id    text not null,
  participant_email text not null,
  participant_name  text,
  registration_id   text,
  registration_code text,
  marked_at         timestamptz not null default now(),
  status            text not null default 'present',
  source            text not null default 'qr',
  constraint attendance_event_participant_unique unique (event_id, participant_id)
);

-- `source` distinguishes a self-service QR scan from a coordinator marking
-- somebody in by hand, which registration_members.attended_source alone cannot
-- do once a scan and a manual mark would write the same string.
alter table public.attendance
  add column if not exists source text not null default 'qr';

create index if not exists attendance_event_id_idx
  on public.attendance (event_id);
create index if not exists attendance_participant_id_idx
  on public.attendance (participant_id);
create index if not exists attendance_marked_at_idx
  on public.attendance (marked_at desc);

-- Enable RLS
alter table public.attendance enable row level security;

-- READ-ONLY for every client. There is deliberately NO insert/update/delete
-- policy: all writes go through the SECURITY DEFINER functions below, which is
-- where the authentication, registration, payment and duplicate checks live, in
-- one reviewable place. An insert policy keyed on auth.uid() would still be
-- bypassable for event_id, which is exactly the input that must not be
-- client-controlled.
drop policy if exists "attendance_admin_all" on public.attendance;
drop policy if exists "attendance_admin_read" on public.attendance;
create policy "attendance_admin_read" on public.attendance
  for select to authenticated
  using (public.is_admin());

-- Coordinators can read attendance records for their assigned event.
drop policy if exists "attendance_coordinator_read" on public.attendance;
create policy "attendance_coordinator_read" on public.attendance
  for select to authenticated
  using (
    exists (
      select 1 from public.event_coordinators ec
       where ec.event_id = attendance.event_id
         and (
           (ec.user_id is not null and ec.user_id = auth.uid()::text)
           or lower(btrim(ec.email)) = public.current_user_email()
         )
    )
  );

-- Participants can read only their own attendance records.
drop policy if exists "attendance_participant_read" on public.attendance;
create policy "attendance_participant_read" on public.attendance
  for select to authenticated
  using (
    participant_id = auth.uid()::text
    or lower(btrim(participant_email)) = public.current_user_email()
  );


-- === 4. Keep the existing check-in roster in step ============================
-- registration_members.attended drives the /wasd4381/checkin roster and the
-- certificate_* columns, so a scan has to land there too. Doing it in a trigger
-- rather than in the RPC means every write path stays consistent, including the
-- manual mark below.
--
-- AFTER INSERT rather than ON UPDATE: `status` is immutable in this system, so
-- the row is only ever added, never edited.
create or replace function public.attendance_sync_registration_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registration_members rm
     set attended        = true,
         attended_at     = new.marked_at,
         attended_source = new.source,
         updated_at      = now()
   where rm.event_id = new.event_id
     and lower(btrim(rm.email)) = lower(btrim(new.participant_email));
  return new;
end;
$$;

drop trigger if exists attendance_sync_registration_member on public.attendance;
create trigger attendance_sync_registration_member
  after insert on public.attendance
  for each row execute function public.attendance_sync_registration_member();


-- === 5. RPC: mark_event_attendance ===========================================
-- Marks attendance when a student scans the event QR the coordinator displays.
--
-- The client sends NOTHING but the token. Both the event and the participant are
-- derived server-side:
--   event_id       <- looked up from the token
--   participant_id <- auth.uid()
-- A caller therefore cannot mark attendance for somebody else, or in an event
-- they were not admitted to, by editing a request.
--
-- Returns jsonb. `ok: false` with `reason: 'already_attended'` is the expected
-- response to a second scan and is rendered by the UI as a success ("you were
-- already marked in at HH:MM"), not an error.
create or replace function public.mark_event_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_token      text := lower(btrim(coalesce(p_token, '')));
  v_email      text;
  v_user_name  text;
  v_event      record;
  v_member     record;
  v_existing   record;
  v_reg_code   text;
  v_reg_id     text;
  v_now        timestamptz := now();
begin
  -- 0. Authentication. No user, no attendance. Checked before the token is even
  --    looked at, so a logged-out scan cannot be used to probe which tokens are
  --    real: every one of them answers not_logged_in.
  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_logged_in',
      'message', 'Please login to mark attendance.'
    );
  end if;

  -- 1. Token shape. Anything that is not exactly 32 hex chars was never issued
  --    by us and never reaches the events lookup.
  if v_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_qr',
      'message', '❌ Invalid attendance QR.'
    );
  end if;

  v_email := public.current_user_email();

  -- Resolve the caller's own name. NOTE the cast direction: internal_participants.id
  -- is uuid, so it is compared against v_uid (uuid), NOT v_uid::text. Comparing
  -- a uuid column to text is the error that broke the previous version of this
  -- function on every call.
  select t.full_name into v_user_name
    from (
      select full_name from public.internal_participants where id = v_uid
      union all
      select full_name from public.external_participants where id = v_uid
    ) t
   limit 1;

  if v_user_name is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_profile',
      'message', '❌ No participant profile found for your account.'
    );
  end if;

  -- 2. Token -> event. The event id is DERIVED here; it is never an input.
  select e.id, e.name, e.attendance_open, e.registration_open
    into v_event
    from public.events e
   where e.attendance_token = v_token
   limit 1;

  if v_event.id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_qr',
      'message', '❌ Invalid attendance QR.'
    );
  end if;

  -- 3. Availability. attendance_open is the dedicated switch; registration_open
  --    still closes the door too, which is what it did before.
  if coalesce(v_event.attendance_open, true) is not true
     or coalesce(v_event.registration_open, true) is false then
    return jsonb_build_object(
      'ok', false,
      'reason', 'event_disabled',
      'message', '❌ Attendance is currently unavailable for this event.'
    );
  end if;

  -- 4. Is this person on the roster for THIS event?
  --    Matched on the member's own email only. registration_members.user_id is
  --    the registration OWNER, so matching on it let a team captain's scan
  --    stand in for every member of their team.
  select m.*
    into v_member
    from public.registration_members m
   where m.event_id = v_event.id
     and lower(btrim(m.email)) = v_email
   limit 1;

  if v_member.id is null then
    -- Fall back to a direct registration by this account.
    select r.id, r.registration_code
      into v_reg_id, v_reg_code
      from public.registrations_internal r
     where r.event_id = v_event.id and r.user_id = v_uid
     union all
    select r.id, r.registration_code
      from public.registrations_external r
     where r.event_id = v_event.id and r.user_id = v_uid
     limit 1;

    if v_reg_id is null then
      return jsonb_build_object(
        'ok', false,
        'reason', 'not_registered',
        'message', '❌ You are not registered for this event.'
      );
    end if;

    v_user_name := coalesce(v_user_name, v_email);
  else
    v_reg_id     := v_member.registration_id;
    v_reg_code   := v_member.registration_code;
    v_user_name  := coalesce(v_member.member_name, v_user_name);
  end if;

  -- 5. Payment gate, using the same helper the legacy check-in flow uses. Only
  --    enforced when we actually have a registration code to check.
  if v_reg_code is not null and not public.checkin_code_is_paid(v_reg_code) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_paid',
      'message', '❌ Your registration payment is not confirmed for this event.'
    );
  end if;

  -- 6. Duplicate. participant_id is text on this table, so auth.uid() is cast
  --    here - this is the one place the text cast is correct.
  select a.id, a.marked_at
    into v_existing
    from public.attendance a
   where a.event_id = v_event.id
     and a.participant_id = v_uid::text
   limit 1;

  if v_existing.id is not null then
    -- Idempotent: report the ORIGINAL time and write nothing. `ok` stays false so
    -- the UI renders its dedicated "already marked" branch, which shows when.
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_attended',
      'message', '✓ Attendance already marked for this event.',
      'marked_at', v_existing.marked_at,
      'event_name', v_event.name,
      'event_id', v_event.id
    );
  end if;

  -- The legacy check-in path may have marked this person before the QR system
  -- existed. Honour it instead of creating a second record.
  if v_member.attended is true then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_attended',
      'message', '✓ Attendance already marked for this event.',
      'marked_at', coalesce(v_member.attended_at, v_now),
      'event_name', v_event.name,
      'event_id', v_event.id
    );
  end if;

  -- 7. Mark attendance. registration_members is updated by the trigger.
  insert into public.attendance (
    event_id,
    participant_id,
    participant_email,
    participant_name,
    registration_id,
    registration_code,
    marked_at,
    status,
    source
  ) values (
    v_event.id,
    v_uid::text,
    v_email,
    v_user_name,
    v_reg_id,
    v_reg_code,
    v_now,
    'present',
    'qr'
  )
  on conflict (event_id, participant_id) do nothing;

  -- on conflict do nothing can swallow a genuine duplicate that raced us between
  -- the check above and the insert, so confirm the row really landed before
  -- claiming success.
  select a.marked_at
    into v_now
    from public.attendance a
   where a.event_id = v_event.id
     and a.participant_id = v_uid::text
   limit 1;

  if v_now is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'error',
      'message', '❌ Could not record attendance. Please try again.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', 'success',
    'message', '✅ Attendance Marked Successfully',
    'event_name', v_event.name,
    'event_id', v_event.id,
    'marked_at', v_now
  );
end;
$$;

grant execute on function public.mark_event_attendance(text) to authenticated;


-- === 6. RPC: admin_assign_event_coordinator =================================
-- Assign, or change, the ONE main coordinator for an event. Exists so that the
-- admin page never writes to event_coordinators directly, which is what allowed
-- an unvalidated upsert from the client.
create or replace function public.admin_assign_event_coordinator(
  p_event_id text,
  p_name     text,
  p_email    text,
  p_mobile   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_event record;
  v_row   record;
  v_uid   uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name',
      'message', 'Coordinator name is required.');
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email',
      'message', 'A valid coordinator email is required.');
  end if;

  select e.id into v_event from public.events e where e.id = p_event_id;

  if v_event.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event',
      'message', 'That event does not exist.');
  end if;

  -- Resolve the coordinator to a real participant if they already have an
  -- account. `id` is uuid on both participant tables.
  select t.id into v_uid
    from (
      select p.id from public.internal_participants p where lower(btrim(p.email)) = v_email
      union all
      select p.id from public.external_participants p where lower(btrim(p.email)) = v_email
    ) t
   limit 1;

  -- Upsert on event_id, so "assign" and "change" are the same statement and an
  -- event can never briefly hold two coordinators.
  insert into public.event_coordinators (event_id, user_id, name, email, mobile)
  values (p_event_id, v_uid::text, v_name, v_email, coalesce(btrim(p_mobile), ''))
  on conflict (event_id) do update
    set user_id    = excluded.user_id,
        name       = excluded.name,
        email      = excluded.email,
        mobile     = excluded.mobile,
        updated_at = now()
  returning id, user_id, name, email, mobile into v_row;

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'event_id', p_event_id,
    'coordinator', jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'name', v_row.name,
      'email', v_row.email,
      'mobile', v_row.mobile
    )
  );
end;
$$;

grant execute on function public.admin_assign_event_coordinator(text, text, text, text) to authenticated;


-- === 7. RPC: admin_remove_event_coordinator =================================
create or replace function public.admin_remove_event_coordinator(p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  delete from public.event_coordinators ec where ec.event_id = p_event_id;

  return jsonb_build_object('ok', true, 'reason', 'ok', 'event_id', p_event_id);
end;
$$;

grant execute on function public.admin_remove_event_coordinator(text) to authenticated;


-- === 8. RPC: admin_set_event_attendance_open ================================
-- Open or close attendance for an event without touching registration_open.
create or replace function public.admin_set_event_attendance_open(
  p_event_id text,
  p_open     boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open boolean;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  update public.events e
     set attendance_open = coalesce(p_open, false)
   where e.id = p_event_id
  returning e.attendance_open into v_open;

  if v_open is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event',
      'message', 'That event does not exist.', 'open', false);
  end if;

  return jsonb_build_object('ok', true, 'reason', 'ok',
    'event_id', p_event_id, 'open', v_open);
end;
$$;

grant execute on function public.admin_set_event_attendance_open(text, boolean) to authenticated;


-- === 8b. Authorisation helpers ==============================================

/**
 * Does the caller coordinate this specific event?
 *
 * Matched on user_id when it is known, otherwise on the email they were
 * appointed with - so a coordinator appointed before they ever signed in is
 * recognised the moment they do. An admin is NOT a coordinator of anything;
 * is_event_admin() is the union, and every caller uses that one.
 */
create or replace function public.is_event_coordinator(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
        from public.event_coordinators ec
       where ec.event_id = p_event_id
         and (
           (ec.user_id is not null and ec.user_id = auth.uid()::text)
           or lower(btrim(ec.email)) = public.current_user_email()
         )
    );
$$;

grant execute on function public.is_event_coordinator(text) to authenticated;

/** Admin, or the coordinator of THIS event. */
create or replace function public.is_event_admin(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_event_coordinator(p_event_id);
$$;

grant execute on function public.is_event_admin(text) to authenticated;


-- === 9. RPC: admin_mark_event_attendance ====================================
-- Manual override: mark somebody present who is not holding a camera, or undo a
-- mistaken mark. Gated on is_event_admin so a coordinator can manage their own
-- event and nothing else.
create or replace function public.admin_mark_event_attendance(
  p_event_id       text,
  p_participant_id text,
  p_attended       boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_name   text;
  v_code   text;
  v_marked timestamptz;
begin
  -- Event-scoped authorisation, and nothing above it. A separate `is_admin()`
  -- gate here would reject every coordinator before this check ran, which is the
  -- opposite of what an event-scoped override is for.
  if not exists (
    select 1 from public.events e
     where e.id = p_event_id
       and (public.is_admin() or public.is_event_coordinator(p_event_id))
  ) then
    raise exception 'Not authorised';
  end if;

  -- Resolve the participant from their own record; the caller's email is never
  -- trusted as the identity being marked.
  select t.email, t.full_name
    into v_email, v_name
    from (
      select p.email, p.full_name from public.internal_participants p
       where p.id::text = p_participant_id
      union all
      select p.email, p.full_name from public.external_participants p
       where p.id::text = p_participant_id
    ) t
   limit 1;

  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'not_registered',
      'message', 'No participant found with that ID.');
  end if;

  select m.registration_code into v_code
    from public.registration_members m
   where m.event_id = p_event_id
     and lower(btrim(m.email)) = v_email
   limit 1;

  if coalesce(p_attended, false) then
    insert into public.attendance (
      event_id, participant_id, participant_email, participant_name,
      registration_code, marked_at, status, source
    ) values (
      p_event_id, p_participant_id, v_email, v_name, v_code, now(), 'present', 'manual'
    )
    on conflict (event_id, participant_id) do update
      set marked_at = public.attendance.marked_at
    returning public.attendance.marked_at into v_marked;

    return jsonb_build_object('ok', true, 'reason', 'ok',
      'event_id', p_event_id, 'participant_id', p_participant_id, 'marked_at', v_marked);
  end if;

  -- Undo. The sync trigger only fires on INSERT, so the roster is reset here in
  -- the same transaction to keep the two tables in step.
  delete from public.attendance a
   where a.event_id = p_event_id and a.participant_id = p_participant_id;

  update public.registration_members rm
     set attended        = false,
         attended_at     = null,
         attended_source = null,
         updated_at      = now()
   where rm.event_id = p_event_id
     and lower(btrim(rm.email)) = v_email;

  return jsonb_build_object('ok', true, 'reason', 'ok',
    'event_id', p_event_id, 'participant_id', p_participant_id, 'marked_at', null);
end;
$$;

grant execute on function public.admin_mark_event_attendance(text, text, boolean) to authenticated;


-- === 10. RPC: claim_coordinator_links =======================================
-- Pins user_id on first sign-in for a coordinator appointed by email before they
-- had an account. Best-effort and safe to call on every load.
create or replace function public.claim_coordinator_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.event_coordinators ec
     set user_id = p.id::text, updated_at = now()
    from (
      select id from public.internal_participants
       where lower(btrim(email)) = public.current_user_email()
      union all
      select id from public.external_participants
       where lower(btrim(email)) = public.current_user_email()
    ) p
   where ec.user_id is null
     and lower(btrim(ec.email)) = public.current_user_email();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.claim_coordinator_links() to authenticated;


-- === 11. Enable Realtime Replication =========================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_coordinators'
  ) then
    alter publication supabase_realtime add table public.event_coordinators;
  end if;
exception when others then
  -- Ignore if publication does not exist or already contains table
end $$;


-- === 12. Verification (read-only) ============================================
-- Run this after applying the script. Every row should be zero.
--
-- select 'events_with_bad_token' as check, count(*)::text as found from public.events
--  where attendance_token is null or attendance_token !~ '^[0-9a-f]{32}$'
-- union all
-- select 'attendance_without_source', count(*)::text from public.attendance where source is null
-- union all
-- select 'coordinators_without_email', count(*)::text
--   from public.event_coordinators where lower(btrim(email)) = ''
-- union all
-- select 'duplicate_event_coordinators', count(*)::text from (
--   select event_id from public.event_coordinators group by event_id having count(*) > 1
-- ) d;
