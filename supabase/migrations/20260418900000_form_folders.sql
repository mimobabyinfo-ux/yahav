-- Add folder grouping to forms
ALTER TABLE forms ADD COLUMN IF NOT EXISTS folder text;

-- Allow admin to delete submissions
CREATE POLICY "Admins can delete submissions"
  ON form_submissions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));
