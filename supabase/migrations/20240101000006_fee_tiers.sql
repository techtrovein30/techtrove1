-- =============================================================================
-- TechTrove 3.0 — Tiered flat fees (admin-configurable per event)
-- =============================================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor. Idempotent (safe to re-run).
--
-- NEW PRICING MODEL (external participants):
--   • Technical (day-2) & Non-Technical (day-3) events:
--       Individual, single player. ₹75 flat pass — ONE payment covers ALL
--       selected Tech/Non-Tech events in the batch (charged once per
--       registration_code; subsequent events in the same batch = ₹0).
--   • Carrom & Chess (sports):      ₹75 flat per game (per event).
--   • All other sports (teams):     ₹600 flat per team (no per-member multiply).
--   • Internal SIMATS students:     always FREE + auto-confirmed.
--
-- IMPORTANT — admin configurability:
--   Every TRIGGER fee is sourced from the event's `registration_fee` column
--   in the `events` table (NOT hardcoded). So when an admin edits an event's
--   fee it applies automatically to new registrations. To enforce the tiers
--   the admin must set each event's fee as:
--       Tech/Non-Tech = 75, Carrom/Chess = 75, other sports = 600.
--   See the accompanying update_event_fees.sql data script.
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
  -- The first event in the batch (same registration_code) carries the full
  -- flat fee; every other event in the same batch is free. A completed pass
  -- therefore grants access to all selected Tech/Non-Tech events for a single
  -- payment.
  is_tech_pass := (event_day IN ('day-2', 'day-3'));

  IF is_tech_pass THEN
    SELECT COALESCE(sum(fee), 0) INTO already_charged
      FROM public.registrations_external
     WHERE registration_code = new.registration_code;
    IF already_charged > 0 THEN
      flat_fee := 0;
    END IF;
  END IF;

  -- ── All fees are FLAT (no per-member multiplication):
  --    sports charge ₹600/team or ₹75/game, tech/non-tech charge ₹75 pass. ──
  new.fee := flat_fee;

  RETURN new;
END;
$$;

-- Re-apply the trigger to both registration tables.
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
