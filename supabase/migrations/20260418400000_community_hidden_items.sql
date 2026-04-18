-- Fix: community_pregnant_profiles - remove mother_name restriction so all pregnant users appear
DROP VIEW IF EXISTS community_pregnant_profiles;
CREATE VIEW community_pregnant_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.due_date
  FROM user_profiles up
  WHERE up.user_mode = 'pregnant';

GRANT SELECT ON community_pregnant_profiles TO authenticated;

-- Hidden pregnancy checklist items per user (stores IDs of master items user wants to hide)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS hidden_pregnancy_items jsonb DEFAULT '[]'::jsonb;
