-- Phase 5 / A1: workshops have recurring cohorts (e.g. "סדנת עיסוי
-- תינוקות" runs every 6 weeks). Each cohort = one workshop × one
-- start_date, with optional disambiguation label, advisory capacity,
-- and free-text notes. Registrations get attached to a cohort
-- post-signup from the admin. cohort_id is nullable so existing
-- registrations stay valid until you assign them.
--
-- User-facing Hebrew label is "מחזור / מחזורים" but the technical
-- name in code + SQL stays `cohort` per the established convention.

CREATE TABLE IF NOT EXISTS workshop_cohorts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  label       text,
  capacity    int CHECK (capacity IS NULL OR capacity > 0),
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Most queries are "cohorts for this workshop, newest first". Partial
-- on is_active so deactivated cohorts don't bloat the index.
CREATE INDEX IF NOT EXISTS idx_workshop_cohorts_workshop_date
  ON workshop_cohorts (workshop_id, start_date DESC)
  WHERE is_active;

ALTER TABLE registration_leads
  ADD COLUMN IF NOT EXISTS cohort_id uuid
    REFERENCES workshop_cohorts(id) ON DELETE SET NULL;

-- Reverse lookup: "all registrations in this cohort" for the grouped
-- view (Stage 2). Partial so unassigned rows don't bloat it.
CREATE INDEX IF NOT EXISTS idx_registration_leads_cohort
  ON registration_leads (cohort_id)
  WHERE cohort_id IS NOT NULL;

-- RLS — admin-only manage. Matches the registration_leads pattern
-- (admins via user_profiles.is_admin = true).
ALTER TABLE workshop_cohorts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read workshop cohorts" ON workshop_cohorts;
CREATE POLICY "admins read workshop cohorts"
  ON workshop_cohorts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admins insert workshop cohorts" ON workshop_cohorts;
CREATE POLICY "admins insert workshop cohorts"
  ON workshop_cohorts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admins update workshop cohorts" ON workshop_cohorts;
CREATE POLICY "admins update workshop cohorts"
  ON workshop_cohorts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admins delete workshop cohorts" ON workshop_cohorts;
CREATE POLICY "admins delete workshop cohorts"
  ON workshop_cohorts FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));
