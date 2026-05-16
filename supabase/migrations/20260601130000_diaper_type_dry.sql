-- ─────────────────────────────────────────────────────────────────────────
-- diaper_details: add 'dry' to diaper_type (Phase 2 / C3)
-- ─────────────────────────────────────────────────────────────────────────
-- The dedicated DiaperPage offers four options: פיפי (wet), קקי (dirty),
-- שניהם (both), and יבש (dry — checked but found dry, useful for tracking
-- intake/output balance). The existing CHECK constraint only allows the
-- first three.
--
-- Strategy: drop + recreate the constraint by name. The base migration
-- (20260317162832) created an inline CHECK which Postgres auto-names
-- `diaper_details_diaper_type_check`. We DROP IF EXISTS so re-runs are
-- no-ops; then re-add with the expanded value set.
--
-- All existing rows are 'wet' / 'dirty' / 'both' / NULL → still valid
-- under the new constraint. Backfill not required.

ALTER TABLE diaper_details
  DROP CONSTRAINT IF EXISTS diaper_details_diaper_type_check;

ALTER TABLE diaper_details
  ADD CONSTRAINT diaper_details_diaper_type_check
  CHECK (diaper_type IS NULL OR diaper_type IN ('wet', 'dirty', 'both', 'dry'));
