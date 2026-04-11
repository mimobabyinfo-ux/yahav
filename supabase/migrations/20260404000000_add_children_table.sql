/*
  # Add Children Table for Multi-Child Support

  1. New Tables
    - `children`
      - `id` (uuid)
      - `user_id` (uuid) - FK to user_profiles
      - `name` (text)
      - `dob` (date)
      - `gender` (text) - boy|girl|other

  2. Changes
    - Add `child_id` to `daily_log_entries`
    - Add `child_id` to `active_timers`
    - Add `baby_gender` to `user_profiles`
*/

-- Children table
CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  dob date,
  gender text CHECK (gender IN ('boy', 'girl', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own children"
  ON children FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all children"
  ON children FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Add child_id to daily_log_entries
ALTER TABLE daily_log_entries
  ADD COLUMN IF NOT EXISTS child_id uuid REFERENCES children(id) ON DELETE SET NULL;

-- Add child_id to active_timers
ALTER TABLE active_timers
  ADD COLUMN IF NOT EXISTS child_id uuid REFERENCES children(id) ON DELETE SET NULL;

-- Add gender to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS baby_gender text CHECK (baby_gender IN ('boy', 'girl', 'other'));

-- Index for fast child lookup
CREATE INDEX IF NOT EXISTS idx_children_user_id ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_child_id ON daily_log_entries(child_id);
