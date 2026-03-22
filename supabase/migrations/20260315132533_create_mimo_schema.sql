/*
  # Create Mimo Initial Schema

  1. New Tables
    - `user_profiles`
      - `id` (uuid) - FK to auth.users
      - `email` (text)
      - `mother_name` (text)
      - `baby_name` (text)
      - `baby_dob` (date)
      - `is_pro` (boolean) - Pro subscription flag
      - `is_admin` (boolean) - Admin role flag
      - `display_name` (text)
    - `daily_tips`
      - `id` (uuid)
      - `tip_text` (text)
      - `is_active` (boolean)
    - `videos`
      - `id` (uuid)
      - `title` (text)
      - `description` (text)
      - `video_url` (text)
      - `thumbnail_url` (text)
      - `duration_minutes` (integer)
      - `category_id` (uuid, nullable)
      - `tags` (text[])
      - `display_order` (integer)
      - `is_active` (boolean)
    - `homework_tasks`
      - `id` (uuid)
      - `video_id` (uuid) - FK to videos
      - `task_description` (text)
      - `display_order` (integer)
    - `user_video_progress`
      - `id` (uuid)
      - `user_id` (uuid) - FK to user_profiles
      - `video_id` (uuid) - FK to videos
      - `completed` (boolean)
      - `completed_at` (timestamptz)
    - `workshops`
      - `id` (uuid)
      - `title` (text)
      - `description` (text)
      - `workshop_type` (text)
      - `image_url` (text)
      - `category_id` (uuid, nullable)
      - `tags` (text[])
      - `price` (numeric)
      - `currency` (text)
      - `display_order` (integer)
      - `is_active` (boolean)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users

  3. Notes
    - user_profiles extends auth.users via same UUID primary key
    - Admins are checked via is_admin column to avoid recursion
*/

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  mother_name text,
  baby_name text,
  baby_dob date,
  is_pro boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Daily Tips
CREATE TABLE IF NOT EXISTS daily_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active tips"
  ON daily_tips FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Videos
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  video_url text,
  thumbnail_url text,
  duration_minutes integer,
  category_id uuid,
  tags text[],
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Homework Tasks
CREATE TABLE IF NOT EXISTS homework_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  task_description text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE homework_tasks ENABLE ROW LEVEL SECURITY;

-- User Video Progress
CREATE TABLE IF NOT EXISTS user_video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  UNIQUE(user_id, video_id)
);

ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video progress"
  ON user_video_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own video progress"
  ON user_video_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video progress"
  ON user_video_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Workshops
CREATE TABLE IF NOT EXISTS workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  workshop_type text,
  image_url text,
  category_id uuid,
  tags text[],
  price numeric(10, 2),
  currency text DEFAULT 'ILS',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active workshops"
  ON workshops FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_progress_user_video ON user_video_progress(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_videos_display_order ON videos(display_order);
CREATE INDEX IF NOT EXISTS idx_workshops_display_order ON workshops(display_order);
