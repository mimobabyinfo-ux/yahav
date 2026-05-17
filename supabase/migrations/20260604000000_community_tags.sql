-- Phase 4 / C2: structured "what I'm looking for" tags on community
-- profiles. Free-text community_bio stays as the prose field; tags add
-- a filter dimension to CommunityPage.
--
-- Same tag IDs are enumerated in src/constants/communityTags.ts — keep
-- the two in sync. We deliberately do NOT enforce a CHECK constraint on
-- the array contents so the preset list can evolve without a migration.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS community_tags text[] NOT NULL DEFAULT '{}';

-- Rebuild both community views so the page can read tags. CREATE OR
-- REPLACE refuses to widen the column list — DROP + CREATE is the
-- supported path. Each rebuild mirrors the prior definition exactly,
-- adding the new column at the end so existing column ordering for
-- consumers stays stable.

DROP VIEW IF EXISTS community_profiles;
CREATE VIEW community_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    c.id     AS child_id,
    c.dob    AS child_dob,
    c.gender AS child_gender
  FROM user_profiles up
  JOIN children c ON c.user_id = up.id
  WHERE up.mother_name IS NOT NULL;

GRANT SELECT ON community_profiles TO authenticated;

DROP VIEW IF EXISTS community_pregnant_profiles;
CREATE VIEW community_pregnant_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    up.community_bio,
    up.community_tags,
    up.due_date
  FROM user_profiles up
  WHERE up.user_mode = 'pregnant';

GRANT SELECT ON community_pregnant_profiles TO authenticated;

-- GIN index so "find moms whose tags contain X" stays cheap as the
-- community grows. Postgres array @> operator uses this.
CREATE INDEX IF NOT EXISTS idx_user_profiles_community_tags
  ON user_profiles USING GIN (community_tags);
