-- 1. Fix community_profiles view: add community_bio column
DROP VIEW IF EXISTS community_profiles;
CREATE VIEW community_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    c.id     AS child_id,
    c.dob    AS child_dob,
    c.gender AS child_gender
  FROM user_profiles up
  JOIN children c ON c.user_id = up.id
  WHERE up.mother_name IS NOT NULL;

GRANT SELECT ON community_profiles TO authenticated;

-- 2. New view for pregnant community members (bypasses RLS via GRANT)
CREATE OR REPLACE VIEW community_pregnant_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.due_date
  FROM user_profiles up
  WHERE up.user_mode = 'pregnant'
    AND up.mother_name IS NOT NULL;

GRANT SELECT ON community_pregnant_profiles TO authenticated;

-- 3. User custom reminders table
CREATE TABLE IF NOT EXISTS user_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  label       text NOT NULL,
  emoji       text DEFAULT '🔔',
  time_of_day text,
  is_enabled  boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE user_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reminders"
  ON user_reminders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
