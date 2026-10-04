-- ============================================================================
-- 20261004120200_add_registration_members_normalized_email_index.sql
--
-- Makes the check-in scan path an index scan instead of a sequential scan.
--
-- THE PROBLEM
-- -----------
-- public.admin_scan_checkin() resolves a scanned QR token to an email, then
-- marks that person present. It looks the person up like this:
--
--   where lower(btrim(rm.email)) = v_email
--     and public.checkin_code_is_paid(rm.registration_code)
--
-- That predicate wraps the column in an expression. No plain btree index on
-- `email` can serve it, so the planner fell back to a sequential scan of the
-- whole roster - and it does that twice per scan: once to count, once to
-- UPDATE. Every one of those rows also evaluated
-- checkin_code_is_paid(rm.registration_code).
--
-- Measured on this project before this index:
--   Sequential scan, ~880 buffers, 450-1200 ms per lookup.
--
-- Measured after this index:
--   Index Scan, 5 buffers, 2.06 ms per lookup.
--
-- For scale: before the 20261004 roster de-duplication the same lookup walked
-- 41,753 rows (~83,000 checkin_code_is_paid() calls per scan). It now walks
-- ~8. At 6,000 attendees that is the difference between a queue at the gate
-- and a desk that keeps up.
--
-- WHY THE EXISTING EMAIL INDEXES DO NOT HELP
-- -----------------------------------------
-- Three email indexes already existed and none of them could serve the scan:
--
--   idx_reg_members_email             (email)                 904 kB
--   idx_registration_members_email    (email)                 448 kB
--   reg_members_event_email_idx       (event_id, lower(btrim(email)))  768 kB
--
-- The first two index the bare column, so they cannot match lower(btrim(email)).
-- The third is a functional index, but `event_id` is the LEADING column and the
-- scan does not constrain event_id - a person may be rostered on several events
-- and the function deliberately marks them present on all of them. Postgres
-- cannot use a composite index with an unconstrained leading column. All three
-- showed idx_scan = 0 (or 1) in pg_stat_user_indexes.
--
-- reg_members_event_email_idx MUST BE KEPT. It is the correct index for
-- public.sync_attendance_to_roster(), which filters on BOTH event_id and
-- lower(btrim(email)). Do not drop it as part of a dead-index cleanup - the
-- leading column is load-bearing there.
--
-- WHY NOT CREATE INDEX CONCURRENTLY
-- ---------------------------------
-- CONCURRENTLY cannot run inside a transaction block, and Supabase applies
-- migration files inside one. On a 7,100-row table a plain CREATE INDEX takes
-- a ShareLock for a few milliseconds, which blocks writes but not the SELECTs
-- the desk is doing. Prefer running the CONCURRENTLY form by hand if the desk
-- happens to be mid-scan; this file stays transaction-safe so it can be replayed
-- on a fresh database.
--
-- SAFETY: additive only. Creates an index, never modifies a row, and is
-- idempotent via IF NOT EXISTS.
-- ============================================================================


CREATE INDEX IF NOT EXISTS idx_reg_members_email_norm
  ON public.registration_members (lower(btrim(email)))
  INCLUDE (registration_code, attended);


-- ----------------------------------------------------------------------------
-- Fail loudly if the index is missing - without it the scan silently returns
-- to a sequential scan and the desk gets slow again with no error anywhere.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_indexdef(c.oid) INTO v_def
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'idx_reg_members_email_norm';

  IF v_def IS NULL THEN
    RAISE EXCEPTION
      'idx_reg_members_email_norm is missing - admin_scan_checkin() will sequentially scan registration_members';
  END IF;

  IF v_def NOT ILIKE '%lower(btrim(email))%' THEN
    RAISE EXCEPTION
      'idx_reg_members_email_norm does not index the normalised email: %', v_def;
  END IF;
END $$;


-- ============================================================================
-- Post-migration verification (read-only)
--
-- Expect "Index Scan using idx_reg_members_email_norm" (or "Index Only Scan").
-- A "Seq Scan" here means the index is unusable and the scan path is slow again.
-- ============================================================================
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT count(*), count(*) FILTER (WHERE attended)
-- FROM public.registration_members
-- WHERE lower(btrim(email)) = '<a real member email>';
--
-- Confirm reg_members_event_email_idx is still present. sync_attendance_to_roster()
-- depends on its (event_id, lower(btrim(email))) column order:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'registration_members' AND indexname ILIKE '%email%';