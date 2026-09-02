-- =============================================================================
-- TechTrove 3.0 — COMBINED DATABASE FIX QUERIES
-- =============================================================================
-- Single file merging:
--   · audit_2_querries.txt            (AUDIT_REPORT_2 DB/RLS fixes — R1-R8, N1, N5)
--   · query_change_for_rejection.txt  (payment re-upload / rejection support)
--
-- HOW TO USE
--   · Open Supabase Dashboard → SQL Editor → paste a PART → Run.
--   · Every part is idempotent (safe to re-run).
--   · References current live schema (events, internal/external participants,
--     registrations_internal/external with payment_proof_path, days).
--
-- SECURITY INVARIANT
--   NO self-service UPDATE policy is created on registrations_internal or
--   registrations_external. An unrestricted `using (auth.uid() = user_id)`
--   UPDATE policy would let a participant set payment_status='recorded' or
--   fee=0 on their own row — the C01 payment-fraud vector (R1). Participants
--   already READ the review note through the existing SELECT policy.
-- =============================================================================


-- =============================================================================
-- PART 1 — [query_change_for_rejection / N1] RE-UPLOAD & REJECTION NOTE COLUMN
-- =============================================================================
-- The admin "Request Re-upload" dialog writes the rejection/request reason into
-- payment_review_note so the participant sees it in their profile
-- (adminApi.adminRequestPaymentReupload). The column does not exist yet in any
-- migration running against this database, so this must land before the
-- feature works.
--
-- NOTE: registrations_internal now also carries payment_proof_path, so the
-- column is added to BOTH registration tables (harmless nullable column).
-- External is today's only active payment/re-upload flow.

alter table public.registrations_external
  add column if not exists payment_review_note text;

alter table public.registrations_internal
  add column if not exists payment_review_note text;

-- Remove any copy of the old (harmful) participant WRITE policy from either
-- generation of the rejection script (R1). Selecting the note on your own rows
-- is already covered by the existing "Users can view their own ..." policy.
drop policy if exists "Participants can write their own external review note"
  on public.registrations_external;
drop policy if exists "Participants can write their own external review note"
  on public.registrations_internal;
drop policy if exists "Users can view their own external registration review note"
  on public.registrations_external;

-- (Optional) Clean rows written during earlier testing:
-- update public.registrations_external set payment_review_note = null
-- where payment_review_note like 'RE_UPLOAD_REQUESTED%';


-- =============================================================================
-- PART 2 — [R2] SELF-INSERT CANNOT MARK PAYMENT AS PAID
-- =============================================================================
-- Insert policies only check auth.uid() = user_id, so a crafted REST INSERT is
-- free to pass payment_status='recorded'. A BEFORE INSERT trigger forces
-- payment_status back to 'pending' for every non-admin insert. Admins
-- (public.is_admin()) keep full control.

create or replace function public.enforce_payment_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.payment_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_on_insert_int on public.registrations_internal;
create trigger trg_enforce_payment_on_insert_int
  before insert on public.registrations_internal
  for each row execute function public.enforce_payment_on_insert();

drop trigger if exists trg_enforce_payment_on_insert_ext on public.registrations_external;
create trigger trg_enforce_payment_on_insert_ext
  before insert on public.registrations_external
  for each row execute function public.enforce_payment_on_insert();


-- =============================================================================
-- PART 3 — [R3 + R4] HARDEN calculate_registration_fee()
-- =============================================================================
-- The current function computes fee = event.registration_fee ×
-- jsonb_array_length(members) with no minimum and no member-count validation
-- (an empty members='[]' array yields fee 0), and it is SECURITY DEFINER
-- without SET search_path (H12).

create or replace function public.calculate_registration_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  per_person_fee numeric;
  event_players   int;
  member_count    int;
begin
  select registration_fee, required_players
    into per_person_fee, event_players
  from public.events
  where id = new.event_id;

  per_person_fee := coalesce(per_person_fee, 0);
  event_players  := coalesce(event_players, 1);

  member_count := jsonb_array_length(new.members);

  -- R3: an event entry must have at least its required number of players.
  if member_count is null or member_count < event_players then
    raise exception 'A team for this event needs at least % member(s) (got %).',
      event_players, coalesce(member_count, 0);
  end if;

  -- The fee is never below one person's fee (zero-fee fraud guard).
  new.fee := per_person_fee * member_count;
  if per_person_fee > 0 and new.fee < per_person_fee then
    new.fee := per_person_fee;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calculate_fee_internal on public.registrations_internal;
create trigger trg_calculate_fee_internal
  before insert or update of members, event_id on public.registrations_internal
  for each row execute function public.calculate_registration_fee();

drop trigger if exists trg_calculate_fee_external on public.registrations_external;
create trigger trg_calculate_fee_external
  before insert or update of members, event_id on public.registrations_external
  for each row execute function public.calculate_registration_fee();


-- =============================================================================
-- PART 4 — [R7] DECOMMISSION THE LEGACY PUBLIC 'payment_screenshots' BUCKET
-- =============================================================================
-- Migration 003 created the bucket as public=true; migration 004 removed its
-- RLS policies but could not delete the bucket (Supabase blocks SQL deletion
-- via protect_delete()). Existing objects stayed world-readable.

-- 4a. Make sure no old storage policy can read/write it (idempotent).
drop policy if exists "Anyone can upload payment screenshots" on storage.objects;
drop policy if exists "Anyone can view payment screenshots" on storage.objects;

-- 4b. MANUAL (SQL cannot do this): Supabase Dashboard → Storage →
--     payment_screenshots → delete all objects → delete the bucket.

-- 4c. Re-flag any leftover references so the app stops serving old URLs.
update public.registrations_external
set payment_screenshot_path = null,
    payment_screenshot_url  = null
where payment_screenshot_path like '%payment_screenshots%'
   or payment_screenshot_url  like '%payment_screenshots%';

-- 4d. Verify nothing references the old bucket:
-- select id, utr_number, payment_screenshot_path, payment_screenshot_url
-- from public.registrations_external
-- where payment_screenshot_path like '%payment_screenshots%'
--    or payment_screenshot_url  like '%payment_screenshots%';


-- =============================================================================
-- PART 5 — [N5] ADMIN OPERATIONS AUDIT LOG (recommended)
-- =============================================================================
-- Admin actions (payment_status changes, re-upload requests, deletions) are
-- otherwise unlogged — impossible to investigate incidents.

create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  row_id       text not null,
  action       text not null,             -- INSERT / UPDATE / DELETE
  old_data     jsonb,
  new_data     jsonb,
  performed_by uuid,                      -- auth.uid() at the time
  performed_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins can read audit log" on public.admin_audit_log;
create policy "Admins can read audit log"
  on public.admin_audit_log for select
  using (public.is_admin());

-- Audit trigger (registrations_external)
create or replace function public.log_external_registration_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.admin_audit_log (table_name, row_id, action, old_data, performed_by)
    values ('registrations_external', old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;

  insert into public.admin_audit_log (table_name, row_id, action, old_data, new_data, performed_by)
  values (
    'registrations_external',
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_external_reg on public.registrations_external;
create trigger trg_audit_external_reg
  after insert or update or delete on public.registrations_external
  for each row execute function public.log_external_registration_change();

-- Audit trigger (registrations_internal)
create or replace function public.log_internal_registration_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.admin_audit_log (table_name, row_id, action, old_data, performed_by)
    values ('registrations_internal', old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;

  insert into public.admin_audit_log (table_name, row_id, action, old_data, new_data, performed_by)
  values (
    'registrations_internal',
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_internal_reg on public.registrations_internal;
create trigger trg_audit_internal_reg
  after insert or update or delete on public.registrations_internal
  for each row execute function public.log_internal_registration_change();


-- =============================================================================
-- PART 6 — VERIFICATION QUERIES (optional, informational)
-- =============================================================================

-- No self-own UPDATE policy exists on registration tables (expect 0 rows):
select schemaname, tablename, policyname, cmd
from pg_policies
where tablename in ('registrations_internal', 'registrations_external')
  and cmd = 'UPDATE'
order by tablename;

-- Review-note columns present (expect 2 rows):
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('registrations_internal', 'registrations_external')
  and column_name = 'payment_review_note'
order by table_name;

-- Payment triggers present (expect 4 rows: 2 fee + 2 enforce-pending):
select event_object_table, trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('registrations_internal', 'registrations_external')
order by event_object_table, trigger_name;

-- Audit log working (expect your latest insert/update):
select * from public.admin_audit_log order by id desc limit 20;


-- =============================================================================
-- PART 7 — REVERT (undo everything above)
-- =============================================================================
-- Only run this if you must fully roll back the combined script.

-- 7a. Columns
alter table public.registrations_external drop column if exists payment_review_note;
alter table public.registrations_internal drop column if exists payment_review_note;

-- 7b. Storage flags (returns legacy URL/path values to their pre-fix state)
-- update public.registrations_external
-- set payment_screenshot_path = payment_screenshot_url
-- where payment_screenshot_path is null and payment_screenshot_url is not null;

-- 7c. Triggers (audit + enforce-pending) and their functions
drop trigger if exists trg_audit_external_reg on public.registrations_external;
drop trigger if exists trg_audit_internal_reg on public.registrations_internal;
drop trigger if exists trg_enforce_payment_on_insert_ext on public.registrations_external;
drop trigger if exists trg_enforce_payment_on_insert_int on public.registrations_internal;
drop function if exists public.log_external_registration_change();
drop function if exists public.log_internal_registration_change();
drop function if exists public.enforce_payment_on_insert();

-- 7d. Audit table + policy
drop policy if exists "Admins can read audit log" on public.admin_audit_log;
drop table if exists public.admin_audit_log;

-- 7e. calculate_registration_fee() was hardened with `create or replace`.
--     Reverting it to the ORIGINAL (unvalidated) version is NOT recommended —
--     that restores the zero-fee / empty-members fraud window. To restore it,
--     re-run migration 20240101000002_secure_fees.sql which self-heals.

-- 7f. Old policies (from the pre-merge rejection script's REVERT block)
drop policy if exists "Users can view their own external registration review note"
  on public.registrations_external;
-- =============================================================================