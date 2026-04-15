-- Add share_token to children table
ALTER TABLE children ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid();

-- Back-fill existing rows that might have NULL
UPDATE children SET share_token = gen_random_uuid() WHERE share_token IS NULL;

-- Make NOT NULL now that all rows have a value
ALTER TABLE children ALTER COLUMN share_token SET NOT NULL;

-- Allow anon to read children by share_token (UUID is the secret)
DROP POLICY IF EXISTS "children_anon_share_read" ON children;
CREATE POLICY "children_anon_share_read"
  ON children FOR SELECT
  TO anon
  USING (share_token IS NOT NULL);

-- Allow anon to read log entries for shared babies
DROP POLICY IF EXISTS "log_entries_anon_share_read" ON daily_log_entries;
CREATE POLICY "log_entries_anon_share_read"
  ON daily_log_entries FOR SELECT
  TO anon
  USING (
    child_id IN (SELECT id FROM children WHERE share_token IS NOT NULL)
  );
