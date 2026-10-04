-- ============================================================================
-- 20261004120000_fix_sync_registration_members_rls_delete.sql
--
-- Fixes silent 6x duplication of registration_members rosters.
--
-- THE BUG
-- -------
-- public.sync_registration_members() is a trigger function on
-- registrations_internal / registrations_external. It rebuilds a
-- registration's roster like this:
--
--     DELETE FROM registration_members WHERE registration_id = NEW.id;
--     <insert one row per member from the registrations.members jsonb>
--
-- The DELETE silently affected ZERO rows because the function was created
-- WITHOUT SECURITY DEFINER, so it executed with the *caller's* privileges and
-- was therefore subject to row-level security on registration_members.
--
-- Every DELETE policy on that table requires admin:
--     registration_members_delete  -> is_admin()
--     tt_regmembers_delete        -> tt_is_admin()
-- while the INSERT policies explicitly permit a regular participant
-- (tt_regmembers_insert, matched on the member email appearing in the
-- caller's own registration jsonb).
--
-- So on every edit of a registration -- payment screenshot upload, UTR entry,
-- payment_status change -- the INSERT succeeded and the DELETE was filtered
-- out by RLS. Each edit appended one more full copy of the roster.
--
-- Evidence: 6,217 registrations held 41,748 member rows instead of ~7,100,
-- with 96.3% of registrations sitting at exactly 6x their JSON member count.
-- Registrations that were inserted but never edited sat at a clean 1x.
--
-- Compounding it, the UNIQUE index on certificate_id never helped: Postgres
-- treats NULLs as distinct in a unique index, and 34,662 of the duplicated
-- rows had certificate_id IS NULL.
--
-- THE FIX
-- -------
--   1. SECURITY DEFINER  - the function runs as its owner, which owns
--      registration_members, so its own DELETE is no longer filtered by RLS.
--   2. SET search_path    - pins name resolution (defence in depth, and
--      matches the convention used by the other trigger functions here).
--   3. Restore check-in state from the attendance table after a rebuild.
--      registration_members.attended is only a mirror maintained by
--      trg_sync_attendance_to_roster; a rebuild would otherwise reset every
--      attended flag to false and silently wipe check-ins. attendance is the
--      source of truth, so it is read back directly rather than relying on
--      certificate_id, which is NULL for most legacy rows.
--
-- This migration is idempotent and safe to re-run. It does not delete or
-- modify any existing row.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The corrected function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_registration_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  evt_name text;
  part_type   text;
  reg_college text;
  m           jsonb;
  mem_pos     int;
  mem_role    text;
  cert_code   text;
  mem_email   text;
  mem_name    text;
  idx         int := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.registration_members WHERE registration_id = OLD.id;
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'registrations_internal' THEN
    part_type := 'internal';
    SELECT college INTO reg_college FROM public.internal_participants WHERE id = NEW.user_id;
    IF reg_college IS NULL OR reg_college = '' THEN
      reg_college := 'Saveetha Institute of Medical and Technical Sciences (SIMATS)';
    END IF;
  ELSE
    part_type := 'external';
    SELECT college INTO reg_college FROM public.external_participants WHERE id = NEW.user_id;
    IF reg_college IS NULL OR reg_college = '' THEN
      reg_college := 'External College';
    END IF;
  END IF;

  SELECT name INTO evt_name FROM public.events WHERE id = NEW.event_id;
  IF evt_name IS NULL THEN
    evt_name := NEW.event_id;
  END IF;

  -- Rebuild the roster. This DELETE only works because of SECURITY DEFINER.
  DELETE FROM public.registration_members WHERE registration_id = NEW.id;

  FOR m IN SELECT * FROM jsonb_array_elements(NEW.members)
  LOOP
    mem_name := COALESCE(trim(m->>'name'), '');
    IF mem_name != '' THEN
      idx := idx + 1;
      mem_pos   := COALESCE((m->>'position')::int, idx);
      mem_role  := COALESCE(m->>'role', 'player');
      mem_email := COALESCE(trim(m->>'email'), '');
      cert_code := 'TT3-' || NEW.registration_code || '-' || NEW.event_id || '-M' || idx;

      INSERT INTO public.registration_members (
        registration_id, registration_code, user_id, event_id, event_name,
        team_name, captain_name, participant_type, payment_status,
        member_name, member_role, position, email, reg_number, phone,
        college, certificate_id
      ) VALUES (
        NEW.id, NEW.registration_code, NEW.user_id, NEW.event_id, evt_name,
        NEW.team_name, NEW.captain_name, part_type, NEW.payment_status,
        mem_name, mem_role, mem_pos, mem_email,
        COALESCE(trim(COALESCE(m->>'regNumber', m->>'reg_number')), ''),
        COALESCE(trim(m->>'phone'), ''),
        reg_college, cert_code
      );
    END IF;
  END LOOP;

  -- Restore check-in state from the attendance table, which is the source of
  -- truth. Mirrors sync_attendance_to_roster() but scoped to the single
  -- registration that was just rebuilt.
  UPDATE public.registration_members m
     SET attended        = true,
         attended_at     = a.marked_at,
         attended_source = a.source,
         updated_at      = now()
    FROM public.attendance a
   WHERE a.event_id = m.event_id
     AND m.registration_id = NEW.id
     AND lower(btrim(m.email)) = lower(btrim(a.participant_email));

  RETURN NEW;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 2. Re-assert the triggers so this migration is self-contained
--    (a schema rebuilt from migrations must end up with these in place)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_reg_members_ext ON public.registrations_external;
CREATE TRIGGER trg_sync_reg_members_ext
AFTER INSERT OR DELETE OR UPDATE ON public.registrations_external
FOR EACH ROW EXECUTE FUNCTION public.sync_registration_members();

DROP TRIGGER IF EXISTS trg_sync_reg_members_int ON public.registrations_internal;
CREATE TRIGGER trg_sync_reg_members_int
AFTER INSERT OR DELETE OR UPDATE ON public.registrations_internal
FOR EACH ROW EXECUTE FUNCTION public.sync_registration_members();


-- ----------------------------------------------------------------------------
-- 3. Fail loudly if the fix did not take effect
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'sync_registration_members'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION
      'sync_registration_members is not SECURITY DEFINER - roster duplication will return';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('registrations_internal', 'registrations_external')
      AND t.tgname LIKE '%sync_reg_members%'
      AND t.tgenabled = 'D'
  ) THEN
    RAISE EXCEPTION 'a sync_registration_members trigger is disabled';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 4. Post-migration verification (read-only)
--
-- Expect mismatched_registrations = 0. Any non-zero value means a roster has
-- drifted from its registrations.members jsonb and should be inspected.
-- ----------------------------------------------------------------------------
-- WITH reg AS (
--   SELECT id, jsonb_array_length(coalesce(members,'[]'::jsonb)) AS n
--   FROM public.registrations_internal
--   UNION ALL
--   SELECT id, jsonb_array_length(coalesce(members,'[]'::jsonb))
--   FROM public.registrations_external
-- ),
-- act AS (
--   SELECT registration_id, count(*) AS c
--   FROM public.registration_members
--   GROUP BY registration_id
-- )
-- SELECT count(*) FILTER (WHERE coalesce(act.c,0) <> reg.n)
--          AS mismatched_registrations
-- FROM reg
-- LEFT JOIN act ON act.registration_id = reg.id;


-- ============================================================================
-- NOTE: the one-off cleanup that removed the already-accumulated duplicates
-- (41,748 -> 7,106 rows) was applied manually and is intentionally NOT part
-- of this migration. A freshly built schema never accumulates them, so
-- re-running that DELETE against new data would be wrong.
-- ============================================================================