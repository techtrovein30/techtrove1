-- ============================================================================
-- 20261004120100_create_registration_member_stats_view.sql
--
-- Replaces the check-in desk's biggest read with a 27-row aggregate.
--
-- THE PROBLEM
-- -----------
-- getAttendanceEventStats() in src/lib/coordinatorApi.ts wants, per event,
-- "how many members" and "how many have attended". It was doing that by
-- selecting every row of registration_members - name, email, phone, college -
-- and counting in the browser. That table held ~41,700 rows (33 MB), so each
-- call transferred megabytes, repeatedly, for as long as the desk was open.
--
-- THE FIX
-- -------
-- Count inside Postgres and return one row per event. The desk's polling
-- then transfers a few KB instead of tens of megabytes.
--
-- The app at src/lib/coordinatorApi.ts queries this view by name, so it is
-- required for the frontend to run - do not remove it.
--
-- SAFETY: `security_invoker = ON` is REQUIRED, not decorative.
-- A plain CREATE VIEW runs with the view owner's rights, and RLS is not
-- enforced for a table's own owner - so the obvious version of this statement
-- would silently bypass the row-level security confirmed as active on
-- registration_members, exposing every member's details through the public
-- API key. security_invoker makes the view evaluate RLS as the calling user.
--
-- The view exposes counts only - no names, emails, phones or colleges.
--
-- Requires PostgreSQL 15+. This project is on 17.6.
--
-- Idempotent. Adds an object only; never modifies a row.
-- ============================================================================


CREATE OR REPLACE VIEW public.registration_member_stats
WITH (security_invoker = ON) AS
SELECT
  m.event_id,

  -- Members on this event's roster.
  count(*) AS member_rows,

  -- How many of those rows are flagged attended.
  count(*) FILTER (WHERE m.attended) AS attended_rows,

  -- How many DISTINCT PEOPLE that is.
  --
  -- The browser-side code this replaced built a Set of lower-cased, trimmed
  -- emails, so one person appearing twice on a roster counted once. Counting
  -- distinct people rather than rows keeps that number identical, which
  -- matters because a team event can legitimately contain two members sharing
  -- an email address.
  count(DISTINCT btrim(lower(m.email)))
    FILTER (WHERE m.attended AND btrim(COALESCE(m.email, '')) <> '')
    AS attended_people

FROM public.registration_members m
GROUP BY m.event_id;


-- Only a signed-in admin reads this. Grant the signed-in role only, and take
-- SELECT away from the public 'anon' key. service_role bypasses RLS regardless
-- and needs no grant.
GRANT SELECT ON public.registration_member_stats TO authenticated;
REVOKE ALL ON public.registration_member_stats FROM anon;


-- ----------------------------------------------------------------------------
-- Fail loudly if the view would leak member rows through RLS.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_opts text[];
BEGIN
  SELECT c.reloptions INTO v_opts
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'registration_member_stats';

  IF v_opts IS NULL OR NOT ('security_invoker=on' = ANY (v_opts)) THEN
    RAISE EXCEPTION
      'registration_member_stats must be security_invoker=on or it bypasses RLS on registration_members';
  END IF;

  IF has_table_privilege('anon', 'public.registration_member_stats', 'SELECT') THEN
    RAISE EXCEPTION
      'anon still has SELECT on registration_member_stats - revoke it';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.registration_member_stats', 'SELECT') THEN
    RAISE EXCEPTION
      'authenticated lost SELECT on registration_member_stats - the desk will break';
  END IF;
END $$;


-- ============================================================================
-- Post-migration verification (read-only)
--
-- Expect rows_returned_by_view to be roughly the number of events (~27), NOT
-- the member row count. Run before and after deploying the frontend change -
-- the two numbers are the whole point.
-- ============================================================================
-- SELECT count(*) AS rows_returned_by_view
-- FROM public.registration_member_stats;
--
-- Expect anon_can_read = false and logged_in_can_read = true:
-- SELECT has_table_privilege('anon',         'public.registration_member_stats', 'SELECT') AS anon_can_read,
--        has_table_privilege('authenticated', 'public.registration_member_stats', 'SELECT') AS logged_in_can_read;