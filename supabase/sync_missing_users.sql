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
