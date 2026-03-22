/*
  # Add Doctor Visits and Diaper Notes

  1. Changes
    - Add 'doctor_visit' and 'note' to entry_type constraint
    - diaper_details.notes already included from previous migration

  2. Notes
    - Modifies the CHECK constraint on daily_log_entries.entry_type
    - Safe to run as it only expands allowed values
*/

-- Update entry_type constraint to include doctor_visit and note
ALTER TABLE daily_log_entries
  DROP CONSTRAINT IF EXISTS daily_log_entries_entry_type_check;

ALTER TABLE daily_log_entries
  ADD CONSTRAINT daily_log_entries_entry_type_check
  CHECK (entry_type IN ('feeding', 'sleep', 'diaper', 'pumping', 'milestone', 'doctor_visit', 'note'));
