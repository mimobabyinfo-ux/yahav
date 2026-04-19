-- Allow admins to delete any user profile
DROP POLICY IF EXISTS "Admins can delete user profiles" ON user_profiles;
CREATE POLICY "Admins can delete user profiles"
  ON user_profiles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Allow admins to update any user profile (for access management)
DROP POLICY IF EXISTS "Admins can update any profile" ON user_profiles;
CREATE POLICY "Admins can update any profile"
  ON user_profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));
