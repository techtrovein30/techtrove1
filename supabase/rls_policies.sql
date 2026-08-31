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
  using (public.is_admin());

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
  using (public.is_admin());

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
  using (public.is_admin());

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
  using (public.is_admin());

-- 6. Events Policies
drop policy if exists "Anyone can view events" on public.events;
create policy "Anyone can view events"
  on public.events for select
  using (true);

drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());
