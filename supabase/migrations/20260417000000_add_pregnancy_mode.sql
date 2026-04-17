-- Add pregnancy mode support to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS user_mode text DEFAULT 'mom'
    CHECK (user_mode IN ('pregnant', 'mom'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS pregnancy_task_completions jsonb DEFAULT '[]'::jsonb;
