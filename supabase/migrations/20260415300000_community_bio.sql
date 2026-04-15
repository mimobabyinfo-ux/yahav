-- Add community_bio column
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS community_bio text;

-- Rebuild community_profiles view with all community fields
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
