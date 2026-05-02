-- Idempotent fix: ensure tummy_time is accepted in daily_log_entries.entry_type
-- Mirrors 20260415100000 but safe to apply even if that migration already ran.

DO $$
BEGIN
  -- Drop whatever check constraint currently guards entry_type (however it was named)
  ALTER TABLE daily_log_entries
    DROP CONSTRAINT IF EXISTS daily_log_entries_entry_type_check;
END $$;

ALTER TABLE daily_log_entries
  ADD CONSTRAINT daily_log_entries_entry_type_check
  CHECK (entry_type IN ('feeding', 'sleep', 'diaper', 'tummy_time', 'pumping', 'milestone', 'doctor_visit', 'note'));
