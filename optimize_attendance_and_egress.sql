-- ============================================================================
-- TechTrove 3.0: Attendance Priority & Egress/Log Ingestion Optimization
-- Run this in your Supabase Project Dashboard -> SQL Editor
-- ============================================================================

-- ─── 1. REALTIME PUBLICATION CLEANUP ─────────────────────────────────────────
-- Since registrations are mostly complete, remove registration and queue tables
-- from supabase_realtime. Keep only attendance and registration_members so
-- logical replication WAL and WebSocket traffic are 100% focused on attendance.

do $$
begin
  -- Remove registration and email queue tables from supabase_realtime publication
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'registrations_internal') then
    execute 'alter publication supabase_realtime drop table public.registrations_internal';
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'registrations_external') then
    execute 'alter publication supabase_realtime drop table public.registrations_external';
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'email_outbox') then
    execute 'alter publication supabase_realtime drop table public.email_outbox';
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'email_queue_control') then
    execute 'alter publication supabase_realtime drop table public.email_queue_control';
  end if;

  -- Ensure attendance and registration_members ARE in the publication
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'attendance') then
    execute 'alter publication supabase_realtime add table public.attendance';
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'registration_members') then
    execute 'alter publication supabase_realtime add table public.registration_members';
  end if;
end $$;

-- ─── 2. HIGH PERFORMANCE ATTENDANCE & ROSTER INDEXES ─────────────────────────
-- These indexes accelerate coordinator roster loading and instant scan verification.

create index if not exists attendance_event_marked_idx 
  on public.attendance (event_id, marked_at desc);

create index if not exists attendance_event_participant_idx 
  on public.attendance (event_id, participant_id);

create index if not exists attendance_event_email_idx 
  on public.attendance (event_id, lower(participant_email));

create index if not exists reg_members_event_lookup_idx 
  on public.registration_members (event_id, attended);

create index if not exists reg_members_event_email_idx 
  on public.registration_members (event_id, lower(btrim(email)));

-- ─── 3. ROW LEVEL SECURITY (RLS) OPTIMIZATION ────────────────────────────────
-- Wrapping auth.uid() and is_admin() in (select ...) allows Postgres to evaluate
-- the condition once per query rather than once per row scanned.
-- Explicitly casting both sides as ::text avoids 42883 (uuid = text) errors.

-- 3A. registrations_internal
drop policy if exists "reg_internal_select" on public.registrations_internal;
create policy "reg_internal_select" on public.registrations_internal
  for select to authenticated
  using (user_id::text = (select auth.uid())::text or (select public.is_admin()));

-- 3B. registrations_external
drop policy if exists "reg_external_select" on public.registrations_external;
create policy "reg_external_select" on public.registrations_external
  for select to authenticated
  using (user_id::text = (select auth.uid())::text or (select public.is_admin()));

-- 3C. registration_members
drop policy if exists "registration_members_select" on public.registration_members;
create policy "registration_members_select" on public.registration_members
  for select to authenticated
  using (
    lower(btrim(email)) = (select public.current_user_email())
    or user_id::text = (select auth.uid())::text
    or (select public.is_admin())
    or public.is_event_coordinator(event_id)
  );

-- 3D. attendance
drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance
  for select to authenticated
  using (
    participant_id::text = (select auth.uid())::text
    or lower(btrim(participant_email)) = (select public.current_user_email())
    or (select public.is_admin())
    or public.is_event_coordinator(event_id)
  );

-- ─── 4. SUMMARY RPC FOR ADMIN COMMAND CENTER ─────────────────────────────────
-- Avoids downloading all registration rows to count totals and revenue.
create or replace function public.get_admin_dashboard_stats()
returns json
language plpgsql
security definer
stable
as $$
declare
  v_users_count int := 0;
  v_internal_regs int := 0;
  v_external_regs int := 0;
  v_recorded_revenue numeric := 0;
  v_pending_count int := 0;
  v_reupload_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select count(*) into v_users_count
    from (
      select id from public.internal_participants where coalesce(role, 'user') <> 'admin'
      union all
      select id from public.external_participants where coalesce(role, 'user') <> 'admin'
    ) u;

  select count(*) into v_internal_regs from public.registrations_internal;
  select count(*) into v_external_regs from public.registrations_external;

  select
    coalesce(sum(case when payment_status = 'recorded' then fee else 0 end), 0),
    count(*) filter (where payment_status = 'pending'),
    count(*) filter (where payment_status <> 'recorded' and payment_review_note is not null)
  into v_recorded_revenue, v_pending_count, v_reupload_count
  from public.registrations_external;

  return json_build_object(
    'totalUsers', v_users_count,
    'totalRegistrations', v_internal_regs + v_external_regs,
    'revenue', v_recorded_revenue,
    'pendingPayments', v_pending_count,
    'reuploadRequests', v_reupload_count
  );
end;
$$;

grant execute on function public.get_admin_dashboard_stats() to authenticated;
