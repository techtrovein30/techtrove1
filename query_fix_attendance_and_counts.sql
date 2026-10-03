-- ============================================================================
-- TechTrove 3.0: Fix Attendance, Live Counts, and Registration Roster
-- ============================================================================
-- RUN THIS IN SUPABASE DASHBOARD -> SQL EDITOR -> NEW QUERY -> RUN
-- ============================================================================

-- 1. Ensure Attendance Tokens in events table for all events
-- Unified Sports Token for Day 1
update public.events
   set attendance_token = 'ba31a6b79aa1bf173badbd6f62236556'
 where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%';

-- Canonical Technical & Non-Technical Tokens
update public.events set attendance_token = 'c2d785c6556130288b23bc5930e0c897' where id in ('hackathon', 'tech-hackathon') or lower(name) like '%hackathon%';
update public.events set attendance_token = '290956874150306ca19811783dc6e939' where id in ('debugging', 'tech-debugging') or lower(name) like '%debugging%';
update public.events set attendance_token = 'a40b6e47c70ce8a2da3cb7868cc01327' where id in ('paper-presentation', 'tech-paper-presentation') or lower(name) like '%paper%presentation%';
update public.events set attendance_token = 'd343f64181baadd8c18d1445e5f5dcc9' where id in ('tech-maze', 'maze') or lower(name) like '%maze%';
update public.events set attendance_token = '598f2afc0c67c72c24c7313e0734daba' where id in ('quiz', 'tech-quiz') or lower(name) like '%quiz%';
update public.events set attendance_token = '487449ffe383208b37ebb6ea11a0586d' where id in ('logo-making', 'tech-logo-making') or lower(name) like '%logo%';

update public.events set attendance_token = '048c0b5cea0eb38ab212c9897ad107ff' where id in ('dance', 'nontech-dance') or lower(name) like '%dance%';
update public.events set attendance_token = '3b872130193c85708506bc2d8bbc1fb0' where id in ('singing', 'nontech-singing') or lower(name) like '%singing%';
update public.events set attendance_token = '20575a9e9755fc64694258c938f8c1dc' where id in ('gaming', 'nontech-mobile-gaming', 'nontech-gaming') or lower(name) like '%gaming%';
update public.events set attendance_token = '3cc0ccc344defb6d48a3b5b59ec6bc88' where id in ('ramp-walk', 'nontech-ramp-walk') or lower(name) like '%ramp%';
update public.events set attendance_token = '42afcf562a175493cf013832357b9b48' where id in ('treasure-hunt', 'nontech-treasure-hunt') or lower(name) like '%treasure%';
update public.events set attendance_token = '4582ab70dce31f3dc148e2893284532e' where id in ('connexion', 'nontech-connexion') or lower(name) like '%connexion%';
update public.events set attendance_token = 'b4b2fec065183af2ea1afaefa2a1d1ea' where id in ('adaptune', 'nontech-adaptune') or lower(name) like '%adaptune%';
update public.events set attendance_token = '7df7ca111c8fb6ebc37bed39fa5bf19e' where id in ('tunetopia', 'nontech-tunetopia') or lower(name) like '%tunetopia%';
update public.events set attendance_token = 'a6316df246aa65c01aa4cd7f9fbe56c6' where id in ('squid-game', 'nontech-squid-game') or lower(name) like '%squid%game%';
update public.events set attendance_token = 'c182e151fb5cac13011dc2f9c9b1b04f' where id in ('pass-the-ball', 'nontech-pass-the-ball') or lower(name) like '%pass%ball%';

-- Dynamically generate valid 32-char tokens for any other events created in the events table
update public.events
   set attendance_token = md5('techtrove_event_' || regexp_replace(lower(id), '^(tech-|nontech-|sport-)', ''))
 where (attendance_token is null or attendance_token = '' or attendance_token = '00000000000000000000000000000000')
   and not (day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%');

-- 2. Enhanced mark_event_attendance RPC
create or replace function public.mark_event_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
     a.event_id = v_effective_event_id
     or regexp_replace(a.event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_effective_event_id, '^(tech-|nontech-|sport-)', '')
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
     event_id = v_effective_event_id
     or regexp_replace(event_id, '^(tech-|nontech-|sport-)', '') = regexp_replace(v_effective_event_id, '^(tech-|nontech-|sport-)', '')
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
$$;

grant execute on function public.mark_event_attendance(text) to authenticated;

-- 3. Dynamic get_attendance_hub_stats RPC (100% dynamic, matches Admin Dashboard counts)
create or replace function public.get_attendance_hub_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats jsonb := '{}'::jsonb;
  rec record;
  v_sports_total int := 0;
  v_sports_attended int := 0;
begin
  for rec in (
    with all_regs as (
      -- Every row in registrations_internal and registrations_external represents 1 registration entry
      select lower(btrim(coalesce(event_id, ''))) as raw_id
      from public.registrations_internal
      where coalesce(event_id, '') <> ''
      union all
      select lower(btrim(coalesce(event_id, ''))) as raw_id
      from public.registrations_external
      where coalesce(event_id, '') <> ''
    ),
    raw_counts as (
      select raw_id, count(*)::int as reg_count
      from all_regs
      group by raw_id
    ),
    clean_counts as (
      select
        regexp_replace(raw_id, '^(tech-|nontech-|sport-)', '') as clean_id,
        sum(reg_count)::int as clean_total
      from raw_counts
      group by 1
    ),
    attendance_raw as (
      select
        lower(btrim(coalesce(event_id, ''))) as raw_id,
        count(distinct lower(btrim(coalesce(participant_email, participant_id, ''))))::int as attended_count
      from public.attendance
      where (status = 'present' or status is null)
        and coalesce(event_id, '') <> ''
      group by 1
    ),
    attendance_clean as (
      select
        regexp_replace(raw_id, '^(tech-|nontech-|sport-)', '') as clean_id,
        sum(attended_count)::int as clean_attended
      from attendance_raw
      group by 1
    ),
    all_keys as (
      select distinct raw_id as key_id from raw_counts
      union
      select distinct clean_id as key_id from clean_counts
      union
      select distinct lower(btrim(id)) as key_id from public.events
      union
      select distinct regexp_replace(lower(btrim(id)), '^(tech-|nontech-|sport-)', '') as key_id from public.events
    )
    select
      k.key_id,
      regexp_replace(k.key_id, '^(tech-|nontech-|sport-)', '') as clean_id,
      coalesce(rc.reg_count, cc.clean_total, 0) as total,
      coalesce(ar.attended_count, ac.clean_attended, 0) as attended
    from all_keys k
    left join raw_counts rc on rc.raw_id = k.key_id
    left join clean_counts cc on cc.clean_id = regexp_replace(k.key_id, '^(tech-|nontech-|sport-)', '')
    left join attendance_raw ar on ar.raw_id = k.key_id
    left join attendance_clean ac on ac.clean_id = regexp_replace(k.key_id, '^(tech-|nontech-|sport-)', '')
    where k.key_id <> ''
  ) loop
    v_stats := v_stats || jsonb_build_object(
      rec.key_id, jsonb_build_object('total', rec.total, 'attended', rec.attended),
      'tech-' || rec.clean_id, jsonb_build_object('total', rec.total, 'attended', rec.attended),
      'nontech-' || rec.clean_id, jsonb_build_object('total', rec.total, 'attended', rec.attended),
      'sport-' || rec.clean_id, jsonb_build_object('total', rec.total, 'attended', rec.attended)
    );
  end loop;

  -- Map every event in public.events
  for rec in (select id, category, day_id from public.events) loop
    declare
      v_clean text := regexp_replace(lower(btrim(rec.id)), '^(tech-|nontech-|sport-)', '');
      v_is_sport boolean := (rec.day_id = 'day-1' or lower(coalesce(rec.category, '')) like 'sport%');
      v_sub_total int := coalesce((v_stats -> rec.id ->> 'total')::int, (v_stats -> v_clean ->> 'total')::int, 0);
      v_sub_attended int := coalesce((v_stats -> rec.id ->> 'attended')::int, (v_stats -> v_clean ->> 'attended')::int, 0);
    begin
      if not (v_stats ? rec.id) and (v_stats ? v_clean) then
        v_stats := v_stats || jsonb_build_object(rec.id, v_stats -> v_clean);
      end if;

      if v_is_sport then
        v_sports_total := v_sports_total + v_sub_total;
      end if;
    end;
  end loop;

  -- Calculate distinct attended athletes across all sports
  select count(distinct lower(btrim(coalesce(participant_email, participant_id, ''))))::int
    into v_sports_attended
    from public.attendance
   where (status = 'present' or status is null)
     and (
       event_id = 'sports-unified-master'
       or event_id in (select id from public.events where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%')
       or lower(coalesce(event_id, '')) like 'sport-%'
     );

  v_stats := v_stats || jsonb_build_object(
    'sports-unified-master', jsonb_build_object('total', v_sports_total, 'attended', v_sports_attended),
    'sports-unified', jsonb_build_object('total', v_sports_total, 'attended', v_sports_attended)
  );

  return v_stats;
end;
$$;

grant execute on function public.get_attendance_hub_stats() to authenticated, anon;

-- 4. Sync / Backfill registration_members from registrations_internal and registrations_external
insert into public.registration_members (
  id, registration_id, registration_code, user_id, event_id,
  team_name, captain_name, participant_type, payment_status,
  member_name, member_role, position, email, reg_number, phone, college
)
select
  gen_random_uuid(),
  r.id::text,
  r.registration_code,
  coalesce(
    case when r.user_id is not null and r.user_id::text ~* '^[0-9a-f-]{36}$' then r.user_id::text::uuid else null end,
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  r.event_id,
  r.team_name,
  r.captain_name,
  'internal',
  coalesce(r.payment_status, 'confirmed'),
  coalesce(m->>'name', r.captain_name, 'Participant'),
  coalesce(m->>'role', 'player'),
  coalesce((m->>'position')::int, 0),
  coalesce(
    nullif(lower(btrim(coalesce(m->>'email', ''))), ''),
    p.email,
    lower(btrim(r.registration_code)) || '_' || coalesce(m->>'position', '0') || '@techtrove.live'
  ),
  coalesce(m->>'regNumber', p.reg_number),
  coalesce(m->>'phone', p.phone),
  coalesce(m->>'college', p.college)
from public.registrations_internal r
left join public.internal_participants p on p.id = r.user_id,
lateral jsonb_array_elements(
  case
    when to_jsonb(r.members) is not null and jsonb_typeof(to_jsonb(r.members)) = 'array' and jsonb_array_length(to_jsonb(r.members)) > 0
      then to_jsonb(r.members)
    else jsonb_build_array(jsonb_build_object('name', coalesce(r.captain_name, 'Participant'), 'role', 'captain', 'position', 0))
  end
) as m
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
  coalesce(
    case when r.user_id is not null and r.user_id::text ~* '^[0-9a-f-]{36}$' then r.user_id::text::uuid else null end,
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  r.event_id,
  r.team_name,
  r.captain_name,
  'external',
  coalesce(r.payment_status, 'confirmed'),
  coalesce(m->>'name', r.captain_name, 'Participant'),
  coalesce(m->>'role', 'player'),
  coalesce((m->>'position')::int, 0),
  coalesce(
    nullif(lower(btrim(coalesce(m->>'email', ''))), ''),
    p.email,
    lower(btrim(r.registration_code)) || '_' || coalesce(m->>'position', '0') || '@techtrove.live'
  ),
  coalesce(m->>'regNumber', p.reg_number),
  coalesce(m->>'phone', p.phone),
  coalesce(m->>'college', p.college)
from public.registrations_external r
left join public.external_participants p on p.id = r.user_id,
lateral jsonb_array_elements(
  case
    when to_jsonb(r.members) is not null and jsonb_typeof(to_jsonb(r.members)) = 'array' and jsonb_array_length(to_jsonb(r.members)) > 0
      then to_jsonb(r.members)
    else jsonb_build_array(jsonb_build_object('name', coalesce(r.captain_name, 'Participant'), 'role', 'captain', 'position', 0))
  end
) as m
on conflict do nothing;

-- 5. Ensure RLS policies on attendance and registration_members
alter table if exists public.attendance enable row level security;
drop policy if exists "attendance_authenticated_insert" on public.attendance;
create policy "attendance_authenticated_insert" on public.attendance
  for insert to authenticated with check (true);

drop policy if exists "attendance_authenticated_select" on public.attendance;
create policy "attendance_authenticated_select" on public.attendance
  for select to authenticated using (true);

drop policy if exists "attendance_anon_select" on public.attendance;
create policy "attendance_anon_select" on public.attendance
  for select to anon using (true);
