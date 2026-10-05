-- Script to remove all check-ins for Technical and Non-Technical events
-- This leaves Sports (Day 1) check-ins untouched.

BEGIN;

-- 1. Delete from the attendance table for all tech/non-tech events
DELETE FROM public.attendance
WHERE event_id IN (
    SELECT id 
    FROM public.events 
    WHERE day_id != 'day-1' 
      AND lower(coalesce(category, '')) NOT LIKE 'sport%'
);

-- 2. Reset the attended flags in registration_members for all tech/non-tech events
UPDATE public.registration_members
SET attended = false,
    attended_at = null,
    attended_source = null
WHERE event_id IN (
    SELECT id 
    FROM public.events 
    WHERE day_id != 'day-1' 
      AND lower(coalesce(category, '')) NOT LIKE 'sport%'
);

-- Note: We intentionally do not delete from checkin_log so you have a history 
-- of what happened, but if you want to clear the logs too, uncomment below:
-- DELETE FROM public.checkin_log WHERE members_checked > 0 AND ...;

COMMIT;
