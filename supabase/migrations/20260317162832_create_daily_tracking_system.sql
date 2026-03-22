/*
  # Create Daily Tracking System

  1. New Tables
    - `daily_log_entries`
      - `id` (uuid)
      - `user_id` (uuid) - FK to user_profiles
      - `entry_date` (date)
      - `entry_time` (time)
      - `entry_type` (text) - feeding|sleep|diaper|pumping|milestone|note
      - `notes` (text)
      - `photo_url` (text)
    - `feeding_details`
      - `id` (uuid)
      - `log_entry_id` (uuid) - FK to daily_log_entries
      - `feeding_type` (text) - breast|bottle|solid
      - `breast_side` (text) - left|right|both
      - `duration_minutes` (integer)
      - `amount_ml` (integer)
    - `sleep_details`
      - `id` (uuid)
      - `log_entry_id` (uuid) - FK to daily_log_entries
      - `sleep_type` (text) - nap|night
      - `duration_minutes` (integer)
      - `quality` (text) - good|fair|poor
    - `diaper_details`
      - `id` (uuid)
      - `log_entry_id` (uuid) - FK to daily_log_entries
      - `diaper_type` (text) - wet|dirty|both

  2. Security
    - Enable RLS on all tables
    - Users can only access their own data

  3. Notes
    - Detail tables cascade delete from log entries
    - Indexed by user_id + entry_date for performance
*/

-- Daily Log Entries
CREATE TABLE IF NOT EXISTS daily_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  entry_time time NOT NULL DEFAULT (now()::time),
  entry_type text NOT NULL CHECK (entry_type IN ('feeding', 'sleep', 'diaper', 'pumping', 'milestone', 'doctor_visit', 'note')),
  notes text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own log entries"
  ON daily_log_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own log entries"
  ON daily_log_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own log entries"
  ON daily_log_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own log entries"
  ON daily_log_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Feeding Details
CREATE TABLE IF NOT EXISTS feeding_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_entry_id uuid NOT NULL REFERENCES daily_log_entries(id) ON DELETE CASCADE,
  feeding_type text CHECK (feeding_type IN ('breast', 'bottle', 'solid')),
  breast_side text CHECK (breast_side IN ('left', 'right', 'both')),
  duration_minutes integer,
  amount_ml integer
);

ALTER TABLE feeding_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feeding details"
  ON feeding_details FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = feeding_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own feeding details"
  ON feeding_details FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = feeding_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own feeding details"
  ON feeding_details FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = feeding_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

-- Sleep Details
CREATE TABLE IF NOT EXISTS sleep_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_entry_id uuid NOT NULL REFERENCES daily_log_entries(id) ON DELETE CASCADE,
  sleep_type text CHECK (sleep_type IN ('nap', 'night')),
  duration_minutes integer,
  quality text CHECK (quality IN ('good', 'fair', 'poor'))
);

ALTER TABLE sleep_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sleep details"
  ON sleep_details FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = sleep_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own sleep details"
  ON sleep_details FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = sleep_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own sleep details"
  ON sleep_details FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = sleep_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

-- Diaper Details
CREATE TABLE IF NOT EXISTS diaper_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_entry_id uuid NOT NULL REFERENCES daily_log_entries(id) ON DELETE CASCADE,
  diaper_type text CHECK (diaper_type IN ('wet', 'dirty', 'both')),
  notes text
);

ALTER TABLE diaper_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own diaper details"
  ON diaper_details FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = diaper_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own diaper details"
  ON diaper_details FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = diaper_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own diaper details"
  ON diaper_details FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_log_entries
      WHERE daily_log_entries.id = diaper_details.log_entry_id
        AND daily_log_entries.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_log_user_date ON daily_log_entries(user_id, entry_date);
