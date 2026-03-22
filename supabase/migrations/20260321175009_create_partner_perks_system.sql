/*
  # Create Partner Perks System

  1. New Tables
    - `partner_perks`
      - `id` (uuid)
      - `partner_name` (text)
      - `logo_url` (text)
      - `short_description` (text)
      - `full_description` (text)
      - `discount_code` (text)
      - `action_link` (text)
      - `is_featured` (boolean) - show in home carousel
      - `is_active` (boolean)
      - `display_order` (integer)
    - `perk_analytics`
      - `id` (uuid)
      - `perk_id` (uuid) - FK to partner_perks
      - `user_id` (uuid) - FK to user_profiles (nullable - anonymous)
      - `action_type` (text) - view|copy_code|visit_link
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - All authenticated users can read active perks
    - All authenticated users can insert analytics
    - Admins have full access

  3. Notes
    - perk_analytics.user_id is nullable to allow anonymous tracking
    - CASCADE delete on perk_id, SET NULL on user_id
    - Sample perks inserted for demo

  4. Indexes
    - Optimized for featured/active queries and analytics aggregation
*/

-- Partner Perks
CREATE TABLE IF NOT EXISTS partner_perks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name text NOT NULL,
  logo_url text,
  short_description text,
  full_description text,
  discount_code text,
  action_link text,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_perks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active perks"
  ON partner_perks FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage perks"
  ON partner_perks FOR ALL
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

-- Perk Analytics
CREATE TABLE IF NOT EXISTS perk_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perk_id uuid NOT NULL REFERENCES partner_perks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('view', 'copy_code', 'visit_link')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE perk_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert analytics"
  ON perk_analytics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view all analytics"
  ON perk_analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partner_perks_featured ON partner_perks(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_partner_perks_active ON partner_perks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_perks_display_order ON partner_perks(display_order);
CREATE INDEX IF NOT EXISTS idx_perk_analytics_perk_id ON perk_analytics(perk_id);
CREATE INDEX IF NOT EXISTS idx_perk_analytics_action_type ON perk_analytics(action_type);
CREATE INDEX IF NOT EXISTS idx_perk_analytics_created_at ON perk_analytics(created_at);

-- Sample partner perks
INSERT INTO partner_perks (partner_name, short_description, full_description, discount_code, action_link, is_featured, is_active, display_order)
VALUES
  (
    'הריונית',
    '10% הנחה על כל מוצרי ההיריון',
    'חנות אינטרנטית מובילה למוצרי אמהות ותינוקות. קבלי 10% הנחה על כל הרכישה עם קוד הקופון שלנו.',
    'MIMO10',
    'https://example.com/herionit',
    true,
    true,
    1
  ),
  (
    'חיישן שינה',
    'ניטור שינה חכם לתינוקות',
    'מוצר חדשני לניטור שינה בטוחה. מקבלת 15% הנחה על הרכישה הראשונה עם קוד מימו.',
    'MIMOSLEEP',
    'https://example.com/sleep-sensor',
    true,
    true,
    2
  ),
  (
    'בייבי סטור',
    'כל מה שהתינוק צריך במקום אחד',
    'מגוון ענק של מוצרי תינוקות, ביגוד, צעצועים וציוד. משלוח חינם מעל ₪200.',
    'MIMO20',
    'https://example.com/baby-store',
    false,
    true,
    3
  )
ON CONFLICT DO NOTHING;
