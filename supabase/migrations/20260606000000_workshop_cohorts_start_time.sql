-- Phase 5 / A1 (Stage 2 prep): cohorts can carry a start time alongside
-- the date. Two cohorts of the same workshop on the same date can run
-- at different hours and are separate entities (e.g. "עטופים" on
-- 10/06 at 10:30 vs 17:00 are two different cohorts).
--
-- start_time stays NULLABLE — Stage-1 cohorts already exist with date
-- only, and we intentionally don't backfill a misleading midnight
-- default. They display as date-only until the admin opens them and
-- adds a time. Mirrors the daily_log_entries (entry_date + entry_time)
-- pattern used elsewhere for local-time events.

ALTER TABLE workshop_cohorts
  ADD COLUMN IF NOT EXISTS start_time time;

-- The Stage-1 index covered (workshop_id, start_date DESC). Stage 2
-- sort is (start_date, start_time NULLS LAST) for "soonest first" —
-- replace the index so that ORDER BY stays covered.
DROP INDEX IF EXISTS idx_workshop_cohorts_workshop_date;
CREATE INDEX IF NOT EXISTS idx_workshop_cohorts_workshop_date_time
  ON workshop_cohorts (workshop_id, start_date DESC, start_time DESC NULLS LAST)
  WHERE is_active;
