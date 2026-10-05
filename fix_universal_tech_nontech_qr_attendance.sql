-- ============================================================================
-- TechTrove 3.0: Universal QR Pass for Day 2 Technical & Non-Technical Events
-- ============================================================================
-- Run this in your Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================
-- Features:
-- 1. Universal QR token for Tech & Non-Tech: '75e4c8b2d109f35a62e84c9103b75a20'
-- 2. Any participant who registered for at least one Day 2 Tech / Non-Tech event
--    (i.e. covered by the flat ₹75 pass or free SIMATS internal registration)
--    can scan this Universal QR to participate in any event and be marked as checked in!
-- 3. Individual/separate event QR codes are NOT deleted and continue to work.
-- 4. Desk manual check-in logic is untouched.
-- 5. Zero extra egress: executed directly inside Postgres with minimal JSON payload.
-- ============================================================================

-- 1. Drop strict unique constraints on public.events attendance_token so master tokens can be shared safely
alter table public.events drop constraint if exists events_attendance_token_key cascade;
alter table public.events drop constraint if exists events_attendance_token_unique cascade;
drop index if exists public.events_attendance_token_key cascade;
drop index if exists public.events_attendance_token_idx cascade;

create index if not exists events_attendance_token_idx
  on public.events (attendance_token)
  where attendance_token is not null;

-- 2. Ensure both 'source' and 'marked_by' columns exist on attendance & registration_members
alter table public.attendance add column if not exists source text default 'qr';
alter table public.attendance add column if not exists marked_by text default 'qr_scanner';
alter table public.registration_members add column if not exists attended boolean default false;
alter table public.registration_members add column if not exists attended_at timestamptz;
alter table public.registration_members add column if not exists attended_source text default 'qr';

-- Ensure unique constraint on attendance table is (event_id, participant_id)
alter table public.attendance drop constraint if exists attendance_event_participant_unique cascade;
alter table public.attendance add constraint attendance_event_participant_unique unique (event_id, participant_id);

-- 3. Ensure master row for tech-nontech-universal exists in public.events
insert into public.events (id, name, category, day_id, attendance_token, attendance_open)
values (
  'tech-nontech-universal',
  'All Tech & Non-Tech Events (Universal ₹75 Pass)',
  'Technical & Non-Technical',
  'day-2',
  '75e4c8b2d109f35a62e84c9103b75a20',
  true
)
on conflict (id) do update
  set attendance_token = '75e4c8b2d109f35a62e84c9103b75a20',
      attendance_open = true;

-- 4. Ensure individual Day 2 Technical and Non-Technical event tokens remain verified and active
update public.events set attendance_token = 'c2d785c6556130288b23bc5930e0c897', attendance_open = true where id in ('hackathon', 'tech-hackathon') or lower(name) like '%hackathon%';
update public.events set attendance_token = '290956874150306ca19811783dc6e939', attendance_open = true where id in ('debugging', 'tech-debugging') or lower(name) like '%debugging%';
update public.events set attendance_token = 'a40b6e47c70ce8a2da3cb7868cc01327', attendance_open = true where id in ('paper-presentation', 'tech-paper-presentation') or lower(name) like '%paper%presentation%';
update public.events set attendance_token = 'd343f64181baadd8c18d1445e5f5dcc9', attendance_open = true where id in ('tech-maze', 'maze') or lower(name) like '%maze%';
update public.events set attendance_token = '598f2afc0c67c72c24c7313e0734daba', attendance_open = true where id in ('quiz', 'tech-quiz') or lower(name) like '%quiz%';
update public.events set attendance_token = '487449ffe383208b37ebb6ea11a0586d', attendance_open = true where id in ('logo-making', 'tech-logo-making') or lower(name) like '%logo%';

update public.events set attendance_token = '048c0b5cea0eb38ab212c9897ad107ff', attendance_open = true where id in ('dance', 'nontech-dance') or lower(name) like '%dance%';
update public.events set attendance_token = '3b872130193c85708506bc2d8bbc1fb0', attendance_open = true where id in ('singing', 'nontech-singing') or lower(name) like '%singing%';
update public.events set attendance_token = '20575a9e9755fc64694258c938f8c1dc', attendance_open = true where id in ('gaming', 'nontech-mobile-gaming', 'nontech-gaming') or lower(name) like '%gaming%';
update public.events set attendance_token = '3cc0ccc344defb6d48a3b5b59ec6bc88', attendance_open = true where id in ('ramp-walk', 'nontech-ramp-walk') or lower(name) like '%ramp%';
update public.events set attendance_token = '42afcf562a175493cf013832357b9b48', attendance_open = true where id in ('treasure-hunt', 'nontech-treasure-hunt') or lower(name) like '%treasure%';
update public.events set attendance_token = '4582ab70dce31f3dc148e2893284532e', attendance_open = true where id in ('connexion', 'nontech-connexion') or lower(name) like '%connexion%';
update public.events set attendance_token = 'b4b2fec065183af2ea1afaefa2a1d1ea', attendance_open = true where id in ('adaptune', 'nontech-adaptune') or lower(name) like '%adaptune%';
update public.events set attendance_token = '7df7ca111c8fb6ebc37bed39fa5bf19e', attendance_open = true where id in ('tunetopia', 'nontech-tunetopia') or lower(name) like '%tunetopia%';

-- 5. Helper function for current user email
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(btrim(coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (select email from auth.users where id = auth.uid())
  )));
$$;

grant execute on function public.current_user_email() to authenticated, anon;

-- 6. Bulletproof mark_event_attendance supporting both Day 1 Sports & Day 2 Universal Pass
create or replace function public.mark_event_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token              text := lower(btrim(coalesce(p_token, '')));
  v_is_sports          boolean := false;
  v_is_day2_universal  boolean := false;
  v_uid                uuid := auth.uid();
  v_email              text;
  v_user_name          text;
  v_target_event       record;
  v_member             record;
  v_existing           record;
  v_effective_event_id text;
  v_event_display_name text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'message', 'Please sign in to scan attendance.');
  end if;

  if v_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid attendance QR code.');
  end if;

  v_email := public.current_user_email();

  select coalesce(t.full_name, 'Participant') into v_user_name
    from (
      select full_name from public.internal_participants where id = v_uid
      union all
      select full_name from public.external_participants where id = v_uid
    ) t
   limit 1;

  if v_user_name is null then
    v_user_name := 'Participant';
  end if;

  -- Determine if this token belongs to Day 1 sports
  v_is_sports := (
    v_token = 'ba31a6b79aa1bf173badbd6f62236556'
    or exists (
      select 1 from public.events
      where attendance_token = v_token
        and (day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
    )
  );

  -- Determine if this token belongs to Day 2 Universal Pass (Tech & Non-Tech)
  v_is_day2_universal := (
    v_token = '75e4c8b2d109f35a62e84c9103b75a20'
    or exists (
      select 1 from public.events
      where attendance_token = v_token
        and id in ('tech-nontech-universal', 'day-2-universal')
    )
  );

  -- Target event from token
  select id, name, category, day_id, attendance_open
    into v_target_event
    from public.events
   where attendance_token = v_token
   limit 1;

  if v_target_event.id is not null and coalesce(v_target_event.attendance_open, true) is false then
    return jsonb_build_object('ok', false, 'reason', 'event_disabled', 'message', 'Attendance is currently closed for ' || v_target_event.name || '.');
  end if;

  -- 1. Check registration_members
  select m.id, m.registration_id, m.registration_code, m.event_id, m.member_name
    into v_member
    from public.registration_members m
   where (lower(btrim(m.email)) = v_email or (m.user_id is not null and m.user_id = v_uid))
     and (
       -- Day 1 Sports Pass check
       (v_is_sports and (
         m.event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
         or replace(m.event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'kho-kho', 'khokho', 'khokho-girls', 'throwball-girls', 'throwball', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
       ))
       -- Day 2 Universal Pass check (any Tech / Non-Tech event or ₹75 flat registration)
       or (v_is_day2_universal and (
         m.event_id in (select id from public.events where day_id = 'day-2' or lower(coalesce(category, '')) in ('technical', 'non-technical', 'non_technical', 'tech', 'nontech', 'technical & non-technical'))
         or m.event_id ~ '^(tech-|nontech-)'
         or m.event_id in ('hackathon', 'debugging', 'paper-presentation', 'tech-maze', 'quiz', 'logo-making', 'dance', 'singing', 'gaming', 'ramp-walk', 'treasure-hunt', 'connexion', 'adaptune', 'tunetopia', 'squid-game', 'pass-the-ball', 'tech-nontech-universal', 'day-2-universal')
       ))
       -- Specific event match (or Day 2 cross-event check if registered for any Day 2 event)
       or (v_target_event.id is not null and (
         m.event_id = v_target_event.id
         or regexp_replace(m.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_target_event.id, '^(tech-|nontech-|sport-)', '')
         or (
           (v_target_event.day_id = 'day-2' or lower(coalesce(v_target_event.category, '')) in ('technical', 'non-technical', 'non_technical', 'tech', 'nontech'))
           and (
             m.event_id in (select id from public.events where day_id = 'day-2' or lower(coalesce(category, '')) in ('technical', 'non-technical', 'non_technical', 'tech', 'nontech'))
             or m.event_id ~ '^(tech-|nontech-)'
             or m.event_id in ('hackathon', 'debugging', 'paper-presentation', 'tech-maze', 'quiz', 'logo-making', 'dance', 'singing', 'gaming', 'ramp-walk', 'treasure-hunt', 'connexion', 'adaptune', 'tunetopia', 'squid-game', 'pass-the-ball')
           )
         )
       ))
     )
   limit 1;

  -- 2. Fallback to registrations_internal or registrations_external
  if v_member.registration_code is null then
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
         or replace(r.event_id, 'sport-', '') in ('cricket', 'football', 'volleyball', 'kabaddi', 'kho-kho', 'khokho', 'khokho-girls', 'throwball-girls', 'throwball', 'chess', 'chess-girls', 'carrom', 'carrom-girls')
       ))
       or (v_is_day2_universal and (
         r.event_id in (select id from public.events where day_id = 'day-2' or lower(coalesce(category, '')) in ('technical', 'non-technical', 'non_technical', 'tech', 'nontech', 'technical & non-technical'))
         or r.event_id ~ '^(tech-|nontech-)'
         or r.event_id in ('hackathon', 'debugging', 'paper-presentation', 'tech-maze', 'quiz', 'logo-making', 'dance', 'singing', 'gaming', 'ramp-walk', 'treasure-hunt', 'connexion', 'adaptune', 'tunetopia', 'squid-game', 'pass-the-ball', 'tech-nontech-universal', 'day-2-universal')
       ))
       or (v_target_event.id is not null and (
         r.event_id = v_target_event.id
         or regexp_replace(r.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_target_event.id, '^(tech-|nontech-|sport-)', '')
         or (
           (v_target_event.day_id = 'day-2' or lower(coalesce(v_target_event.category, '')) in ('technical', 'non-technical', 'non_technical', 'tech', 'nontech'))
           and (
             r.event_id in (select id from public.events where day_id = 'day-2' or lower(coalesce(category, '')) in ('technical', 'non-technical', 'non_technical', 'tech', 'nontech'))
             or r.event_id ~ '^(tech-|nontech-)'
             or r.event_id in ('hackathon', 'debugging', 'paper-presentation', 'tech-maze', 'quiz', 'logo-making', 'dance', 'singing', 'gaming', 'ramp-walk', 'treasure-hunt', 'connexion', 'adaptune', 'tunetopia', 'squid-game', 'pass-the-ball')
           )
         )
       ))
     )
     limit 1;
  end if;

  -- 3. Not registered check
  if v_member.registration_code is null then
    if v_is_day2_universal then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for any Day 2 Tech / Non-Tech event (₹75 Pass required).');
    elsif v_is_sports then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for any Day 1 Sports event.');
    elsif v_target_event.id is not null then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for ' || v_target_event.name || '.');
    else
      return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid or unassigned attendance QR code.');
    end if;
  end if;

  -- Safe event ID lookup
  if v_is_day2_universal then
    v_effective_event_id := 'tech-nontech-universal';
    v_event_display_name := 'Day 2 Universal Tech & Non-Tech Pass';
  else
    v_effective_event_id := coalesce(v_target_event.id, v_member.event_id);
    select name into v_event_display_name from public.events where id = v_effective_event_id limit 1;
    if v_event_display_name is null then
      v_event_display_name := coalesce(v_target_event.name, initcap(replace(coalesce(v_effective_event_id, 'Event'), '-', ' ')));
    end if;
  end if;

  -- 4. Check duplicate attendance
  select a.id, a.marked_at
    into v_existing
    from public.attendance a
   where (
     (v_is_day2_universal and (
       a.event_id in ('tech-nontech-universal', 'day-2-universal')
       or a.event_id = v_member.event_id
     ))
     or (not v_is_day2_universal and (
       a.event_id = v_effective_event_id
       or regexp_replace(a.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_effective_event_id, '^(tech-|nontech-|sport-)', '')
     ))
   )
   and (
     (a.participant_email is not null and lower(btrim(a.participant_email)) = v_email)
     or (a.participant_id is not null and a.participant_id = v_uid::text)
     or (v_member.registration_code is not null and a.registration_code = v_member.registration_code)
   )
   and coalesce(a.status, 'present') = 'present'
   limit 1;

  if v_existing.id is not null then
    -- Even on duplicate, guarantee registration_members attended flag is set
    update public.registration_members
       set attended = true,
           attended_at = coalesce(attended_at, v_existing.marked_at, now()),
           attended_source = 'qr_scanner'
     where (
       (lower(btrim(email)) = v_email)
       or (user_id is not null and user_id = v_uid)
       or (v_member.registration_id is not null and registration_id = v_member.registration_id)
       or (v_member.registration_code is not null and registration_code = v_member.registration_code)
     );

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'event_name', v_event_display_name,
      'participant_name', coalesce(v_member.member_name, v_user_name),
      'marked_at', v_existing.marked_at,
      'message', 'Attendance already recorded for ' || v_event_display_name || '.'
    );
  end if;

  -- 5. Record verified attendance in public.attendance
  insert into public.attendance (
    event_id, participant_id, participant_email, participant_name,
    registration_code, status, marked_at, source, marked_by
  ) values (
    v_effective_event_id,
    v_uid::text,
    v_email,
    coalesce(v_member.member_name, v_user_name),
    v_member.registration_code,
    'present',
    now(),
    'qr',
    'qr_scanner'
  )
  on conflict (event_id, participant_id) do update
    set status = 'present',
        marked_at = now(),
        source = 'qr',
        marked_by = 'qr_scanner',
        participant_email = coalesce(excluded.participant_email, public.attendance.participant_email),
        participant_name = coalesce(excluded.participant_name, public.attendance.participant_name),
        registration_code = coalesce(excluded.registration_code, public.attendance.registration_code);

  -- If Day 2 Universal Pass and participant has a specific registered event, also ensure that event is recorded
  if v_is_day2_universal and v_member.event_id is not null and v_member.event_id <> v_effective_event_id then
    insert into public.attendance (
      event_id, participant_id, participant_email, participant_name,
      registration_code, status, marked_at, source, marked_by
    ) values (
      v_member.event_id,
      v_uid::text,
      v_email,
      coalesce(v_member.member_name, v_user_name),
      v_member.registration_code,
      'present',
      now(),
      'qr',
      'qr_scanner'
    )
    on conflict (event_id, participant_id) do update
      set status = 'present',
          marked_at = now(),
          source = 'qr',
          marked_by = 'qr_scanner';
  end if;

  -- 6. Update registration_members flag
  update public.registration_members
     set attended = true,
         attended_at = now(),
         attended_source = 'qr_scanner'
   where (
     (lower(btrim(email)) = v_email)
     or (user_id is not null and user_id = v_uid)
     or (v_member.registration_id is not null and registration_id = v_member.registration_id)
     or (v_member.registration_code is not null and registration_code = v_member.registration_code)
   );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_name', v_event_display_name,
    'participant_name', coalesce(v_member.member_name, v_user_name),
    'marked_at', now(),
    'message', 'Attendance recorded successfully for ' || v_event_display_name || '!'
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'reason', 'db_error',
    'message', 'Database error: ' || SQLERRM
  );
end;
$$;

grant execute on function public.mark_event_attendance(text) to authenticated, anon;

-- 7. Dedicated Uncheck RPC
create or replace function public.admin_uncheck_participant_or_team(
  p_registration_code text default null,
  p_email text default null,
  p_registration_id text default null,
  p_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg_code text := nullif(trim(p_registration_code), '');
  v_email    text := nullif(lower(trim(p_email)), '');
  v_reg_id   text := nullif(trim(p_registration_id), '');
  v_clean_ev text := nullif(lower(trim(regexp_replace(coalesce(p_event_id, ''), '^(tech-|nontech-|sport-)', ''))), '');
begin
  -- 1. Uncheck in registration_members
  update public.registration_members
     set attended = false,
         attended_at = null,
         attended_source = null,
         updated_at = now()
   where (v_reg_id is not null and registration_id = v_reg_id)
      or (v_reg_code is not null and registration_code = v_reg_code)
      or (v_email is not null and lower(btrim(email)) = v_email);

  -- 2. Remove matching rows in public.attendance
  delete from public.attendance
   where (v_reg_code is not null and registration_code = v_reg_code)
      or (v_email is not null and lower(btrim(participant_email)) = v_email and (
            v_clean_ev is null
            or lower(regexp_replace(event_id, '^(tech-|nontech-|sport-)', '')) = v_clean_ev
            or event_id in ('sports', 'sports-unified', 'sports-unified-master', 'ba31a6b79aa1bf173badbd6f62236556', 'tech-nontech-universal', 'day-2-universal', '75e4c8b2d109f35a62e84c9103b75a20')
         ));

  -- 3. Also mark status as cancelled as fallback
  update public.attendance
     set status = 'cancelled'
   where (v_reg_code is not null and registration_code = v_reg_code)
      or (v_email is not null and lower(btrim(participant_email)) = v_email and (
            v_clean_ev is null
            or lower(regexp_replace(event_id, '^(tech-|nontech-|sport-)', '')) = v_clean_ev
            or event_id in ('sports', 'sports-unified', 'sports-unified-master', 'ba31a6b79aa1bf173badbd6f62236556', 'tech-nontech-universal', 'day-2-universal', '75e4c8b2d109f35a62e84c9103b75a20')
         ));

  return jsonb_build_object('ok', true, 'message', 'Check-in successfully undone.');
end;
$$;

grant execute on function public.admin_uncheck_participant_or_team(text, text, text, text) to authenticated, anon;
