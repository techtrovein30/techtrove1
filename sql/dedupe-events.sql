-- =============================================================================
-- TechTrove 3.0 — FULL CLEANUP + FEE-FIXING SQL
-- =============================================================================
-- Run this WHOLE block in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- What it does:
--   1. Migrates the 3 real registrations still pointing at the evt-* ids to
--      the matching official sport-*/tech-*/nontech-* event.
--   2. Deletes the duplicate evt-* event set (every event was seeded twice).
--   3. Fixes the fees to PER-PERSON values (the app charges fee x people
--      entered). Paid sports = Rs 100/person; technical & non-technical = free.
--   4. Verification query at the end.
-- =============================================================================

-- ── 1) Migrate existing registrations to the matching official event ────────
UPDATE public.registrations_internal
   SET event_id = 'sport-volleyball'
 WHERE event_id = 'evt-spt-volleyball';

UPDATE public.registrations_external
   SET event_id = 'sport-carrom'
 WHERE event_id = 'evt-spt-carrom';

UPDATE public.registrations_external
   SET event_id = 'nontech-adaptune'
 WHERE event_id = 'evt-nt-adaptune';

-- ── 2) Delete the duplicate evt-* event set ──────────────────────────────────
DELETE FROM public.events WHERE id LIKE 'evt-%';

-- ── 3) Fix registration_fee to PER-PERSON rates ──────────────────────────────
-- Paid sports: Rs 100 per person (a cricket team of 11 = 1100, each sub +100).
-- Technical & non-technical events stay FREE (0).
UPDATE public.events SET registration_fee = 100
 WHERE id IN (
   'sport-cricket',   'sport-football',  'sport-kabaddi',
   'sport-throwball', 'sport-khokho',    'sport-volleyball',
   'sport-carrom',    'sport-chess'
 );

-- ── 4) Verify — every event name should now appear exactly once, free = 0 ───
SELECT id, name, day_id, registration_fee,
       required_players, max_substitutes, registration_open
FROM public.events
ORDER BY day_id, id;
