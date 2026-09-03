-- =============================================================================
-- TechTrove 3.0 — Fee Restructure (flat tiered pricing)
-- =============================================================================
-- Run ONCE in Supabase Dashboard → SQL Editor. Idempotent (safe to re-run).
-- Verified against the current TechTrove DB schema.
--
-- NEW PRICING MODEL (external participants):
--   • Technical (day-2) & Non-Technical (day-3) events:
--       Individual, single player. ₹75 flat pass — ONE payment covers ALL
--       selected Tech/Non-Tech events (charged once per registration_code;
--       every other event in the same batch = ₹0). No team.
--   • Carrom & Chess (day-1):        ₹75 flat per game.
--   • All other sports (day-1):      ₹600 flat per team (no per-member multiply).
--   • Internal SIMATS students:      always FREE + auto-confirmed.
--
-- ADMIN CONFIGURABILITY:
--   Every fee is sourced from the event's `registration_fee` column in the
--   `events` table (NOT hardcoded in the trigger). So when an admin edits an
--   event's fee in the dashboard, new registrations pick it up automatically.
--   This script sets the default fees per tier; the admin can change any
--   event's fee afterwards and the change applies.
-- =============================================================================


-- =============================================================================
-- 1) REPLACE THE FEE TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calculate_registration_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  flat_fee        numeric;
  is_tech_pass    boolean;
  already_charged numeric;
  event_day       text;
BEGIN
  -- ── Internal SIMATS students are ALWAYS free + confirmed ────────────────
  IF TG_TABLE_NAME = 'registrations_internal' THEN
    new.fee            := 0;
    new.payment_status := 'confirmed';
    RETURN new;
  END IF;

  -- ── External: read the admin-configurable fee from the events table ─────
  SELECT day_id, registration_fee
    INTO event_day, flat_fee
    FROM public.events
   WHERE id = new.event_id;

  IF flat_fee IS NULL THEN
    flat_fee := 0;
  END IF;

  -- ── Tech / Non-Tech events (Day 2 / Day 3) share ONE flat pass ──────────
  is_tech_pass := (event_day IN ('day-2', 'day-3'));

  IF is_tech_pass THEN
    SELECT COALESCE(sum(fee), 0) INTO already_charged
      FROM public.registrations_external
     WHERE registration_code = new.registration_code;
    IF already_charged > 0 THEN
      flat_fee := 0;
    END IF;
  END IF;

  -- ── All fees are FLAT (no per-member multiplication) ────────────────────
  new.fee := flat_fee;

  RETURN new;
END;
$$;

-- Re-apply the trigger to both registration tables (replaces any old trigger).
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


-- =============================================================================
-- 2) SET DEFAULT FEES PER TIER
-- =============================================================================
--   Tech / Non-Tech (day-2, day-3):  ₹75 flat pass
--   Carrom & Chess (day-1):          ₹75 per game
--   All other sports (day-1):        ₹600 flat per team
-- The admin can override any of these per event afterwards.

-- 2a) Technical & Non-Technical: ₹75 flat pass
UPDATE public.events
   SET registration_fee = 75
 WHERE day_id IN ('day-2', 'day-3');

-- 2b) Carrom & Chess: ₹75 per game
UPDATE public.events
   SET registration_fee = 75
 WHERE day_id = 'day-1'
   AND lower(name) IN ('carrom', 'chess', 'carroms', 'chees', 'carrom board', 'international chess');

-- 2c) All other sports: ₹600 flat per team
UPDATE public.events
   SET registration_fee = 600
 WHERE day_id = 'day-1'
   AND lower(name) NOT IN ('carrom', 'chess', 'carroms', 'chees', 'carrom board', 'international chess');


-- =============================================================================
-- 3) BACKFILL EXISTING EXTERNAL REGISTRATIONS TO THE NEW FLAT MODEL
-- =============================================================================
--   • Every external registration now stores the flat fee of ITS event
--     (75 for tech/non-tech and carrom/chess, 600 for other sports), capped
--     so a tech/non-tech batch is only charged once per registration_code.
--   • Internal registrations are forced to fee = 0 / confirmed.
--
-- This recomputes fees from the (now correct) events table so the admin
-- dashboard revenue figures are consistent immediately.

-- 3a) Internal: force free + confirmed
UPDATE public.registrations_internal
   SET fee            = 0,
       payment_status = 'confirmed'
 WHERE fee != 0 OR payment_status NOT IN ('confirmed', 'recorded');

-- 3b) External sports (day-1): flat per-event fee
UPDATE public.registrations_external r
   SET fee = e.registration_fee
  FROM public.events e
 WHERE r.event_id = e.id
   AND e.day_id = 'day-1';

-- 3c) External tech/non-tech (day-2/day-3): flat pass, charged ONCE per batch
--     The first event of each registration_code carries the full flat fee;
--     all other events in the same batch are set to 0.
WITH batch_first AS (
  SELECT registration_code,
         min(event_id) AS first_event_id
    FROM public.registrations_external r
    JOIN public.events e ON e.id = r.event_id
   WHERE e.day_id IN ('day-2', 'day-3')
   GROUP BY registration_code
)
UPDATE public.registrations_external r
   SET fee = CASE
               WHEN r.event_id = b.first_event_id THEN e.registration_fee
               ELSE 0
             END
  FROM public.events e, batch_first b
 WHERE r.event_id = e.id
   AND e.day_id IN ('day-2', 'day-3')
   AND r.registration_code = b.registration_code;


-- =============================================================================
-- 4) VERIFY
-- =============================================================================
SELECT 'events' AS scope, day_id, name, registration_fee
  FROM public.events
 ORDER BY day_id, name;

SELECT 'internal' AS scope, count(*) FILTER (WHERE fee = 0 AND payment_status = 'confirmed') AS correct,
       count(*) FILTER (WHERE fee != 0 OR payment_status NOT IN ('confirmed', 'recorded')) AS stale
  FROM public.registrations_internal;

SELECT 'external' AS scope,
       count(*) FILTER (WHERE (SELECT day_id FROM public.events WHERE id = registrations_external.event_id) = 'day-1' AND fee = (SELECT registration_fee FROM public.events WHERE id = registrations_external.event_id)) AS sports_correct,
       count(*) FILTER (WHERE (SELECT day_id FROM public.events WHERE id = registrations_external.event_id) IN ('day-2', 'day-3') AND fee > 0) AS techpass_charged_count
  FROM public.registrations_external;
