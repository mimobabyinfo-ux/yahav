-- Fix: allow family members to read each other's journal entries
-- Also fix: allow reading entries where child_id matches a family child

-- Drop old select policy (whatever it is named)
DROP POLICY IF EXISTS "logs_select_own" ON daily_log_entries;
DROP POLICY IF EXISTS "logs_select_family" ON daily_log_entries;
DROP POLICY IF EXISTS "Enable read for users based on user_id" ON daily_log_entries;
DROP POLICY IF EXISTS "Users can view their own entries" ON daily_log_entries;

-- New policy: own entries OR entries from same family
CREATE POLICY "logs_family_select" ON daily_log_entries
  FOR SELECT TO authenticated
  USING (
    -- Own entry
    user_id = auth.uid()
    OR
    -- Entry from a family member (same family_id)
    EXISTS (
      SELECT 1
      FROM user_profiles me
      JOIN user_profiles them ON them.family_id = me.family_id
      WHERE me.id = auth.uid()
        AND them.id = daily_log_entries.user_id
        AND me.family_id IS NOT NULL
    )
  );

-- Keep insert restricted to own user_id
DROP POLICY IF EXISTS "logs_insert_own" ON daily_log_entries;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON daily_log_entries;
DROP POLICY IF EXISTS "Users can insert their own entries" ON daily_log_entries;

CREATE POLICY "logs_insert_own" ON daily_log_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Keep delete restricted to own entries
DROP POLICY IF EXISTS "logs_delete_own" ON daily_log_entries;
DROP POLICY IF EXISTS "Users can delete their own entries" ON daily_log_entries;

CREATE POLICY "logs_delete_own" ON daily_log_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
