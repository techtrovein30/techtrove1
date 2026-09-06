-- =============================================================================
-- TechTrove 3.0 — Dedicated Registration Members & Certificates Table
-- =============================================================================
-- Solves two core problems:
--   1. Gives each team member their own distinct row with separate columns
--      (member_name, email, reg_number, phone, college, role, position) instead
--      of being trapped in a single JSON column.
--   2. Provides native certificate support: unique certificate_id per member,
--      attendance status, certificate_url, and verification support with
--      near-zero network egress.
-- =============================================================================

-- ── 1) Create the table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registration_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id       text NOT NULL,
  registration_code     text NOT NULL,
  user_id               uuid NOT NULL,
  event_id              text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_name            text,
  team_name             text NOT NULL,
  captain_name          text NOT NULL,
  participant_type      text NOT NULL CHECK (participant_type IN ('internal', 'external')),
  payment_status        text NOT NULL DEFAULT 'pending',

  -- Member fields (printed on certificates)
  member_name           text NOT NULL,
  member_role           text NOT NULL DEFAULT 'player',
  position              integer NOT NULL DEFAULT 1,
  email                 text NOT NULL,
  reg_number            text,
  phone                 text,
  college               text,

  -- Certificate & Attendance fields
  attended              boolean NOT NULL DEFAULT false,
  certificate_id        text UNIQUE,
  certificate_url       text,
  certificate_issued_at timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 2) Indexes for ultra-fast searches & verification ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_reg_members_reg_id ON public.registration_members(registration_id);
CREATE INDEX IF NOT EXISTS idx_reg_members_email ON public.registration_members(email);
CREATE INDEX IF NOT EXISTS idx_reg_members_cert_id ON public.registration_members(certificate_id);
CREATE INDEX IF NOT EXISTS idx_reg_members_event_id ON public.registration_members(event_id);
CREATE INDEX IF NOT EXISTS idx_reg_members_reg_num ON public.registration_members(reg_number);

-- ── 3) Row Level Security & Permissions ──────────────────────────────────────
ALTER TABLE public.registration_members ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.registration_members TO authenticated, service_role, anon;

-- Public can read member records (used for certificate viewing & verification)
DROP POLICY IF EXISTS "Allow public read for members and certificates" ON public.registration_members;
CREATE POLICY "Allow public read for members and certificates"
  ON public.registration_members FOR SELECT
  USING (true);

-- Allow full access for service_role and trigger functions
DROP POLICY IF EXISTS "Allow full access for service_role and triggers" ON public.registration_members;
CREATE POLICY "Allow full access for service_role and triggers"
  ON public.registration_members FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 4) Synchronization Trigger Function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_registration_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  evt_name    text;
  part_type   text;
  reg_college text;
  m           jsonb;
  mem_pos     int;
  mem_role    text;
  cert_code   text;
  mem_email   text;
  mem_name    text;
  idx         int := 0;
BEGIN
  -- Handle deletion of a registration
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.registration_members WHERE registration_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Determine participant type and fetch college
  IF TG_TABLE_NAME = 'registrations_internal' THEN
    part_type := 'internal';
    SELECT college INTO reg_college FROM public.internal_participants WHERE id = NEW.user_id;
    IF reg_college IS NULL OR reg_college = '' THEN
      reg_college := 'Saveetha Institute of Medical and Technical Sciences (SIMATS)';
    END IF;
  ELSE
    part_type := 'external';
    SELECT college INTO reg_college FROM public.external_participants WHERE id = NEW.user_id;
    IF reg_college IS NULL OR reg_college = '' THEN
      reg_college := 'External College';
    END IF;
  END IF;

  -- Fetch human-readable event name
  SELECT name INTO evt_name FROM public.events WHERE id = NEW.event_id;
  IF evt_name IS NULL THEN
    evt_name := NEW.event_id;
  END IF;

  -- If this registration already has members, delete previous ones to re-sync
  DELETE FROM public.registration_members WHERE registration_id = NEW.id;

  -- Iterate through the members JSON array
  FOR m IN SELECT * FROM jsonb_array_elements(NEW.members)
  LOOP
    mem_name := COALESCE(trim(m->>'name'), '');
    -- Only insert members that have a non-empty name
    IF mem_name != '' THEN
      idx := idx + 1;
      mem_pos   := COALESCE((m->>'position')::int, idx);
      mem_role  := COALESCE(m->>'role', 'player');
      mem_email := COALESCE(trim(m->>'email'), '');
      cert_code := 'TT3-' || NEW.registration_code || '-M' || idx;

      INSERT INTO public.registration_members (
        registration_id,
        registration_code,
        user_id,
        event_id,
        event_name,
        team_name,
        captain_name,
        participant_type,
        payment_status,
        member_name,
        member_role,
        position,
        email,
        reg_number,
        phone,
        college,
        certificate_id
      ) VALUES (
        NEW.id,
        NEW.registration_code,
        NEW.user_id,
        NEW.event_id,
        evt_name,
        NEW.team_name,
        NEW.captain_name,
        part_type,
        NEW.payment_status,
        mem_name,
        mem_role,
        mem_pos,
        mem_email,
        COALESCE(trim(COALESCE(m->>'regNumber', m->>'reg_number')), ''),
        COALESCE(trim(m->>'phone'), ''),
        reg_college,
        cert_code
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 5) Attach triggers to both internal and external tables ──────────────────
DROP TRIGGER IF EXISTS trg_sync_reg_members_int ON public.registrations_internal;
CREATE TRIGGER trg_sync_reg_members_int
  AFTER INSERT OR UPDATE OR DELETE ON public.registrations_internal
  FOR EACH ROW EXECUTE FUNCTION public.sync_registration_members();

DROP TRIGGER IF EXISTS trg_sync_reg_members_ext ON public.registrations_external;
CREATE TRIGGER trg_sync_reg_members_ext
  AFTER INSERT OR UPDATE OR DELETE ON public.registrations_external
  FOR EACH ROW EXECUTE FUNCTION public.sync_registration_members();

-- ── 6) Backfill all existing registrations into registration_members ─────────
-- Internal registrations backfill
INSERT INTO public.registration_members (
  registration_id,
  registration_code,
  user_id,
  event_id,
  event_name,
  team_name,
  captain_name,
  participant_type,
  payment_status,
  member_name,
  member_role,
  position,
  email,
  reg_number,
  phone,
  college,
  certificate_id
)
SELECT
  r.id,
  r.registration_code,
  r.user_id,
  r.event_id,
  COALESCE(e.name, r.event_id),
  r.team_name,
  r.captain_name,
  'internal',
  r.payment_status,
  COALESCE(trim(m.value->>'name'), ''),
  COALESCE(m.value->>'role', 'player'),
  COALESCE((m.value->>'position')::int, (m.ordinality)::int),
  COALESCE(trim(m.value->>'email'), ''),
  COALESCE(trim(COALESCE(m.value->>'regNumber', m.value->>'reg_number')), ''),
  COALESCE(trim(m.value->>'phone'), ''),
  COALESCE(p.college, 'Saveetha Institute of Medical and Technical Sciences (SIMATS)'),
  'TT3-' || r.registration_code || '-M' || m.ordinality
FROM public.registrations_internal r
LEFT JOIN public.events e ON e.id = r.event_id
LEFT JOIN public.internal_participants p ON p.id = r.user_id
CROSS JOIN LATERAL jsonb_array_elements(r.members) WITH ORDINALITY AS m(value, ordinality)
WHERE COALESCE(trim(m.value->>'name'), '') != ''
ON CONFLICT (certificate_id) DO NOTHING;

-- External registrations backfill
INSERT INTO public.registration_members (
  registration_id,
  registration_code,
  user_id,
  event_id,
  event_name,
  team_name,
  captain_name,
  participant_type,
  payment_status,
  member_name,
  member_role,
  position,
  email,
  reg_number,
  phone,
  college,
  certificate_id
)
SELECT
  r.id,
  r.registration_code,
  r.user_id,
  r.event_id,
  COALESCE(e.name, r.event_id),
  r.team_name,
  r.captain_name,
  'external',
  r.payment_status,
  COALESCE(trim(m.value->>'name'), ''),
  COALESCE(m.value->>'role', 'player'),
  COALESCE((m.value->>'position')::int, (m.ordinality)::int),
  COALESCE(trim(m.value->>'email'), ''),
  COALESCE(trim(COALESCE(m.value->>'regNumber', m.value->>'reg_number')), ''),
  COALESCE(trim(m.value->>'phone'), ''),
  COALESCE(p.college, 'External College'),
  'TT3-' || r.registration_code || '-M' || m.ordinality
FROM public.registrations_external r
LEFT JOIN public.events e ON e.id = r.event_id
LEFT JOIN public.external_participants p ON p.id = r.user_id
CROSS JOIN LATERAL jsonb_array_elements(r.members) WITH ORDINALITY AS m(value, ordinality)
WHERE COALESCE(trim(m.value->>'name'), '') != ''
ON CONFLICT (certificate_id) DO NOTHING;
