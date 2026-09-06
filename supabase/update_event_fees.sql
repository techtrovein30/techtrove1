-- =============================================================================
-- TechTrove 3.0 — Set per-event registration fees for the tiered pricing model
-- =============================================================================
-- Run AFTER 20240101000006_fee_tiers.sql, in Supabase Dashboard → SQL Editor.
-- Safe to re-run (update only touches the targeted rows).
--
-- This sets each event's `registration_fee` so the trigger (which reads that
-- column) charges the correct tier. Admin edits to any event's fee afterwards
-- will be picked up automatically.
--
--   Tech / Non-Tech (Day 2 & Day 3):       ₹75  (flat pass – single payment)
--   Carrom & Chess:                         ₹75  (per game)
--   All other sports:                       ₹600 (flat per team)
--
-- NOTE: Event rows are created in the dashboard, so event ids are dynamic.
-- The statements below match by day + name keywords. Verify the results with
-- the SELECT at the bottom and fine-tune any names that did not match.
-- =============================================================================

-- ── 1) Technical (Day 2) & Non-Technical (Day 3): flat pass ₹75 ─────────────
UPDATE public.events
   SET registration_fee = 75
 WHERE day_id IN ('day-2', 'day-3');

-- ── 2) Carrom & Chess: ₹75 per game ──────────────────────────────────────────
UPDATE public.events
   SET registration_fee = 75
 WHERE day_id = 'day-1'
   AND lower(name) IN ('carrom', 'chess', 'carroms', 'chees', 'carrom board', 'international chess');

-- ── 3) All other sports (Day 1 teams): ₹600 flat per team ────────────────────
UPDATE public.events
   SET registration_fee = 600
 WHERE day_id = 'day-1'
   AND lower(name) NOT IN ('carrom', 'chess', 'carroms', 'chees', 'carrom board', 'international chess');

-- ── Verify the resulting fees ────────────────────────────────────────────────
SELECT day_id, name, registration_fee
  FROM public.events
 WHERE registration_fee IS NOT NULL
 ORDER BY day_id, name;
