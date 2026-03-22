/*
  # Add Active Timers, Photos, and Feeding Side

  1. New Tables
    - `active_timers`
      - `id` (uuid)
      - `user_id` (uuid) - FK to user_profiles
      - `timer_type` (text) - feeding|sleep|pumping
      - `start_time` (timestamptz)
      - `additional_data` (jsonb) - type-specific data

  2. Changes
    - Add `photo_url` to daily_log_entries (already included in migration 3)
    - Add `breast_side` to feeding_details (already included in migration 3)

  3. Security
    - Enable RLS on active_timers
    - Users can only see/manage their own timers
*/

-- Active Timers
CREATE TABLE IF NOT EXISTS active_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  timer_type text NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  additional_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE active_timers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own timers"
  ON active_timers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own timers"
  ON active_timers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own timers"
  ON active_timers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own timers"
  ON active_timers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_timers_user ON active_timers(user_id);
