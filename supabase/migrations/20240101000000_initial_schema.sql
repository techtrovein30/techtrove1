-- =============================================================================
-- TechTrove 3.0 — Split participants & registrations into internal/external
-- =============================================================================
-- Run the WHOLE script ONCE in the Supabase SQL Editor (Dashboard → SQL Editor).
-- It is safe to re-run (idempotent).
--
-- What it does:
--   1. Creates the admin_allowlist table (with your two admin Gmails).
--   2. Creates `internal_participants` and `external_participants`.
--   3. Creates `registrations_internal` and `registrations_external`.
--   4. Adds role-gate triggers so a browser can NEVER set role='admin'
--      unless the email is on the allowlist.
--   5. Replaces the auth trigger so new sign-ups go to the correct
--      participant table (internal vs external).
--   6. Replaces ensure_admin_access() used by the admin "Sign in with Google".
--   7. Migrates your existing profiles + registrations into the new tables.
--   8. Renames the old `registrations` table to `registrations_legacy`
--      (kept as backup; delete it later once you are happy).
-- =============================================================================

-- ── 0) Admin Gmail allowlist ──────────────────────────────────────────────
create table if not exists public.admin_allowlist (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;

-- >>> YOUR allowed admin Gmails (lowercase) — edit here if you add more <<<
insert into public.admin_allowlist (email) values
  ('suvedhansuveg14@gmail.com'),
  ('monigavs07@gmail.com')
on conflict (email) do nothing;

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.admin_allowlist to service_role;

-- ── 1) Events table (safeguard so registration FK never breaks) ───────────
create table if not exists public.events (
  id                text primary key,
  day_id            text not null,
  name              text not null,
  category          text,
  description       text,
  venue             text,
  time              text,
  duration          text,
  coordinator       text,
  registration_fee  numeric not null default 0,
  registration_type text,
  eligibility       text,
  required_players  integer not null default 1,
  max_substitutes   integer not null default 0,
  registration_open boolean not null default true,
  rules             jsonb,
  prizes            jsonb,
  created_at        timestamptz not null default now()
);
-- The app auto-seeds event data from code on first load (admin panel or
-- any public page), so rows appear here automatically.

-- ── 2) Internal / External participant tables ─────────────────────────────
create table if not exists public.internal_participants (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text not null unique,
  full_name        text not null,
  email            text not null unique,
  participant_type text not null default 'internal'
                   check (participant_type in ('internal', 'external')),
  reg_number       text,
  college          text,
  phone            text,
  role             text not null default 'user' check (role in ('user', 'admin')),
  created_at       timestamptz not null default now()
);

create table if not exists public.external_participants (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text not null unique,
  full_name        text not null,
  email            text not null unique,
  participant_type text not null default 'external'
                   check (participant_type in ('internal', 'external')),
  reg_number       text,
  college          text,
  phone            text,
  role             text not null default 'user' check (role in ('user', 'admin')),
  created_at       timestamptz not null default now()
);

grant all on table public.internal_participants to anon, authenticated, service_role;
grant all on table public.external_participants to anon, authenticated, service_role;

-- ── 3) Internal / External registrations ──────────────────────────────────
create table if not exists public.registrations_internal (
  id               text primary key,
  registration_code text not null unique,
  user_id          uuid not null references public.internal_participants(id) on delete cascade,
  event_id         text not null references public.events(id) on delete cascade,
  team_name        text not null,
  captain_name     text not null,
  fee              numeric not null default 0,
  payment_status   text not null default 'pending' check (payment_status in ('pending', 'recorded')),
  terms_accepted   boolean not null default true,
  members          jsonb not null default '[]',
  created_at       timestamptz not null default now()
);

create table if not exists public.registrations_external (
  id               text primary key,
  registration_code text not null unique,
  user_id          uuid not null references public.external_participants(id) on delete cascade,
  event_id         text not null references public.events(id) on delete cascade,
  team_name        text not null,
  captain_name     text not null,
  fee              numeric not null default 0,
  payment_status   text not null default 'pending' check (payment_status in ('pending', 'recorded')),
  terms_accepted   boolean not null default true,
  members          jsonb not null default '[]',
  created_at       timestamptz not null default now()
);

grant all on table public.registrations_internal to anon, authenticated, service_role;
grant all on table public.registrations_external to anon, authenticated, service_role;

-- ── 4) Role-gate triggers (server decides role from allowlist) ────────────
create or replace function public.enforce_admin_allowlist_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.admin_allowlist where email = lower(new.email)) then
    new.role := 'admin';
  else
    new.role := 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_admin_allowlist_role_int on public.internal_participants;
create trigger trg_enforce_admin_allowlist_role_int
  before insert or update of email, role on public.internal_participants
  for each row execute function public.enforce_admin_allowlist_role();

drop trigger if exists trg_enforce_admin_allowlist_role_ext on public.external_participants;
create trigger trg_enforce_admin_allowlist_role_ext
  before insert or update of email, role on public.external_participants
  for each row execute function public.enforce_admin_allowlist_role();

-- (clean up the old profiles-based gate if you ran the earlier script)
drop trigger if exists trg_enforce_admin_allowlist_role on public.profiles;

-- ── 5) Auth sign-up trigger → correct participant table ───────────────────
-- Removes the old profile-creation trigger(s) and creates one that routes
-- new accounts to internal/external based on raw_user_meta_data.
drop trigger if exists handle_new_user on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_new_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ptype text := coalesce(new.raw_user_meta_data->>'participant_type', new.raw_user_meta_data->>'type', 'internal');
begin
  if ptype = 'external' then
    insert into public.external_participants
      (id, username, full_name, email, participant_type, reg_number, college, phone, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      new.email,
      'external',
      nullif(new.raw_user_meta_data->>'reg_number', ''),
      coalesce(new.raw_user_meta_data->>'college', ''),
      coalesce(new.raw_user_meta_data->>'phone', ''),
      coalesce(new.raw_user_meta_data->>'role', 'user')
    )
    on conflict (id) do nothing;
  else
    insert into public.internal_participants
      (id, username, full_name, email, participant_type, reg_number, college, phone, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      new.email,
      'internal',
      nullif(new.raw_user_meta_data->>'reg_number', ''),
      coalesce(new.raw_user_meta_data->>'college', 'SIMATS'),
      coalesce(new.raw_user_meta_data->>'phone', ''),
      coalesce(new.raw_user_meta_data->>'role', 'user')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_new_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 6) Admin Google OAuth entry point (for the /wch1925 Google button) ───
create or replace function public.ensure_admin_access()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id    uuid := auth.uid();
  caller_email text;
  display_name text;
  uname        text;
  ptype        text := 'internal';
  allowed      boolean;
  found        boolean := false;
begin
  if caller_id is null then
    return false;
  end if;

  select email into caller_email from auth.users where id = caller_id;
  if caller_email is null then
    return false;
  end if;

  allowed := exists (
    select 1 from public.admin_allowlist where email = lower(caller_email)
  );

  if not allowed then
    update public.internal_participants set role = 'user' where id = caller_id;
    update public.external_participants set role = 'user' where id = caller_id;
    return false;
  end if;

  -- Reuse the row type already present; default to internal for new accounts
  if exists (select 1 from public.external_participants where id = caller_id) then
    ptype := 'external';
    found := true;
  elsif exists (select 1 from public.internal_participants where id = caller_id) then
    ptype := 'internal';
    found := true;
  end if;

  select coalesce(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      ''
    ) into display_name
  from auth.users
  where id = caller_id;

  if display_name = '' then
    display_name := split_part(caller_email, '@', 1);
  end if;

  uname := lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '.', 'g'));
  if uname = '' then
    uname := 'admin';
  end if;

  if ptype = 'external' then
    insert into public.external_participants
      (id, username, full_name, email, participant_type, role)
    values (caller_id, uname, display_name, lower(caller_email), 'external', 'admin')
    on conflict (id) do update set role = 'admin', email = excluded.email;
  else
    insert into public.internal_participants
      (id, username, full_name, email, participant_type, role)
    values (caller_id, uname, display_name, lower(caller_email), 'internal', 'admin')
    on conflict (id) do update set role = 'admin', email = excluded.email;
  end if;

  return true;
end;
$$;

grant execute on function public.ensure_admin_access() to authenticated;
grant execute on function public.ensure_admin_access() to anon;

-- ── 7) Migrate existing data ──────────────────────────────────────────────
-- Participants: profiles → internal/external (only if profiles table exists)
do $$
begin
  if to_regclass('public.profiles') is not null then
    insert into public.internal_participants
      (id, username, full_name, email, participant_type, reg_number, college, phone, role, created_at)
    select
      p.id, p.username, p.full_name, p.email, 'internal',
      p.reg_number, p.college, p.phone, p.role, coalesce(p.created_at, now())
    from public.profiles p
    where p.participant_type = 'internal'
      and not exists (select 1 from public.internal_participants ip where ip.id = p.id);

    insert into public.external_participants
      (id, username, full_name, email, participant_type, reg_number, college, phone, role, created_at)
    select
      p.id, p.username, p.full_name, p.email, 'external',
      p.reg_number, p.college, p.phone, p.role, coalesce(p.created_at, now())
    from public.profiles p
    where p.participant_type = 'external'
      and not exists (select 1 from public.external_participants ep where ep.id = p.id);

    -- Also copy any admin accounts (role='admin') that have no type
    insert into public.internal_participants
      (id, username, full_name, email, participant_type, reg_number, college, phone, role, created_at)
    select
      p.id, p.username, p.full_name, p.email, 'internal',
      p.reg_number, p.college, p.phone, p.role, coalesce(p.created_at, now())
    from public.profiles p
    where p.role = 'admin'
      and p.participant_type not in ('internal', 'external')
      and not exists (select 1 from public.internal_participants ip where ip.id = p.id);
  end if;

  -- Registrations: old registrations → internal/external tables
  if to_regclass('public.registrations') is not null then
    insert into public.registrations_internal
      (id, registration_code, user_id, event_id, team_name, captain_name, fee, payment_status, terms_accepted, members, created_at)
    select
      r.id, r.registration_code, r.user_id, r.event_id, r.team_name, r.captain_name,
      r.fee, r.payment_status, r.terms_accepted, r.members, r.created_at
    from public.registrations r
    join public.internal_participants p on p.id = r.user_id
    where not exists (select 1 from public.registrations_internal ri where ri.id = r.id);

    insert into public.registrations_external
      (id, registration_code, user_id, event_id, team_name, captain_name, fee, payment_status, terms_accepted, members, created_at)
    select
      r.id, r.registration_code, r.user_id, r.event_id, r.team_name, r.captain_name,
      r.fee, r.payment_status, r.terms_accepted, r.members, r.created_at
    from public.registrations r
    join public.external_participants p on p.id = r.user_id
    where not exists (select 1 from public.registrations_external re where re.id = r.id);
  end if;
end$$;

-- ── 8) Keep the old registrations table as backup ─────────────────────────
do $$
begin
  if to_regclass('public.registrations') is not null
     and to_regclass('public.registrations_legacy') is null then
    alter table public.registrations rename to registrations_legacy;
  end if;
end$$;

-- ── Optional sanity checks ────────────────────────────────────────────────
select 'internal' as bucket, count(*) from public.internal_participants
union all
select 'external', count(*) from public.external_participants;

select 'registrations_internal' as bucket, count(*) from public.registrations_internal
union all
select 'registrations_external', count(*) from public.registrations_external;

select email from public.admin_allowlist;
-- =============================================================================
-- TechTrove 3.0 — Row Level Security (RLS) Policies
-- =============================================================================
-- Run this script in your Supabase SQL Editor to solve the RLS violation errors.
-- It enables RLS on all tables and creates policies so users can manage their 
-- own data while admins can manage everything.

-- 1. Enable RLS on all public tables
alter table public.internal_participants enable row level security;
alter table public.external_participants enable row level security;
alter table public.registrations_internal enable row level security;
alter table public.registrations_external enable row level security;
alter table public.events enable row level security;

-- 2. Internal Participants Policies
drop policy if exists "Users can view their own internal profile" on public.internal_participants;
create policy "Users can view their own internal profile"
  on public.internal_participants for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own internal profile" on public.internal_participants;
create policy "Users can insert their own internal profile"
  on public.internal_participants for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own internal profile" on public.internal_participants;
create policy "Users can update their own internal profile"
  on public.internal_participants for update
  using (auth.uid() = id);

drop policy if exists "Admins can manage all internal participants" on public.internal_participants;
create policy "Admins can manage all internal participants"
  on public.internal_participants for all
  using (exists (
    select 1 from public.admin_allowlist 
    where email = lower(auth.jwt()->>'email')
  ));

-- 3. External Participants Policies
drop policy if exists "Users can view their own external profile" on public.external_participants;
create policy "Users can view their own external profile"
  on public.external_participants for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own external profile" on public.external_participants;
create policy "Users can insert their own external profile"
  on public.external_participants for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own external profile" on public.external_participants;
create policy "Users can update their own external profile"
  on public.external_participants for update
  using (auth.uid() = id);

drop policy if exists "Admins can manage all external participants" on public.external_participants;
create policy "Admins can manage all external participants"
  on public.external_participants for all
  using (exists (
    select 1 from public.admin_allowlist 
    where email = lower(auth.jwt()->>'email')
  ));

-- 4. Registrations Internal Policies
drop policy if exists "Users can view their own internal registrations" on public.registrations_internal;
create policy "Users can view their own internal registrations"
  on public.registrations_internal for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own internal registrations" on public.registrations_internal;
create policy "Users can insert their own internal registrations"
  on public.registrations_internal for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins can manage all internal registrations" on public.registrations_internal;
create policy "Admins can manage all internal registrations"
  on public.registrations_internal for all
  using (exists (
    select 1 from public.admin_allowlist 
    where email = lower(auth.jwt()->>'email')
  ));

-- 5. Registrations External Policies
drop policy if exists "Users can view their own external registrations" on public.registrations_external;
create policy "Users can view their own external registrations"
  on public.registrations_external for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own external registrations" on public.registrations_external;
create policy "Users can insert their own external registrations"
  on public.registrations_external for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins can manage all external registrations" on public.registrations_external;
create policy "Admins can manage all external registrations"
  on public.registrations_external for all
  using (exists (
    select 1 from public.admin_allowlist 
    where email = lower(auth.jwt()->>'email')
  ));

-- 6. Events Policies
drop policy if exists "Anyone can view events" on public.events;
create policy "Anyone can view events"
  on public.events for select
  using (true);

drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events for all
  using (exists (
    select 1 from public.admin_allowlist 
    where email = lower(auth.jwt()->>'email')
  ));
-- =============================================================================
-- TechTrove 3.0 — Sync Missing Users
-- =============================================================================
-- Run this script in your Supabase SQL Editor if some users exist in 
-- authentication but are not showing up in the Admin Users page.
-- This script will insert any missing accounts into the correct participant tables.

-- 1. Sync missing external participants
insert into public.external_participants
  (id, username, full_name, email, participant_type, reg_number, college, phone, role)
select 
  u.id,
  coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  u.email,
  'external',
  nullif(u.raw_user_meta_data->>'reg_number', ''),
  coalesce(u.raw_user_meta_data->>'college', ''),
  coalesce(u.raw_user_meta_data->>'phone', ''),
  coalesce(u.raw_user_meta_data->>'role', 'user')
from auth.users u
where coalesce(u.raw_user_meta_data->>'participant_type', u.raw_user_meta_data->>'type', 'internal') = 'external'
  and not exists (select 1 from public.external_participants ep where ep.id = u.id)
  and not exists (select 1 from public.internal_participants ip where ip.id = u.id);

-- 2. Sync missing internal participants
insert into public.internal_participants
  (id, username, full_name, email, participant_type, reg_number, college, phone, role)
select 
  u.id,
  coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  u.email,
  'internal',
  nullif(u.raw_user_meta_data->>'reg_number', ''),
  coalesce(u.raw_user_meta_data->>'college', 'SIMATS'),
  coalesce(u.raw_user_meta_data->>'phone', ''),
  coalesce(u.raw_user_meta_data->>'role', 'user')
from auth.users u
where coalesce(u.raw_user_meta_data->>'participant_type', u.raw_user_meta_data->>'type', 'internal') = 'internal'
  and not exists (select 1 from public.external_participants ep where ep.id = u.id)
  and not exists (select 1 from public.internal_participants ip where ip.id = u.id);

-- 3. Just to be safe, make sure admin roles are synced properly using the allowlist
update public.internal_participants p
set role = 'admin'
from public.admin_allowlist a
where lower(p.email) = lower(a.email) and p.role != 'admin';

update public.external_participants p
set role = 'admin'
from public.admin_allowlist a
where lower(p.email) = lower(a.email) and p.role != 'admin';
