-- ============================================================================
-- TechTrove 3.0: Unified Sports Pass & Individual Tech/Non-Tech QR Migration
-- ============================================================================
-- 1. Updates attendance_token index so all Sports events can share one QR code.
-- 2. Updates mark_event_attendance to automatically resolve the student's
--    registered sports event when the unified sports QR code is scanned.
-- 3. Keeps separate QR codes for each Technical and Non-Technical event.
-- ============================================================================

-- 1. Drop strict unique index to allow sports events to share the same attendance token
drop index if exists public.events_attendance_token_key;
create index if not exists events_attendance_token_idx
  on public.events (attendance_token)
  where attendance_token is not null;

-- 2. Enhanced mark_event_attendance RPC
create or replace function public.mark_event_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token     text := lower(btrim(coalesce(p_token, '')));
  v_uid       uuid := auth.uid();
  v_email     text;
  v_user_name text;
  v_event     record;
  v_member    record;
  v_existing  record;
  v_reg_id    text;
  v_reg_code  text;
  v_marked    timestamptz;
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
  -- (If this is the unified sports token, it finds the specific sport the participant registered for)
  select e.id, e.name, e.attendance_open, e.registration_open,
         m.registration_id, m.registration_code, coalesce(m.member_name, v_user_name) as member_name
    into v_event
    from public.events e
    join public.registration_members m
      on m.event_id = e.id and lower(btrim(m.email)) = v_email
   where e.attendance_token = v_token
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
      ) r on r.event_id = e.id and r.user_id::text = v_uid::text
     where e.attendance_token = v_token
     limit 1;
  end if;

  -- 3. If still null, check if any event exists with this token to provide an informative error
  if v_event.id is null then
    select e.id, e.name, e.category, e.day_id
      into v_event
      from public.events e
     where e.attendance_token = v_token
     limit 1;

    if v_event.id is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid attendance QR code.');
    end if;

    if coalesce(v_event.day_id, '') = 'day-1' or lower(coalesce(v_event.category, '')) like 'sport%' then
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
     set attended = true
   where event_id = v_event.id
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

grant execute on function public.mark_event_attendance(text) to authenticated;
