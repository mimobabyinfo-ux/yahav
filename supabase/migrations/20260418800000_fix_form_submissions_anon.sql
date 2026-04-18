-- Allow anonymous (public form) submissions: make user_id nullable
ALTER TABLE form_submissions ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old anon policy if it exists and recreate cleanly
DROP POLICY IF EXISTS "form_submissions_anon_insert" ON form_submissions;

-- Allow anyone (anon or authenticated) to insert with null user_id for active forms
CREATE POLICY "form_submissions_public_insert"
  ON form_submissions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM forms WHERE id = form_id AND is_active = true)
  );
