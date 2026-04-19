-- Timed workshop access: add date range columns to purchased_workshops
ALTER TABLE purchased_workshops
  ADD COLUMN IF NOT EXISTS access_start_date date,
  ADD COLUMN IF NOT EXISTS access_end_date date;

-- Allow admins to insert/update purchased_workshops (for assigning access)
DROP POLICY IF EXISTS "Admins manage purchased workshops" ON purchased_workshops;
CREATE POLICY "Admins manage purchased workshops"
  ON purchased_workshops FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Users can read their own purchases
DROP POLICY IF EXISTS "Users read own purchases" ON purchased_workshops;
CREATE POLICY "Users read own purchases"
  ON purchased_workshops FOR SELECT TO authenticated
  USING (user_id = auth.uid());
