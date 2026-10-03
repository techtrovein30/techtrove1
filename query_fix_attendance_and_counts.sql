-- ============================================================================
-- TechTrove 3.0: Fix Attendance, Live Counts, and Registration Roster
-- ============================================================================
-- RUN THIS IN SUPABASE DASHBOARD -> SQL EDITOR -> NEW QUERY -> RUN
-- ============================================================================

-- 1. Ensure Attendance Tokens in events table for all events
update public.events
   set attendance_token = 'ba31a6b79aa1bf173badbd6f62236556'
 where day_id = 'day-1' or lower(coalesce(category, '')) like 'sport%';

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

-- 2. Enhanced mark_event_attendance RPC (resilient token and event prefix matching)
create or replace function public.mark_event_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token         text := lower(btrim(coalesce(p_token, '')));
  v_is_sports     boolean := (
    v_token = 'ba31a6b79aa1bf173badbd6f62236556'
    or v_token in (
      '42f72b973a4435f9aef271a8fe028992', -- cricket
      'ab30b6937266257e63ba609931840c68', -- football
      '1aa8125cc6422b40182407d3cb802c2d', -- volleyball
      'a4589e9420537421ae5343bbff9bcf40', -- kabaddi
      '18631d75d480ce4c8f0979a200d3e08e', -- kho-kho
      '87cb2c00f1f675db80174d5af7caaf54', -- throwball
      'e08dfc0be793e4b9d70dc9aa9beca60b', -- chess
      '6fb1e0984a6a4ba1ede4f6459869a0f4'  -- carrom
    )
  );
  v_canonical_event_id text := case v_token
    when 'ba31a6b79aa1bf173badbd6f62236556' then 'sports-unified-master'
    when 'c2d785c6556130288b23bc5930e0c897' then 'hackathon'
    when '290956874150306ca19811783dc6e939' then 'debugging'
    when 'a40b6e47c70ce8a2da3cb7868cc01327' then 'paper-presentation'
    when 'd343f64181baadd8c18d1445e5f5dcc9' then 'tech-maze'
    when '598f2afc0c67c72c24c7313e0734daba' then 'quiz'
    when '487449ffe383208b37ebb6ea11a0586d' then 'logo-making'
    when '048c0b5cea0eb38ab212c9897ad107ff' then 'dance'
    when '3b872130193c85708506bc2d8bbc1fb0' then 'singing'
    when '20575a9e9755fc64694258c938f8c1dc' then 'gaming'
    when '3cc0ccc344defb6d48a3b5b59ec6bc88' then 'ramp-walk'
    when '42afcf562a175493cf013832357b9b48' then 'treasure-hunt'
    when '4582ab70dce31f3dc148e2893284532e' then 'connexion'
    when 'b4b2fec065183af2ea1afaefa2a1d1ea' then 'adaptune'
    when '7df7ca111c8fb6ebc37bed39fa5bf19e' then 'tunetopia'
    else null
  end;
  v_uid           uuid := auth.uid();
  v_email         text;
  v_user_name     text;
  v_event         record;
  v_member        record;
  v_existing      record;
  v_reg_id        text;
  v_reg_code      text;
  v_marked        timestamptz;
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

  -- 1. Check if user is registered in registration_members for ANY event matching this token or canonical ID
  select e.id, e.name, e.attendance_open, e.registration_open,
         m.registration_id, m.registration_code, coalesce(m.member_name, v_user_name) as member_name
    into v_event
    from public.events e
    join public.registration_members m
      on (
        m.event_id = e.id
        or m.event_id = replace(e.id, 'tech-', '')
        or m.event_id = replace(e.id, 'nontech-', '')
        or m.event_id = replace(e.id, 'sport-', '')
        or e.id = replace(m.event_id, 'tech-', '')
        or e.id = replace(m.event_id, 'nontech-', '')
        or e.id = replace(m.event_id, 'sport-', '')
        or (v_canonical_event_id is not null and (
             replace(m.event_id, 'tech-', '') = v_canonical_event_id
          or replace(m.event_id, 'nontech-', '') = v_canonical_event_id
          or replace(m.event_id, 'sport-', '') = v_canonical_event_id
        ))
      )
      and lower(btrim(m.email)) = v_email
   where (
     e.attendance_token = v_token
     or (v_is_sports and (coalesce(e.day_id, '') = 'day-1' or lower(coalesce(e.category, '')) like 'sport%'))
     or (v_canonical_event_id is not null and (
       e.id = v_canonical_event_id
       or e.id = 'tech-' || v_canonical_event_id
       or e.id = 'nontech-' || v_canonical_event_id
       or e.id = 'sport-' || v_canonical_event_id
     ))
   )
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
      ) r on (
        r.event_id = e.id
        or r.event_id = replace(e.id, 'tech-', '')
        or r.event_id = replace(e.id, 'nontech-', '')
        or r.event_id = replace(e.id, 'sport-', '')
        or e.id = replace(r.event_id, 'tech-', '')
        or e.id = replace(r.event_id, 'nontech-', '')
        or e.id = replace(r.event_id, 'sport-', '')
        or (v_canonical_event_id is not null and (
             replace(r.event_id, 'tech-', '') = v_canonical_event_id
          or replace(r.event_id, 'nontech-', '') = v_canonical_event_id
          or replace(r.event_id, 'sport-', '') = v_canonical_event_id
        ))
      )
      and r.user_id::text = v_uid::text
     where (
       e.attendance_token = v_token
       or (v_is_sports and (coalesce(e.day_id, '') = 'day-1' or lower(coalesce(e.category, '')) like 'sport%'))
       or (v_canonical_event_id is not null and (
         e.id = v_canonical_event_id
         or e.id = 'tech-' || v_canonical_event_id
         or e.id = 'nontech-' || v_canonical_event_id
         or e.id = 'sport-' || v_canonical_event_id
       ))
     )
     limit 1;
  end if;

  -- 3. Informative error if event exists but participant is not registered
  if v_event.id is null then
    select e.id, e.name, e.category, e.day_id
      into v_event
      from public.events e
     where (
       e.attendance_token = v_token
       or (v_is_sports and (coalesce(e.day_id, '') = 'day-1' or lower(coalesce(e.category, '')) like 'sport%'))
       or (v_canonical_event_id is not null and (
         e.id = v_canonical_event_id
         or e.id = 'tech-' || v_canonical_event_id
         or e.id = 'nontech-' || v_canonical_event_id
         or e.id = 'sport-' || v_canonical_event_id
       ))
     )
     limit 1;

    if v_event.id is null and v_canonical_event_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'not_registered', 'message', 'You are not registered for ' || initcap(replace(v_canonical_event_id, '-', ' ')) || '.');
    end if;

    if v_event.id is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_qr', 'message', 'Invalid attendance QR code.');
    end if;

    if v_is_sports or coalesce(v_event.day_id, '') = 'day-1' or lower(coalesce(v_event.category, '')) like 'sport%' then
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
   where (
     a.event_id = v_event.id
     or replace(a.event_id, 'tech-', '') = replace(v_event.id, 'tech-', '')
     or replace(a.event_id, 'nontech-', '') = replace(v_event.id, 'nontech-', '')
     or replace(a.event_id, 'sport-', '') = replace(v_event.id, 'sport-', '')
   )
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
     set attended = true,
         attended_at = v_marked,
         attended_source = 'qr',
         updated_at = now()
   where (
     event_id = v_event.id
     or event_id = replace(v_event.id, 'tech-', '')
     or event_id = replace(v_event.id, 'nontech-', '')
     or event_id = replace(v_event.id, 'sport-', '')
   )
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

grant execute on function public.mark_event_attendance(text) to authenticated, anon;

-- 3. get_attendance_hub_stats RPC (Live counts for Admin Checkin page)
create or replace function public.get_attendance_hub_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats jsonb;
begin
  with all_registered as (
    -- Member counts from registration_members
    select
      regexp_replace(lower(btrim(coalesce(event_id, ''))), '^(tech-|nontech-|sport-)', '') as clean_id,
      count(*)::int as count_members
    from public.registration_members
    group by 1

    union all

    -- Fallback from registrations tables (captain + team members)
    select
      regexp_replace(lower(btrim(coalesce(r.event_id, ''))), '^(tech-|nontech-|sport-)', '') as clean_id,
      sum(case when jsonb_typeof(r.members) = 'array' and jsonb_array_length(r.members) > 0 then jsonb_array_length(r.members) else 1 end)::int as count_members
    from (
      select event_id, members from public.registrations_internal
      union all
      select event_id, members from public.registrations_external
    ) r
    group by 1
  ),
  aggregated_totals as (
    select clean_id, max(count_members)::int as total_members
    from all_registered
    where clean_id <> ''
    group by clean_id
  ),
  attended_counts as (
    select
      regexp_replace(lower(btrim(coalesce(event_id, ''))), '^(tech-|nontech-|sport-)', '') as clean_id,
      count(distinct lower(btrim(participant_email)))::int as attended_count
    from public.attendance
    where status = 'present' or status is null
    group by 1
  )
  select jsonb_object_agg(
    clean_id,
    jsonb_build_object(
      'total', greatest(coalesce(t.total_members, 0), coalesce(a.attended_count, 0)),
      'attended', coalesce(a.attended_count, 0)
    )
  ) into v_stats
  from (
    select distinct clean_id from aggregated_totals
    union
    select distinct clean_id from attended_counts
    union
    select distinct regexp_replace(lower(btrim(id)), '^(tech-|nontech-|sport-)', '') as clean_id from public.events
  ) u
  left join aggregated_totals t on t.clean_id = u.clean_id
  left join attended_counts a on a.clean_id = u.clean_id;

  return coalesce(v_stats, '{}'::jsonb);
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
  r.user_id::text,
  r.event_id,
  r.team_name,
  r.captain_name,
  'internal',
  coalesce(r.payment_status, 'confirmed'),
  coalesce(m->>'name', r.captain_name),
  coalesce(m->>'role', 'player'),
  coalesce((m->>'position')::int, 0),
  lower(btrim(coalesce(m->>'email', ''))),
  m->>'regNumber',
  m->>'phone',
  m->>'college'
from public.registrations_internal r,
     lateral jsonb_array_elements(case when jsonb_typeof(r.members) = 'array' and jsonb_array_length(r.members) > 0 then r.members else jsonb_build_array(jsonb_build_object('name', r.captain_name, 'role', 'captain', 'position', 0)) end) as m
where coalesce(m->>'email', '') != ''
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
  r.user_id::text,
  r.event_id,
  r.team_name,
  r.captain_name,
  'external',
  coalesce(r.payment_status, 'confirmed'),
  coalesce(m->>'name', r.captain_name),
  coalesce(m->>'role', 'player'),
  coalesce((m->>'position')::int, 0),
  lower(btrim(coalesce(m->>'email', ''))),
  m->>'regNumber',
  m->>'phone',
  m->>'college'
from public.registrations_external r,
     lateral jsonb_array_elements(case when jsonb_typeof(r.members) = 'array' and jsonb_array_length(r.members) > 0 then r.members else jsonb_build_array(jsonb_build_object('name', r.captain_name, 'role', 'captain', 'position', 0)) end) as m
where coalesce(m->>'email', '') != ''
on conflict do nothing;

-- Ensure RLS allows attendance recording and viewing
alter table if exists public.attendance enable row level security;
drop policy if exists "attendance_authenticated_insert" on public.attendance;
create policy "attendance_authenticated_insert" on public.attendance
  for insert to authenticated with check (true);

drop policy if exists "attendance_authenticated_select" on public.attendance;
create policy "attendance_authenticated_select" on public.attendance
  for select to authenticated using (true);
