-- ─────────────────────────────────────────────────────────────────────────
-- medical_details: structured storage for doctor / vaccination entries
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 2 / C4. The dedicated MedicalPage captures a structured "visit
-- type" (חיסון / בדיקה שגרתית / מחלה / תרופה / אחר) plus free-text
-- details (e.g. "חיסון 2 חודשים", "אקמול 2.5 מ״ל").
--
-- Per Q2 / N2: entry_type stays as the existing 'doctor_visit' value —
-- no enum change needed. Only the new detail table is added.
--
-- Naming note: the table is `medical_details` (TypeScript naming
-- convention) even though entry_type='doctor_visit'.
--
-- RLS policies mirror the family-aware pattern in 20260506000000 for the
-- other detail tables: a family member can SELECT a detail row when the
-- parent log entry belongs to anyone in their family; INSERT / UPDATE /
-- DELETE stay self-only on the parent entry.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS before
-- each CREATE POLICY.

CREATE TABLE IF NOT EXISTS medical_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_entry_id uuid NOT NULL REFERENCES daily_log_entries(id) ON DELETE CASCADE,
  medical_type text CHECK (medical_type IN ('vaccination', 'checkup', 'illness', 'medication', 'other')),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_details_log_entry ON medical_details(log_entry_id);

ALTER TABLE medical_details ENABLE ROW LEVEL SECURITY;

-- SELECT: family-aware (matches feeding/sleep/diaper details).
DROP POLICY IF EXISTS "medical_details_family_select" ON medical_details;
CREATE POLICY "medical_details_family_select" ON medical_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries dle
      WHERE dle.id = medical_details.log_entry_id
        AND (
          dle.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM user_profiles me
            JOIN user_profiles them ON them.family_id = me.family_id
            WHERE me.id = auth.uid()
              AND them.id = dle.user_id
              AND me.family_id IS NOT NULL
          )
        )
    )
  );

-- INSERT: self-only on the parent entry.
DROP POLICY IF EXISTS "medical_details_insert_own" ON medical_details;
CREATE POLICY "medical_details_insert_own" ON medical_details
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = medical_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

-- UPDATE: self-only on the parent entry.
DROP POLICY IF EXISTS "medical_details_update_own" ON medical_details;
CREATE POLICY "medical_details_update_own" ON medical_details
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = medical_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

-- DELETE: self-only on the parent entry.
DROP POLICY IF EXISTS "medical_details_delete_own" ON medical_details;
CREATE POLICY "medical_details_delete_own" ON medical_details
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = medical_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );
