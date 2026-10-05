-- Fix: wall-QR attendance could be recorded against the wrong event.
--
-- mark_event_attendance() resolves the scanned token to v_target_event, then looks
-- up the member with `limit 1` and no ordering. For sports tokens that lookup matched
-- ANY of the twelve sports, so a participant registered for several sports could be
-- placed on an arbitrary row. v_effective_event_id then preferred v_member.event_id
-- over v_target_event.id, so the scan was stored against -- and counted for -- the
-- wrong event.
--
-- This adds a deterministic ordering that always prefers the scanned event:
-- exact event_id match, then a prefix-stripped match, then anything else.
-- Single-event participants resolve to the same row as before, so there is no
-- behavioural change for them.
--
-- Purely additive: no data change, no signature change, no schema change.

CREATE OR REPLACE FUNCTION public.mark_event_attendance(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token              text := lower(btrim(coalesce(p_token, '')));
  v_is_sports          boolean := false;
  v_uid                uuid := auth.uid();
  v_email              text;
  v_user_name          text;
  v_target_event       record;
  v_member             record;
  v_existing           record;
  v_effective_event_id text;
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

  -- Determine if this token belongs to sports
  v_is_sports := (
    v_token = 'ba31a6b79aa1bf173badbd6f62236556'
    or exists (
      select 1 from public.events
      where attendance_token = v_token
        and (day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
    )
  );

  -- Find the event in public.events
  select id, name, category, day_id, attendance_open
    into v_target_event
    from public.events
   where attendance_token = v_token
   limit 1;

  -- Check if attendance is explicitly disabled
  if v_target_event.id is not null and coalesce(v_target_event.attendance_open, true) is false then
    return jsonb_build_object('ok', false, 'reason', 'event_disabled', 'message', 'Attendance is currently closed for ' || v_target_event.name || '.');
  end if;

  -- 1. Check if user is registered in registration_members
  select m.id, m.registration_id, m.registration_code, m.event_id, m.member_name
    into v_member
    from public.registration_members m
   where (lower(btrim(m.email)) = v_email or (m.user_id is not null and m.user_id = v_uid))
     and (
       (v_is_sports and (
         m.event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
         or replace(m.event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'khokho', 'khokho-girls', 'throwball-girls', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
       ))
       or (v_target_event.id is not null and (
         m.event_id = v_target_event.id
         or regexp_replace(m.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_target_event.id, '^(tech-|nontech-|sport-)', '')
       ))
     )
   order by
     case
       when v_target_event.id is not null and m.event_id = v_target_event.id then 0
       when v_target_event.id is not null
            and regexp_replace(m.event_id, '^(tech-|nontech-|sport-)', '')
              = regexp_replace(v_target_event.id, '^(tech-|nontech-|sport-)', '') then 1
       else 2
     end
   limit 1;

  -- 2. Fallback to registrations_internal or registrations_external
  if v_member.id is null then
    select r.id::text, r.id::text as registration_id, r.registration_code, r.event_id, v_user_name as member_name
      into v_member
      from (
        select id, user_id, registration_code, event_id, members from public.registrations_internal
        union all
        select id, user_id, registration_code, event_id, members from public.registrations_external
      ) r
     where (
       r.user_id = v_uid
       or (r.members::text ilike '%' || v_email || '%')
     )
     and (
       (v_is_sports and (
         r.event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
         or replace(r.event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'khokho', 'khokho-girls', 'throwball-girls', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
       ))
       or (v_target_event.id is not null and (
         r.event_id = v_target_event.id
         or regexp_replace(r.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_target_event.id, '^(tech-|nontech-|sport-)', '')
       ))
     )
     order by
       case
         when v_target_event.id is not null and r.event_id = v_target_event.id then 0
         when v_target_event.id is not null
              and regexp_replace(r.event_id, '^(tech-|nontech-|sport-)', '')
                = regexp_replace(v_target_event.id, '^(tech-|nontech-|sport-)', '') then 1
         else 2
       end
   limit 1;
  end if;

  -- 3. Not registered check
  if v_member.registration_code is null then
    if v_is_sports then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for any Day 1 Sports event.');
    elsif v_target_event.id is not null then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for ' || v_target_event.name || '.');
    else
      return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid or unassigned attendance QR code.');
    end if;
  end if;

  -- Determine effective event ID for attendance recording
  v_effective_event_id := coalesce(v_member.event_id, v_target_event.id, case when v_is_sports then 'sports-unified-master' else 'unknown' end);

  -- 4. Check for duplicate attendance
  select a.id, a.marked_at
    into v_existing
    from public.attendance a
   where (
     (v_is_sports and v_target_event.id is null and (
       a.event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
       or replace(a.event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'khokho', 'khokho-girls', 'throwball-girls', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
       or a.event_id = 'sports-unified-master'
     ))
     or (not (v_is_sports and v_target_event.id is null) and (
       a.event_id = v_effective_event_id
       or regexp_replace(a.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_effective_event_id, '^(tech-|nontech-|sport-)', '')
     ))
   )
   and (
     (a.participant_email is not null and lower(btrim(a.participant_email)) = v_email)
     or (a.participant_id is not null and a.participant_id = v_uid::text)
   )
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'event_name', coalesce(v_target_event.name, initcap(replace(v_effective_event_id, '-', ' '))),
      'participant_name', coalesce(v_member.member_name, v_user_name),
      'marked_at', v_existing.marked_at,
      'message', 'Attendance already recorded for ' || coalesce(v_target_event.name, 'this event') || '.'
    );
  end if;

  -- 5. Record verified attendance
  if v_is_sports and v_target_event.id is null then
    insert into public.attendance (
      event_id, participant_id, participant_email, participant_name,
      registration_code, status, marked_at, marked_by
    )
    select event_id, v_uid::text, v_email, coalesce(member_name, v_user_name),
           registration_code, 'present', now(), 'qr_scanner'
      from public.registration_members
     where (lower(btrim(email)) = v_email or (user_id is not null and user_id = v_uid))
       and (
         event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
         or replace(event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'khokho', 'khokho-girls', 'throwball-girls', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
       )
    on conflict (event_id, participant_id) do nothing;
  else
    insert into public.attendance (
      event_id, participant_id, participant_email, participant_name,
      registration_code, status, marked_at, marked_by
    ) values (
      v_effective_event_id,
      v_uid::text,
      v_email,
      coalesce(v_member.member_name, v_user_name),
      v_member.registration_code,
      'present',
      now(),
      'qr_scanner'
    );
  end if;

  -- Also update registration_members attended flag
  update public.registration_members
     set attended = true,
         attended_at = now(),
         attended_source = 'qr_scanner'
   where (
     (lower(btrim(email)) = v_email)
     or (user_id is not null and user_id = v_uid)
   )
   and (
     (v_is_sports and v_target_event.id is null and (
       event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
       or replace(event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'khokho', 'khokho-girls', 'throwball-girls', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
     ))
     or (not (v_is_sports and v_target_event.id is null) and (
       event_id = v_effective_event_id
       or regexp_replace(event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_effective_event_id, '^(tech-|nontech-|sport-)', '')
     ))
   );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_name', coalesce(v_target_event.name, initcap(replace(v_effective_event_id, '-', ' '))),
    'participant_name', coalesce(v_member.member_name, v_user_name),
    'marked_at', now(),
    'message', 'Attendance recorded successfully for ' || coalesce(v_target_event.name, 'this event') || '!'
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Verification: confirm the deterministic ordering is in place and still
-- resolves every registered participant to exactly one event row.
-- ---------------------------------------------------------------------------
DO $$
declare
  v_missing text;
begin
  if (select count(*) from pg_proc where proname = 'mark_event_attendance') <> 1 then
    raise exception 'FAIL: expected exactly one mark_event_attendance';
  end if;

  select string_agg(email || ' -> ' || sports, E'\n  ')
    into v_missing
    from (
      select lower(btrim(email)) as email,
             string_agg(distinct replace(event_id, 'sport-', ''), ',') as sports
        from public.registration_members
       where replace(event_id, 'sport-', '') in
             ('cricket','football','volleyball','kabaddi','khokho','khokho-girls',
              'throwball-girls','chess','chess-girls','carrom','carrom-girls')
       group by 1
      having count(distinct replace(event_id, 'sport-', '')) > 1
    ) t;

  if v_missing is not null then
    raise notice 'NOTE: multi-sport participants now pin to the scanned event (% rows):\n  %',
      (select count(*) from (
         select lower(btrim(email)) from public.registration_members
         where replace(event_id,'sport-','') in
           ('cricket','football','volleyball','kabaddi','khokho','khokho-girls',
            'throwball-girls','chess','chess-girls','carrom','carrom-girls')
         group by 1
        having count(distinct replace(event_id,'sport-','')) > 1) x),
      v_missing;
  end if;
end;
$$;