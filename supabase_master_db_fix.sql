-- ============================================================================
-- TechTrove 3.0: Unified Master Database Fix & Security Migration
-- ============================================================================
-- RUN THIS ENTIRE SCRIPT in Supabase Dashboard -> SQL Editor -> New Query.
--
-- This script is completely IDEMPOTENT (safe to run multiple times).
-- It resolves all database errors including:
--   1. "relation public.event_coordinators does not exist"
--   2. "function public.is_admin() does not exist"
--   3. "function public.checkin_code_is_paid(text) does not exist"
--   4. "column utr_number does not exist" in check_utr_exists
--   5. Missing coordinator RPCs (admin_assign_event_coordinator, etc.)
--   6. Missing email_outbox & email_queue_control tables & RPCs
--   7. OAuth login fallback for existing admins (role='admin')
--   8. Row-Level Security & Storage Bucket permissions
-- ============================================================================

-- ─── 0. EXTENSIONS & PREREQUISITES ──────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ─── 1. BASE TABLES & CORE SCHEMAS ──────────────────────────────────────────

-- 1A. admin_allowlist
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- 1B. events & days prerequisites (ensure columns exist)
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'events') then
    raise notice 'Table public.events does not exist yet. Please ensure core events schema is created.';
  end if;
end $$;

alter table public.events
  add column if not exists created_at timestamptz default now(),
  add column if not exists attendance_token text,
  add column if not exists attendance_open boolean not null default true;

-- Synchronize attendance_token for all events with verified 32-hex QR card tokens
-- Day 1: Unified Sports Master Pass token (all sports share this token)
update public.events
   set attendance_token = 'ba31a6b79aa1bf173badbd6f62236556'
 where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%';

-- Day 2: Technical Events
update public.events set attendance_token = 'c2d785c6556130288b23bc5930e0c897' where id = 'hackathon' or lower(name) like '%hackathon%';
update public.events set attendance_token = '290956874150306ca19811783dc6e939' where id = 'debugging' or lower(name) like '%debugging%';
update public.events set attendance_token = 'a40b6e47c70ce8a2da3cb7868cc01327' where id = 'paper-presentation' or lower(name) like '%paper%presentation%';
update public.events set attendance_token = 'd343f64181baadd8c18d1445e5f5dcc9' where id = 'tech-maze' or lower(name) like '%maze%';
update public.events set attendance_token = '598f2afc0c67c72c24c7313e0734daba' where id = 'quiz' or lower(name) like '%quiz%';

-- Day 2: Non-Technical Events
update public.events set attendance_token = '048c0b5cea0eb38ab212c9897ad107ff' where id = 'dance' or lower(name) like '%dance%';
update public.events set attendance_token = '3b872130193c85708506bc2d8bbc1fb0' where id = 'singing' or lower(name) like '%singing%';
update public.events set attendance_token = '20575a9e9755fc64694258c938f8c1dc' where id = 'gaming' or lower(name) like '%gaming%';
update public.events set attendance_token = '3cc0ccc344defb6d48a3b5b59ec6bc88' where id = 'ramp-walk' or lower(name) like '%ramp%';
update public.events set attendance_token = '42afcf562a175493cf013832357b9b48' where id = 'treasure-hunt' or lower(name) like '%treasure%';
update public.events set attendance_token = '4582ab70dce31f3dc148e2893284532e' where id = 'connexion' or lower(name) like '%connexion%';
update public.events set attendance_token = 'b4b2fec065183af2ea1afaefa2a1d1ea' where id = 'adaptune' or lower(name) like '%adaptune%';
update public.events set attendance_token = '7df7ca111c8fb6ebc37bed39fa5bf19e' where id = 'tunetopia' or lower(name) like '%tunetopia%';
update public.events set attendance_token = '487449ffe383208b37ebb6ea11a0586d' where id = 'logo-making' or lower(name) like '%logo%';

-- Fallback for any other custom events without token
update public.events
   set attendance_token = lower(replace(gen_random_uuid()::text, '-', ''))
 where attendance_token is null;

drop index if exists public.events_attendance_token_key;
create index if not exists events_attendance_token_idx
  on public.events (attendance_token)
  where attendance_token is not null;

-- 1C. event_coordinators
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

-- Ensure nullable user_id and updated_at column
alter table public.event_coordinators
  alter column user_id drop not null;
alter table public.event_coordinators
  add column if not exists updated_at timestamptz not null default now();

create index if not exists event_coordinators_user_id_idx on public.event_coordinators (user_id);
create index if not exists event_coordinators_email_idx on public.event_coordinators (lower(email));

-- 1D. attendance
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

create index if not exists attendance_event_id_idx on public.attendance (event_id);
create index if not exists attendance_participant_id_idx on public.attendance (participant_id);
create index if not exists attendance_marked_at_idx on public.attendance (marked_at desc);

-- 1E. checkin_tokens & checkin_log
create table if not exists public.checkin_tokens (
  email            text primary key check (email = lower(email)),
  token            text        not null unique default replace(gen_random_uuid()::text, '-', ''),
  display_name     text,
  participant_type text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  revoked_at       timestamptz
);

create index if not exists checkin_tokens_token_idx on public.checkin_tokens (token);

create table if not exists public.checkin_log (
  id               uuid primary key default gen_random_uuid(),
  email            text        not null,
  display_name     text,
  participant_type text,
  source           text        not null default 'qr' check (source in ('qr', 'manual')),
  members_checked  integer     not null default 0,
  members_total    integer     not null default 0,
  already_attended integer     not null default 0,
  admin_id         uuid,
  admin_email      text,
  created_at       timestamptz not null default now()
);

-- 1F. payment_ledger & admin_delete_audit
create table if not exists public.payment_ledger (
  id                bigint generated always as identity primary key,
  registration_code text not null unique,
  amount            numeric not null default 0,
  team_name         text,
  utr               text,
  recorded_by       uuid,
  recorded_at       timestamptz not null default now()
);

create table if not exists public.admin_delete_audit (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      text not null,
  snapshot    jsonb not null,
  deleted_by  uuid,
  deleted_at  timestamptz not null default now()
);

-- 1G. email_outbox & email_queue_control
create table if not exists public.email_outbox (
  id                  bigint generated always as identity primary key,
  registration_code   text not null,
  kind                text not null default 'confirmation',
  status              text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  recipient_email     text,
  recipient_name      text,
  team_name           text,
  captain_name        text,
  event_refs          text[],
  event_names         text[],
  total_fee           numeric not null default 0,
  attempts            integer not null default 0,
  last_error          text,
  claimed_at          timestamptz,
  sent_at             timestamptz,
  provider_message_id text,
  next_attempt_at     timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists email_outbox_status_idx on public.email_outbox (status, created_at desc);

create table if not exists public.email_queue_control (
  id         boolean primary key default true,
  paused     boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint single_row_control check (id = true)
);

insert into public.email_queue_control (id, paused)
values (true, false)
on conflict (id) do nothing;

-- 1H. Ensure missing columns on registration and participant tables
alter table public.registrations_internal
  add column if not exists utr_number text;

alter table public.registrations_external
  add column if not exists utr_number text,
  add column if not exists payment_screenshot_path text,
  add column if not exists payment_screenshot_url text,
  add column if not exists payment_review_note text;

alter table public.registration_members
  add column if not exists attended boolean default false,
  add column if not exists attended_at timestamptz,
  add column if not exists attended_source text,
  add column if not exists college text,
  add column if not exists updated_at timestamptz default now();

-- ─── 2. CORE SECURITY & AUTH HELPER FUNCTIONS ───────────────────────────────

-- 2A. is_admin()
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.admin_allowlist a
     where lower(a.email) = lower(btrim(auth.jwt() ->> 'email'))
  ) or exists (
    select 1
      from (
        select email, role from public.internal_participants where id = auth.uid()
        union all
        select email, role from public.external_participants where id = auth.uid()
      ) p
     where p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- 2B. current_user_email()
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(
    nullif(btrim(auth.jwt() ->> 'email'), ''),
    (select email from public.internal_participants where id = auth.uid()),
    (select email from public.external_participants where id = auth.uid())
  ));
$$;

grant execute on function public.current_user_email() to authenticated, anon;

-- 2C. checkin_code_is_paid()
create or replace function public.checkin_code_is_paid(p_registration_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.registrations_internal ri
       where ri.registration_code = p_registration_code
    )
    or coalesce((
      select bool_and(coalesce(re.payment_status = 'recorded', false))
        from public.registrations_external re
       where re.registration_code = p_registration_code
    ), false);
$$;

grant execute on function public.checkin_code_is_paid(text) to authenticated, anon;

-- 2D. is_event_coordinator(p_event_id)
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

-- 2E. is_event_admin(p_event_id)
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

-- 2F. ensure_admin_access()
drop function if exists public.ensure_admin_access();
create or replace function public.ensure_admin_access()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(auth.jwt() ->> 'email'));
  v_uid   uuid := auth.uid();
  v_is_allowlisted boolean := false;
  v_is_existing_admin boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  if v_email is not null then
    select exists (
      select 1 from public.admin_allowlist a where lower(btrim(a.email)) = v_email
    ) into v_is_allowlisted;
  end if;

  select exists (
    select 1 from public.internal_participants where id = v_uid and role = 'admin'
    union all
    select 1 from public.external_participants where id = v_uid and role = 'admin'
  ) into v_is_existing_admin;

  if v_is_allowlisted then
    update public.internal_participants set role = 'admin' where id = v_uid;
    update public.external_participants set role = 'admin' where id = v_uid;
    return true;
  end if;

  if v_is_existing_admin then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.ensure_admin_access() to authenticated;

-- 2G. username_is_taken(p_username)
drop function if exists public.username_is_taken(text);
create or replace function public.username_is_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.internal_participants where lower(btrim(username)) = lower(btrim(p_username))
    union all
    select 1 from public.external_participants where lower(btrim(username)) = lower(btrim(p_username))
  );
$$;

grant execute on function public.username_is_taken(text) to anon, authenticated;

-- 2H. check_utr_exists(p_utr, p_exclude_code)
drop function if exists public.check_utr_exists(text, text);
drop function if exists public.check_utr_exists(text);
create or replace function public.check_utr_exists(
  p_utr text,
  p_exclude_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := btrim(lower(p_utr));
  v_exclude text := nullif(btrim(p_exclude_code), '');
begin
  if v_clean is null or length(v_clean) < 4 then
    return false;
  end if;

  return exists (
    select 1
      from public.registrations_external
     where btrim(lower(utr_number)) = v_clean
       and (v_exclude is null or registration_code <> v_exclude)
  ) or exists (
    select 1
      from public.registrations_internal
     where utr_number is not null
       and btrim(lower(utr_number)) = v_clean
       and (v_exclude is null or registration_code <> v_exclude)
  );
end;
$$;

grant execute on function public.check_utr_exists(text, text) to anon, authenticated, service_role;

-- 2I. Profile self-update RPCs
drop function if exists public.update_own_full_name(text);
create or replace function public.update_own_full_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_full_name, ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if length(v_name) < 2 then
    raise exception 'Full name must be at least 2 characters';
  end if;

  update public.internal_participants set full_name = v_name where id = v_uid;
  update public.external_participants set full_name = v_name where id = v_uid;
end;
$$;

grant execute on function public.update_own_full_name(text) to authenticated;

drop function if exists public.update_own_college(text);
create or replace function public.update_own_college(p_college text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_college text := btrim(coalesce(p_college, ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if length(v_college) < 2 then
    raise exception 'College name must be at least 2 characters';
  end if;

  update public.internal_participants set college = v_college where id = v_uid;
  update public.external_participants set college = v_college where id = v_uid;
end;
$$;

grant execute on function public.update_own_college(text) to authenticated;

-- 2J. participant_update_screenshot
drop function if exists public.participant_update_screenshot(uuid, text);
drop function if exists public.participant_update_screenshot(uuid, text, text);
drop function if exists public.participant_update_screenshot(text, text);
drop function if exists public.participant_update_screenshot(text, text, text);

create or replace function public.participant_update_screenshot(
  p_registration_id text,
  p_screenshot_path text,
  p_utr_number text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_utr   text := nullif(btrim(p_utr_number), '');
  v_code  text;
  v_dup   text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select registration_code
    into v_code
    from public.registrations_external
   where id = p_registration_id
     and user_id::text = v_uid::text
   limit 1;

  if v_code is null then
    raise exception 'Registration not found or access denied';
  end if;

  if v_utr is not null then
    select registration_code
      into v_dup
      from public.registrations_external
     where btrim(lower(utr_number)) = lower(v_utr)
       and registration_code <> v_code
     limit 1;

    if v_dup is not null then
      raise exception 'This UTR / Transaction ID has already been submitted for registration %', v_dup;
    end if;
  end if;

  update public.registrations_external
     set payment_screenshot_path = p_screenshot_path,
         payment_screenshot_url  = p_screenshot_path,
         utr_number              = coalesce(v_utr, utr_number),
         payment_status          = 'pending',
         payment_review_note     = null
   where registration_code = v_code;
end;
$$;

grant execute on function public.participant_update_screenshot(text, text, text) to authenticated;

-- ─── 3. COORDINATOR & ATTENDANCE RPCS ───────────────────────────────────────

-- 3A. get_event_attendance_token(p_event_id)
drop function if exists public.get_event_attendance_token(text);
create or replace function public.get_event_attendance_token(p_event_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_event_admin(p_event_id) then
    raise exception 'Not authorised';
  end if;

  select attendance_token into v_token
    from public.events
   where id = p_event_id;

  if v_token is null or v_token !~ '^[0-9a-f]{32}$' then
    v_token := lower(replace(gen_random_uuid()::text, '-', ''));
    update public.events set attendance_token = v_token where id = p_event_id;
  end if;

  return v_token;
end;
$$;

grant execute on function public.get_event_attendance_token(text) to authenticated;

-- 3B. admin_assign_event_coordinator
drop function if exists public.admin_assign_event_coordinator(text, text, text, text);
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

  select t.id into v_uid
    from (
      select p.id from public.internal_participants p where lower(btrim(p.email)) = v_email
      union all
      select p.id from public.external_participants p where lower(btrim(p.email)) = v_email
    ) t
   limit 1;

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

-- 3C. admin_remove_event_coordinator
drop function if exists public.admin_remove_event_coordinator(text);
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

-- 3D. admin_set_event_attendance_open
drop function if exists public.admin_set_event_attendance_open(text, boolean);
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

-- 3E. mark_event_attendance (Self-service scan by participant)
drop function if exists public.mark_event_attendance(text);
create or replace function public.mark_event_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token         text := lower(btrim(coalesce(p_token, '')));
  v_is_sports     boolean := (
    v_token = 'ba31a6b79aa1bf173badbd6f62236556'
    or v_token in (
      '42f72b973a4435f9aef271a8fe028992', -- cricket
      'ab30b6937266257e63ba609931840c68', -- football
      '1aa8125cc6422b40182407d3cb802c2d', -- volleyball
      'a4589e9420537421ae5343bbff9bcf40', -- kabaddi
      '18631d75d480ce4c8f0979a200d3e08e', -- kho-kho
      '87cb2c00f1f675db80174d5af7caaf54', -- throwball
      'e08dfc0be793e4b9d70dc9aa9beca60b', -- chess
      '6fb1e0984a6a4ba1ede4f6459869a0f4'  -- carrom
    )
  );
  v_uid           uuid := auth.uid();
  v_email         text;
  v_user_name     text;
  v_event         record;
  v_member        record;
  v_existing      record;
  v_reg_id        text;
  v_reg_code      text;
  v_marked        timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'message', 'Please sign in to scan attendance.');
  end if;

  if v_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid attendance QR code.');
  end if;

  v_email := public.current_user_email();

  select t.full_name into v_user_name
    from (
      select full_name from public.internal_participants where id = v_uid
      union all
      select full_name from public.external_participants where id = v_uid
    ) t
   limit 1;

  if v_user_name is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile', 'message', 'No participant profile found for your account.');
  end if;

  -- 1. Check if user is registered in registration_members for ANY event matching this token
  -- (If this is the unified sports token, it matches the specific sport the participant registered for)
  select e.id, e.name, e.attendance_open, e.registration_open,
         m.registration_id, m.registration_code, coalesce(m.member_name, v_user_name) as member_name
    into v_event
    from public.events e
    join public.registration_members m
      on (
        m.event_id = e.id
        or m.event_id = replace(e.id, 'tech-', '')
        or m.event_id = replace(e.id, 'nontech-', '')
        or m.event_id = replace(e.id, 'sport-', '')
        or e.id = replace(m.event_id, 'tech-', '')
        or e.id = replace(m.event_id, 'nontech-', '')
        or e.id = replace(m.event_id, 'sport-', '')
      )
      and lower(btrim(m.email)) = v_email
   where (e.attendance_token = v_token or (v_is_sports and (coalesce(e.day_id, '') = 'day-1' or lower(coalesce(e.category, '')) like 'sport%')))
   limit 1;

  -- 2. Fallback to registrations_internal or registrations_external
  if v_event.id is null then
    select e.id, e.name, e.attendance_open, e.registration_open,
           r.id::text as registration_id, r.registration_code, v_user_name as member_name
      into v_event
      from public.events e
      join (
        select event_id, id, registration_code, user_id from public.registrations_internal
        union all
        select event_id, id, registration_code, user_id from public.registrations_external
      ) r on (
        r.event_id = e.id
        or r.event_id = replace(e.id, 'tech-', '')
        or r.event_id = replace(e.id, 'nontech-', '')
        or r.event_id = replace(e.id, 'sport-', '')
        or e.id = replace(r.event_id, 'tech-', '')
        or e.id = replace(r.event_id, 'nontech-', '')
        or e.id = replace(r.event_id, 'sport-', '')
      )
      and r.user_id::text = v_uid::text
     where (e.attendance_token = v_token or (v_is_sports and (coalesce(e.day_id, '') = 'day-1' or lower(coalesce(e.category, '')) like 'sport%')))
     limit 1;
  end if;

  -- 3. If still null, check if any event exists with this token to provide an informative error
  if v_event.id is null then
    select e.id, e.name, e.category, e.day_id
      into v_event
      from public.events e
     where (e.attendance_token = v_token or (v_is_sports and (coalesce(e.day_id, '') = 'day-1' or lower(coalesce(e.category, '')) like 'sport%')))
     limit 1;

    if v_event.id is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid attendance QR code.');
    end if;

    if v_is_sports or coalesce(v_event.day_id, '') = 'day-1' or lower(coalesce(v_event.category, '')) like 'sport%' then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for any sports event.');
    else
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for ' || v_event.name || '.');
    end if;
  end if;

  -- Verify attendance is open
  if coalesce(v_event.attendance_open, true) is not true
     or coalesce(v_event.registration_open, true) is false then
    return jsonb_build_object('ok', false, 'reason', 'event_disabled', 'message', 'Attendance is currently closed for ' || v_event.name || '.');
  end if;

  v_reg_id := v_event.registration_id;
  v_reg_code := v_event.registration_code;
  if v_event.member_name is not null then
    v_user_name := v_event.member_name;
  end if;

  -- Check payment confirmation
  if v_reg_code is not null and not public.checkin_code_is_paid(v_reg_code) then
    return jsonb_build_object('ok', false, 'reason', 'not_paid', 'message', 'Your registration payment is not confirmed for ' || v_event.name || '.');
  end if;

  -- Check duplicate attendance
  select a.id, a.marked_at
    into v_existing
    from public.attendance a
   where a.event_id = v_event.id
     and a.participant_id = v_uid::text
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_attended',
      'message', 'Attendance already recorded for ' || v_event.name || '.',
      'event_name', v_event.name,
      'marked_at', v_existing.marked_at
    );
  end if;

  -- Mark attendance
  insert into public.attendance (
    event_id, participant_id, participant_email, participant_name,
    registration_id, registration_code, marked_at, status, source
  ) values (
    v_event.id, v_uid::text, v_email, v_user_name,
    v_reg_id, v_reg_code, now(), 'present', 'qr'
  )
  returning attendance.marked_at into v_marked;

  -- Also update registration_members attended flag
  update public.registration_members
     set attended = true,
         attended_at = v_marked,
         attended_source = 'qr',
         updated_at = now()
   where (
     event_id = v_event.id
     or event_id = replace(v_event.id, 'tech-', '')
     or event_id = replace(v_event.id, 'nontech-', '')
     or event_id = replace(v_event.id, 'sport-', '')
   )
   and lower(btrim(email)) = v_email;

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'message', 'Attendance successfully marked for ' || v_event.name || '!',
    'event_id', v_event.id,
    'event_name', v_event.name,
    'marked_at', v_marked
  );
end;
$$;

grant execute on function public.mark_event_attendance(text) to authenticated, anon;

-- 3E-2. get_attendance_hub_stats (Instant live attendance & participant statistics)
drop function if exists public.get_attendance_hub_stats();
create or replace function public.get_attendance_hub_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats jsonb;
begin
  with event_members_count as (
    select
      coalesce(event_id, '') as event_id,
      count(*)::int as member_count
    from public.registration_members
    group by event_id
  ),
  event_attendance_count as (
    select
      coalesce(event_id, '') as event_id,
      count(distinct lower(btrim(participant_email)))::int as attended_count
    from public.attendance
    where status = 'present' or status is null
    group by event_id
  )
  select jsonb_object_agg(
    e.id,
    jsonb_build_object(
      'total', coalesce(em.member_count, 0),
      'attended', coalesce(ea.attended_count, 0)
    )
  ) into v_stats
  from public.events e
  left join event_members_count em on (
    em.event_id = e.id
    or em.event_id = replace(e.id, 'tech-', '')
    or em.event_id = replace(e.id, 'nontech-', '')
    or em.event_id = replace(e.id, 'sport-', '')
  )
  left join event_attendance_count ea on (
    ea.event_id = e.id
    or ea.event_id = replace(e.id, 'tech-', '')
    or ea.event_id = replace(e.id, 'nontech-', '')
    or ea.event_id = replace(e.id, 'sport-', '')
  );

  return coalesce(v_stats, '{}'::jsonb);
end;
$$;

grant execute on function public.get_attendance_hub_stats() to authenticated, anon;

-- Synchronize / Backfill registration_members from registrations_internal and registrations_external
insert into public.registration_members (
  id, registration_id, registration_code, user_id, event_id,
  team_name, captain_name, participant_type, payment_status,
  member_name, member_role, position, email, reg_number, phone, college
)
select
  gen_random_uuid(),
  r.id::text,
  r.registration_code,
  case when r.user_id is not null and r.user_id::text ~* '^[0-9a-f-]{36}$' then r.user_id::uuid else null end,
  r.event_id,
  r.team_name,
  r.captain_name,
  'internal',
  coalesce(r.payment_status, 'confirmed'),
  coalesce(m->>'name', r.captain_name),
  coalesce(m->>'role', 'player'),
  coalesce((m->>'position')::int, 0),
  lower(btrim(coalesce(m->>'email', ''))),
  m->>'regNumber',
  m->>'phone',
  m->>'college'
from public.registrations_internal r,
     lateral jsonb_array_elements(case when jsonb_typeof(r.members) = 'array' and jsonb_array_length(r.members) > 0 then r.members else jsonb_build_array(jsonb_build_object('name', r.captain_name, 'role', 'captain', 'position', 0)) end) as m
where coalesce(m->>'email', '') != ''
on conflict do nothing;

insert into public.registration_members (
  id, registration_id, registration_code, user_id, event_id,
  team_name, captain_name, participant_type, payment_status,
  member_name, member_role, position, email, reg_number, phone, college
)
select
  gen_random_uuid(),
  r.id::text,
  r.registration_code,
  case when r.user_id is not null and r.user_id::text ~* '^[0-9a-f-]{36}$' then r.user_id::uuid else null end,
  r.event_id,
  r.team_name,
  r.captain_name,
  'external',
  coalesce(r.payment_status, 'pending'),
  coalesce(m->>'name', r.captain_name),
  coalesce(m->>'role', 'player'),
  coalesce((m->>'position')::int, 0),
  lower(btrim(coalesce(m->>'email', ''))),
  m->>'regNumber',
  m->>'phone',
  m->>'college'
from public.registrations_external r,
     lateral jsonb_array_elements(case when jsonb_typeof(r.members) = 'array' and jsonb_array_length(r.members) > 0 then r.members else jsonb_build_array(jsonb_build_object('name', r.captain_name, 'role', 'captain', 'position', 0)) end) as m
where coalesce(m->>'email', '') != ''
on conflict do nothing;

-- Grant broad schema & table permissions to ensure PostgREST clients and RPCs can query check-in
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.registration_members to authenticated, anon;
grant select, insert, update on public.attendance to authenticated, anon;
grant select, insert, update on public.registrations_internal to authenticated, anon;
grant select, insert, update on public.registrations_external to authenticated, anon;
grant select on public.events to authenticated, anon;
grant select on public.internal_participants to authenticated, anon;
grant select on public.external_participants to authenticated, anon;

-- 3F. admin_mark_event_attendance (Manual override by coordinator/admin)
drop function if exists public.admin_mark_event_attendance(text, text, boolean);
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
  if not exists (
    select 1 from public.events e
     where e.id = p_event_id
       and (public.is_admin() or public.is_event_coordinator(p_event_id))
  ) then
    raise exception 'Not authorised';
  end if;

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
    return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'No participant found with that ID.');
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

-- 3G. claim_coordinator_links
drop function if exists public.claim_coordinator_links();
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

-- ─── 4. CHECK-IN QR RPCS ───────────────────────────────────────────────────

drop function if exists public.my_checkin_token();
drop function if exists public.my_checkin_tokens();

-- 4A. my_checkin_tokens
create or replace function public.my_checkin_tokens()
returns table (
  token            text,
  email            text,
  display_name     text,
  participant_type text,
  is_self          boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_email := coalesce(
    public.current_user_email(),
    nullif(lower(btrim(auth.jwt() ->> 'email')), '')
  );

  return query
  with scope as (
    select lower(btrim(rm.email)) as email, rm.member_name, rm.participant_type
      from public.registration_members rm
      join public.registrations_internal ri
        on ri.id::text = rm.registration_id::text and ri.user_id::text = v_uid::text
     where public.checkin_code_is_paid(ri.registration_code)
    union all
    select lower(btrim(rm.email)), rm.member_name, rm.participant_type
      from public.registration_members rm
      join public.registrations_external re
        on re.id::text = rm.registration_id::text and re.user_id::text = v_uid::text
     where public.checkin_code_is_paid(re.registration_code)
    union all
    select v_email, null::text, null::text
      where v_email is not null
        and exists (
          select 1
            from public.registration_members rm
           where lower(btrim(rm.email)) = v_email
             and public.checkin_code_is_paid(rm.registration_code)
        )
  ),
  deduped as (
    select distinct on (s.email)
           s.email,
           coalesce(nullif(s.member_name, ''), s.email) as display_name,
           s.participant_type
      from scope s
     where s.email is not null and btrim(s.email) <> ''
     order by s.email, (s.member_name is not null) desc, s.member_name
  ),
  upserted as (
    insert into public.checkin_tokens as t (email, display_name, participant_type)
    select d.email, d.display_name, d.participant_type from deduped d
    on conflict (email) do update
      set display_name = coalesce(nullif(excluded.display_name, ''), t.display_name),
          updated_at   = now()
    returning t.token, t.email, t.display_name, t.participant_type
  )
  select u.token, u.email, u.display_name, u.participant_type, (u.email = v_email)
    from upserted u
   order by (u.email = v_email) desc, u.display_name;
end;
$$;

grant execute on function public.my_checkin_tokens() to authenticated;

-- Alias for single-row consumer
create or replace function public.my_checkin_token()
returns table (
  token            text,
  email            text,
  display_name     text,
  participant_type text,
  is_self          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.my_checkin_tokens() limit 1;
$$;

grant execute on function public.my_checkin_token() to authenticated;

drop function if exists public.admin_scan_checkin(text, text);
drop function if exists public.admin_scan_checkin(text);

-- 4B. admin_scan_checkin
create or replace function public.admin_scan_checkin(
  p_token  text,
  p_source text default 'qr'
)
returns table (
  ok               boolean,
  reason           text,
  email            text,
  display_name     text,
  participant_type text,
  members_checked  integer,
  members_total    integer,
  already_attended integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token    text := lower(btrim(coalesce(p_token, '')));
  v_source   text := case when p_source = 'manual' then 'manual' else 'qr' end;
  v_email    text;
  v_name     text;
  v_type     text;
  v_revoked  timestamptz;
  v_total    integer := 0;
  v_new      integer := 0;
  v_existing integer := 0;
  v_admin    text := auth.jwt() ->> 'email';
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  if v_token !~ '^[0-9a-f]{32}$' then
    return query select false, 'invalid_token', null, null, null, 0, 0, 0;
    return;
  end if;

  select t.email, t.display_name, t.participant_type, t.revoked_at
    into v_email, v_name, v_type, v_revoked
    from public.checkin_tokens t
   where t.token = v_token;

  if v_email is null then
    return query select false, 'not_registered', null, null, null, 0, 0, 0;
    return;
  end if;

  if v_revoked is not null then
    return query select false, 'revoked', v_email, v_name, v_type, 0, 0, 0;
    return;
  end if;

  select count(*), count(*) filter (where rm.attended)
    into v_total, v_existing
    from public.registration_members rm
   where lower(btrim(rm.email)) = v_email
     and public.checkin_code_is_paid(rm.registration_code);

  if v_total = 0 then
    if exists (
      select 1 from public.registration_members rm
       where lower(btrim(rm.email)) = v_email
    ) then
      return query select false, 'not_paid', v_email, v_name, v_type, 0, 0, 0;
      return;
    end if;

    return query select false, 'not_registered', v_email, v_name, v_type, 0, 0, 0;
    return;
  end if;

  with updated as (
    update public.registration_members rm
       set attended        = true,
           attended_at     = now(),
           attended_source = v_source,
           updated_at      = now()
     where lower(btrim(rm.email)) = v_email
       and rm.attended is not true
       and public.checkin_code_is_paid(rm.registration_code)
     returning 1
  )
  select count(*) into v_new from updated;

  insert into public.checkin_log
    (email, display_name, participant_type, source,
     members_checked, members_total, already_attended, admin_id, admin_email)
  values
    (v_email, v_name, v_type, v_source,
     v_new, v_total, v_existing, auth.uid(), v_admin);

  return query
    select true, 'ok', v_email, v_name, v_type, v_new, v_total, v_existing;
end;
$$;

grant execute on function public.admin_scan_checkin(text, text) to authenticated;

-- ─── 5. EMAIL QUEUE RPCS ────────────────────────────────────────────────────

-- 5A. email_queue_set_paused
drop function if exists public.email_queue_set_paused(boolean);

create or replace function public.email_queue_set_paused(p_paused boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  insert into public.email_queue_control (id, paused, updated_at)
  values (true, p_paused, now())
  on conflict (id) do update
    set paused = excluded.paused,
        updated_at = now();

  return p_paused;
end;
$$;

grant execute on function public.email_queue_set_paused(boolean) to authenticated;

-- 5B. email_queue_retry
drop function if exists public.email_queue_retry(bigint);
drop function if exists public.email_queue_retry(integer);

create or replace function public.email_queue_retry(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  update public.email_outbox
     set status = 'pending',
         attempts = 0,
         last_error = null,
         claimed_at = null,
         next_attempt_at = now()
   where id = p_id;

  return true;
end;
$$;

grant execute on function public.email_queue_retry(bigint) to authenticated;

-- 5C. email_queue_claim (used by edge worker)
drop function if exists public.email_queue_claim(integer);
drop function if exists public.email_queue_claim();

create or replace function public.email_queue_claim(p_limit integer default 10)
returns table (
  id                bigint,
  registration_code text,
  recipient_email   text,
  recipient_name    text,
  team_name         text,
  captain_name      text,
  event_names       text[],
  total_fee         numeric,
  attempts          integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with ready as (
    select o.id
      from public.email_outbox o
     where o.status = 'pending'
       and (o.next_attempt_at is null or o.next_attempt_at <= now())
     order by o.created_at asc
     limit coalesce(p_limit, 10)
     for update skip locked
  ),
  claimed as (
    update public.email_outbox o
       set status = 'sending',
           claimed_at = now(),
           attempts = o.attempts + 1
      from ready
     where o.id = ready.id
     returning o.id, o.registration_code, o.recipient_email, o.recipient_name,
               o.team_name, o.captain_name, o.event_names, o.total_fee, o.attempts
  )
  select * from claimed;
end;
$$;

grant execute on function public.email_queue_claim(integer) to authenticated, service_role;

-- ─── 6. TRIGGERS: PAYMENT LEDGER, AUDIT LOG & ROSTER SYNC ────────────────────

-- 6A. payment_ledger trigger
create or replace function public.ledger_on_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
begin
  if new.payment_status = 'recorded'
     and (tg_op = 'INSERT' or old.payment_status <> 'recorded') then
    select coalesce(sum(fee), 0)
      into v_amount
      from public.registrations_external
     where registration_code = new.registration_code
       and payment_status = 'recorded';

    insert into public.payment_ledger (registration_code, amount, team_name, utr, recorded_by)
    values (new.registration_code, v_amount, new.team_name, new.utr_number, auth.uid())
    on conflict (registration_code)
    do update set amount    = excluded.amount,
                  team_name = excluded.team_name,
                  utr       = excluded.utr;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ledger_on_record on public.registrations_external;
create trigger trg_ledger_on_record
  after insert or update of payment_status on public.registrations_external
  for each row execute function public.ledger_on_record();

-- 6B. delete audit trigger
create or replace function public.audit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_delete_audit (table_name, row_id, snapshot, deleted_by)
  values (tg_table_name, old.id::text, to_jsonb(old), auth.uid());
  return old;
end;
$$;

drop trigger if exists trg_audit_del_int_p on public.internal_participants;
create trigger trg_audit_del_int_p
  before delete on public.internal_participants
  for each row execute function public.audit_delete();

drop trigger if exists trg_audit_del_ext_p on public.external_participants;
create trigger trg_audit_del_ext_p
  before delete on public.external_participants
  for each row execute function public.audit_delete();

drop trigger if exists trg_audit_del_int_r on public.registrations_internal;
create trigger trg_audit_del_int_r
  before delete on public.registrations_internal
  for each row execute function public.audit_delete();

drop trigger if exists trg_audit_del_ext_r on public.registrations_external;
create trigger trg_audit_del_ext_r
  before delete on public.registrations_external
  for each row execute function public.audit_delete();

-- 6C. Attendance to roster sync trigger
create or replace function public.sync_attendance_to_roster()
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

drop trigger if exists trg_sync_attendance_to_roster on public.attendance;
create trigger trg_sync_attendance_to_roster
  after insert on public.attendance
  for each row execute function public.sync_attendance_to_roster();

-- ─── 7. ROW LEVEL SECURITY (RLS) POLICIES ───────────────────────────────────

-- 7A. admin_allowlist
alter table public.admin_allowlist enable row level security;
drop policy if exists "admin_allowlist_admin_all" on public.admin_allowlist;
create policy "admin_allowlist_admin_all" on public.admin_allowlist
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7B. events
alter table public.events enable row level security;
drop policy if exists "events_read_all" on public.events;
create policy "events_read_all" on public.events
  for select to anon, authenticated
  using (true);

drop policy if exists "events_admin_all" on public.events;
create policy "events_admin_all" on public.events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7C. event_coordinators
alter table public.event_coordinators enable row level security;
drop policy if exists "coordinators_admin_all" on public.event_coordinators;
drop policy if exists "coordinators_admin_read" on public.event_coordinators;
create policy "coordinators_admin_read" on public.event_coordinators
  for select to authenticated
  using (public.is_admin());

drop policy if exists "coordinators_self_read" on public.event_coordinators;
create policy "coordinators_self_read" on public.event_coordinators
  for select to authenticated
  using (
    (user_id is not null and user_id = auth.uid()::text)
    or lower(btrim(email)) = public.current_user_email()
  );

-- 7D. attendance
alter table public.attendance enable row level security;
drop policy if exists "attendance_read_policy" on public.attendance;
drop policy if exists "attendance_coordinator_read" on public.attendance;
drop policy if exists "attendance_self_read" on public.attendance;

create policy "attendance_coordinator_read" on public.attendance
  for select to authenticated
  using (public.is_event_admin(event_id));

create policy "attendance_self_read" on public.attendance
  for select to authenticated
  using (
    participant_id = auth.uid()::text
    or lower(btrim(participant_email)) = public.current_user_email()
  );

-- 7E. checkin_tokens & checkin_log
alter table public.checkin_tokens enable row level security;
drop policy if exists "checkin_tokens_admin_read" on public.checkin_tokens;
create policy "checkin_tokens_admin_read" on public.checkin_tokens
  for select to authenticated
  using (public.is_admin());

drop policy if exists "checkin_tokens_self_read" on public.checkin_tokens;
create policy "checkin_tokens_self_read" on public.checkin_tokens
  for select to authenticated
  using (email = public.current_user_email());

alter table public.checkin_log enable row level security;
drop policy if exists "checkin_log_admin_read" on public.checkin_log;
create policy "checkin_log_admin_read" on public.checkin_log
  for select to authenticated
  using (public.is_admin());

-- 7F. payment_ledger & admin_delete_audit
alter table public.payment_ledger enable row level security;
drop policy if exists "Admins read payment ledger" on public.payment_ledger;
create policy "Admins read payment ledger" on public.payment_ledger
  for select to authenticated
  using (public.is_admin());

alter table public.admin_delete_audit enable row level security;
drop policy if exists "Admins read delete audit" on public.admin_delete_audit;
create policy "Admins read delete audit" on public.admin_delete_audit
  for select to authenticated
  using (public.is_admin());

-- 7G. email_outbox & email_queue_control
alter table public.email_outbox enable row level security;
drop policy if exists "email_outbox_admin_all" on public.email_outbox;
create policy "email_outbox_admin_all" on public.email_outbox
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.email_queue_control enable row level security;
drop policy if exists "email_queue_control_admin_all" on public.email_queue_control;
create policy "email_queue_control_admin_all" on public.email_queue_control
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7H. participant profiles
alter table public.internal_participants enable row level security;
drop policy if exists "internal_participants_select" on public.internal_participants;
create policy "internal_participants_select" on public.internal_participants
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "internal_participants_update" on public.internal_participants;
create policy "internal_participants_update" on public.internal_participants
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

alter table public.external_participants enable row level security;
drop policy if exists "external_participants_select" on public.external_participants;
create policy "external_participants_select" on public.external_participants
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "external_participants_update" on public.external_participants;
create policy "external_participants_update" on public.external_participants
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 7I. registrations & members
alter table public.registrations_internal enable row level security;
drop policy if exists "reg_internal_select" on public.registrations_internal;
create policy "reg_internal_select" on public.registrations_internal
  for select to authenticated
  using (user_id::text = auth.uid()::text or public.is_admin());

alter table public.registrations_external enable row level security;
drop policy if exists "reg_external_select" on public.registrations_external;
create policy "reg_external_select" on public.registrations_external
  for select to authenticated
  using (user_id::text = auth.uid()::text or public.is_admin());

alter table public.registration_members enable row level security;
drop policy if exists "registration_members_select" on public.registration_members;
create policy "registration_members_select" on public.registration_members
  for select to authenticated
  using (
    lower(btrim(email)) = public.current_user_email()
    or user_id::text = auth.uid()::text
    or public.is_admin()
    or public.is_event_coordinator(event_id)
  );

-- ─── 8. STORAGE BUCKET CONFIGURATION ─────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload to own folder" on storage.objects;
create policy "Authenticated users can upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'uploads' and
  (auth.uid())::text = (storage.foldername(name))[2]
);

drop policy if exists "Authenticated users can update own uploads" on storage.objects;
create policy "Authenticated users can update own uploads"
on storage.objects for update
to authenticated
using (
  bucket_id = 'uploads' and
  (auth.uid())::text = (storage.foldername(name))[2]
)
with check (
  bucket_id = 'uploads' and
  (auth.uid())::text = (storage.foldername(name))[2]
);

drop policy if exists "Users and admins can delete uploads" on storage.objects;
create policy "Users and admins can delete uploads"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'uploads' and (
    (auth.uid())::text = (storage.foldername(name))[2]
    or public.is_admin()
  )
);

drop policy if exists "Users and admins can read uploads" on storage.objects;
create policy "Users and admins can read uploads"
on storage.objects for select
to authenticated
using (
  bucket_id = 'uploads' and (
    (auth.uid())::text = (storage.foldername(name))[2]
    or public.is_admin()
  )
);

-- ─── 9. REALTIME PUBLICATION SETUP ──────────────────────────────────────────

do $$
declare
  v_tbl text;
  v_tables text[] := array[
    'event_coordinators',
    'attendance',
    'registrations_internal',
    'registrations_external',
    'registration_members',
    'email_outbox',
    'email_queue_control'
  ];
begin
  foreach v_tbl in array v_tables loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tbl
    ) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', v_tbl);
      exception when others then
        raise notice 'Notice: Could not add % to supabase_realtime: %', v_tbl, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- ============================================================================
-- SUCCESS: Unified master migration completed cleanly.
-- ============================================================================
