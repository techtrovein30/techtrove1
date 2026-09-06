-- =============================================================================
-- TechTrove 3.0 — Internal students always register for FREE
-- =============================================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor.
-- It is safe to re-run (idempotent).
--
-- What it does:
--   1. Adds 'confirmed' as a valid payment_status for registrations_internal.
--   2. Replaces the calculate_registration_fee() trigger so that:
--        * registrations_internal always get fee = 0, payment_status = 'confirmed'
--        * registrations_external keep fee = per_person * members (unchanged)
--   3. Backfills any existing internal registrations to fee = 0 / confirmed.
-- =============================================================================

-- ── 1) Allow 'confirmed' as a payment_status for internal registrations ──────
--
-- The CHECK constraint on registrations_internal currently only allows
-- ('pending', 'recorded'). We need to add 'confirmed'.

ALTER TABLE public.registrations_internal
  DROP CONSTRAINT IF EXISTS registrations_internal_payment_status_check;

ALTER TABLE public.registrations_internal
  ADD CONSTRAINT registrations_internal_payment_status_check
    CHECK (payment_status IN ('pending', 'recorded', 'confirmed'));

-- ── 2) Replace the fee-calculation trigger ────────────────────────────────────
--
-- The old trigger (from 20240101000002_secure_fees.sql) multiplied event_fee
-- by member_count for ALL registrations, including internal ones. This meant
-- internal students could end up with a non-zero fee in the DB even though
-- they are supposed to register for free. This replacement fixes that.

CREATE OR REPLACE FUNCTION public.calculate_registration_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  per_person_fee numeric;
  member_count   int;
BEGIN
  -- ── Internal registrations are ALWAYS free ────────────────────────────
  IF TG_TABLE_NAME = 'registrations_internal' THEN
    new.fee            := 0;
    new.payment_status := 'confirmed';
    RETURN new;
  END IF;

  -- ── External registrations: fee = event_fee × member_count ────────────
  SELECT registration_fee
    INTO per_person_fee
    FROM public.events
   WHERE id = new.event_id;

  IF per_person_fee IS NULL THEN
    per_person_fee := 0;
  END IF;

  member_count := jsonb_array_length(new.members);
  new.fee      := per_person_fee * member_count;

  RETURN new;
END;
$$;

-- Re-apply the trigger to both tables (replaces the old one in place).
DROP TRIGGER IF EXISTS trg_calculate_fee_internal ON public.registrations_internal;
CREATE TRIGGER trg_calculate_fee_internal
  BEFORE INSERT OR UPDATE OF members, event_id
  ON public.registrations_internal
  FOR EACH ROW EXECUTE FUNCTION public.calculate_registration_fee();

DROP TRIGGER IF EXISTS trg_calculate_fee_external ON public.registrations_external;
CREATE TRIGGER trg_calculate_fee_external
  BEFORE INSERT OR UPDATE OF members, event_id
  ON public.registrations_external
  FOR EACH ROW EXECUTE FUNCTION public.calculate_registration_fee();

-- ── 3) Backfill existing internal registrations ───────────────────────────────
--
-- Any rows already in registrations_internal may have a stale fee > 0
-- or payment_status = 'pending'. Correct them now.

UPDATE public.registrations_internal
   SET fee            = 0,
       payment_status = 'confirmed'
 WHERE fee != 0 OR payment_status NOT IN ('confirmed', 'recorded');

-- ── Sanity check ─────────────────────────────────────────────────────────────
SELECT
  'registrations_internal' AS tbl,
  count(*)                 AS total,
  count(*) FILTER (WHERE fee != 0) AS bad_fee_rows,
  count(*) FILTER (WHERE payment_status NOT IN ('confirmed', 'recorded')) AS bad_status_rows
FROM public.registrations_internal
UNION ALL
SELECT
  'registrations_external',
  count(*),
  NULL,
  NULL
FROM public.registrations_external;
