-- =============================================================================
-- TechTrove 3.0 — Flat Fee for Technical and Non-Technical Events
-- =============================================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor.
-- It replaces the fee trigger so that external participants pay a flat fee
-- of Rs 75 for Tech (day-2) and Non-Tech (day-3) events combined.

CREATE OR REPLACE FUNCTION public.calculate_registration_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  per_person_fee numeric;
  member_count   int;
  is_tech_event  boolean;
  existing_fee   numeric;
BEGIN
  -- Internal registrations are ALWAYS free
  IF TG_TABLE_NAME = 'registrations_internal' THEN
    new.fee            := 0;
    new.payment_status := 'confirmed';
    RETURN new;
  END IF;

  -- External registrations
  -- Check if it's a Tech/Non-Tech event (Day 2 or Day 3)
  SELECT (day_id IN ('day-2', 'day-3')) INTO is_tech_event
    FROM public.events
   WHERE id = new.event_id;

  IF is_tech_event THEN
    -- Flat fee of 75 per person for Tech/Non-Tech
    per_person_fee := 75;

    -- Check if this transaction (registration_code) already charged the pass fee
    -- This allows multi-insert transactions from the API to only charge once!
    SELECT sum(fee) INTO existing_fee
      FROM public.registrations_external
     WHERE registration_code = new.registration_code;

    IF coalesce(existing_fee, 0) > 0 THEN
      -- Already charged for the first selected Tech/Non-Tech event in this batch
      per_person_fee := 0;
    END IF;
  ELSE
    -- Normal sports event: use event fee
    SELECT registration_fee INTO per_person_fee
      FROM public.events
     WHERE id = new.event_id;
  END IF;

  IF per_person_fee IS NULL THEN
    per_person_fee := 0;
  END IF;

  member_count := jsonb_array_length(new.members);
  new.fee      := per_person_fee * member_count;

  RETURN new;
END;
$$;
