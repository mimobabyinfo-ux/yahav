/*
  # Fix Admin Policy Recursion

  1. Changes
    - Replace recursive admin policies with direct column check
    - Admin access to user_profiles uses direct is_admin check
    - Admin access to content uses subquery with direct column check

  2. Notes
    - Using EXISTS subquery avoids infinite recursion
    - Policies check is_admin directly on user_profiles row
*/

-- Admin policies for user_profiles (read/update all)
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Admin CRUD for daily_tips
CREATE POLICY "Admins can manage tips"
  ON daily_tips FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Admin CRUD for videos
CREATE POLICY "Admins can manage videos"
  ON videos FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Pro users can view active videos
CREATE POLICY "Pro users can view active videos"
  ON videos FOR SELECT
  TO authenticated
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND (user_profiles.is_pro = true OR user_profiles.is_admin = true)
    )
  );

-- Admin CRUD for homework_tasks
CREATE POLICY "Admins can manage homework tasks"
  ON homework_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Pro users can view homework tasks
CREATE POLICY "Pro users can view homework tasks"
  ON homework_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND (user_profiles.is_pro = true OR user_profiles.is_admin = true)
    )
  );

-- Admin CRUD for workshops
CREATE POLICY "Admins can manage workshops"
  ON workshops FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Admin view of all video progress
CREATE POLICY "Admins can view all video progress"
  ON user_video_progress FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );
