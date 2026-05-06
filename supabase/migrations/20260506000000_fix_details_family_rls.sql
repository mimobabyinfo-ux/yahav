-- Fix: allow family members to read each other's feeding/sleep/diaper details.
-- The parent table (daily_log_entries) was already made family-aware in
-- 20260415200000_fix_journal_family_rls.sql, but PostgREST embeds run RLS
-- on the child tables independently — and those still checked self-only,
-- so a guest's feeding entry was visible to the mom in the timeline but
-- with details (duration, side, amount, etc.) returning NULL.
--
-- This migration mirrors the same family-aware pattern: a user can SELECT
-- a detail row if the parent log entry was created by them OR by a member
-- of their family. INSERT/UPDATE policies stay self-only (no change).

-- ── feeding_details ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own feeding details" ON feeding_details;
DROP POLICY IF EXISTS "feeding_details_select_own"        ON feeding_details;
DROP POLICY IF EXISTS "feeding_details_family_select"     ON feeding_details;

CREATE POLICY "feeding_details_family_select" ON feeding_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries dle
      WHERE dle.id = feeding_details.log_entry_id
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

-- ── sleep_details ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own sleep details" ON sleep_details;
DROP POLICY IF EXISTS "sleep_details_select_own"        ON sleep_details;
DROP POLICY IF EXISTS "sleep_details_family_select"     ON sleep_details;

CREATE POLICY "sleep_details_family_select" ON sleep_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries dle
      WHERE dle.id = sleep_details.log_entry_id
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

-- ── diaper_details ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own diaper details" ON diaper_details;
DROP POLICY IF EXISTS "diaper_details_select_own"        ON diaper_details;
DROP POLICY IF EXISTS "diaper_details_family_select"     ON diaper_details;

CREATE POLICY "diaper_details_family_select" ON diaper_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries dle
      WHERE dle.id = diaper_details.log_entry_id
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
