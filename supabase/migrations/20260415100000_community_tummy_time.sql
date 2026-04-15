-- Add phone_number and community_consent to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS community_consent boolean NOT NULL DEFAULT false;

-- Add tummy_time as a valid entry_type (drop and recreate constraint)
DO $$
BEGIN
  -- Drop old check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'daily_log_entries'
    AND constraint_name LIKE '%entry_type%'
    AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE daily_log_entries DROP CONSTRAINT IF EXISTS daily_log_entries_entry_type_check;
  END IF;
END $$;

ALTER TABLE daily_log_entries
  ADD CONSTRAINT daily_log_entries_entry_type_check
  CHECK (entry_type IN ('feeding', 'sleep', 'diaper', 'tummy_time', 'milestone', 'doctor_visit', 'note'));

-- Same for active_timers timer_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'active_timers'
    AND constraint_name LIKE '%timer_type%'
    AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE active_timers DROP CONSTRAINT IF EXISTS active_timers_timer_type_check;
  END IF;
END $$;

ALTER TABLE active_timers
  ADD CONSTRAINT active_timers_timer_type_check
  CHECK (timer_type IN ('feeding', 'sleep', 'tummy_time'));

-- Expose phone_number and community_consent in community_profiles view
DROP VIEW IF EXISTS community_profiles;
CREATE VIEW community_profiles AS
  SELECT
    up.id,
    up.mother_name,
    up.area,
    up.phone_number,
    up.community_consent,
    c.id   AS child_id,
    c.dob  AS child_dob,
    c.gender AS child_gender
  FROM user_profiles up
  JOIN children c ON c.user_id = up.id
  WHERE up.mother_name IS NOT NULL;

-- RLS: allow authenticated users to read community_profiles
GRANT SELECT ON community_profiles TO authenticated;
