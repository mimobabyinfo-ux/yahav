/*
  # Add Global Settings and Content Categories

  1. New Tables
    - `global_settings`
      - `id` (uuid)
      - `setting_key` (text) - UNIQUE identifier
      - `setting_value` (text)
      - `setting_type` (text) - text|number|boolean|url|json
      - `category` (text) - grouping
      - `description` (text)
    - `content_categories`
      - `id` (uuid)
      - `name` (text)
      - `slug` (text)
      - `description` (text)
      - `category_type` (text) - video|workshop|both
      - `icon` (text) - Lucide icon name
      - `color` (text) - hex color
      - `display_order` (integer)
      - `is_active` (boolean)

  2. Changes
    - Add `category_id` FK constraints to videos and workshops

  3. Security
    - Enable RLS on both tables
    - All authenticated users can read
    - Admins can write

  4. Notes
    - global_settings is a flexible key-value store for app configuration
    - content_categories organizes videos and workshops
*/

-- Global Settings
CREATE TABLE IF NOT EXISTS global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  setting_type text NOT NULL DEFAULT 'text' CHECK (setting_type IN ('text', 'number', 'boolean', 'url', 'json')),
  category text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON global_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON global_settings FOR ALL
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

-- Content Categories
CREATE TABLE IF NOT EXISTS content_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  category_type text NOT NULL DEFAULT 'both' CHECK (category_type IN ('video', 'workshop', 'both')),
  icon text,
  color text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active categories"
  ON content_categories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage categories"
  ON content_categories FOR ALL
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

-- Add FK constraints from videos and workshops to content_categories
ALTER TABLE videos
  ADD CONSTRAINT fk_videos_category
  FOREIGN KEY (category_id) REFERENCES content_categories(id) ON DELETE SET NULL;

ALTER TABLE workshops
  ADD CONSTRAINT fk_workshops_category
  FOREIGN KEY (category_id) REFERENCES content_categories(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON content_categories(display_order);

-- Default settings
INSERT INTO global_settings (setting_key, setting_value, setting_type, category, description)
VALUES
  ('whatsapp_number', '972500000000', 'text', 'contact', 'מספר WhatsApp לתמיכה'),
  ('app_name', 'מימו', 'text', 'branding', 'שם האפליקציה'),
  ('welcome_message', 'ברוכה הבאה לעולם הורות!', 'text', 'content', 'הודעת ברוכה הבאה')
ON CONFLICT (setting_key) DO NOTHING;
