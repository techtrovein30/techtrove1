-- Fix: Bypass payment checks for event check-in.
-- Since the event is tomorrow and payments are not expected,
-- this function now unconditionally returns true so that any
-- registered participant can be checked in without being blocked by payment status.

CREATE OR REPLACE FUNCTION public.checkin_code_is_paid(p_registration_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT true;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_code_is_paid(text) TO authenticated, anon;
