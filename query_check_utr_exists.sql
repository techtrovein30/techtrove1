-- ============================================================================
-- Real-time UTR Uniqueness Check RPC
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
--
-- Why:
-- Direct SELECT on `registrations_external` is restricted by RLS for security.
-- This function runs as SECURITY DEFINER so that any user (even before registration)
-- can verify if a Transaction ID / UTR is unique in real time without exposing
-- participant personal data.
--
-- Safe to re-run: idempotent.
-- ============================================================================

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
     where btrim(lower(utr_number)) = v_clean
       and (v_exclude is null or registration_code <> v_exclude)
  );
end;
$$;

-- Grant execute rights to both anonymous and signed-in visitors
grant execute on function public.check_utr_exists(text, text) to anon, authenticated, service_role;
