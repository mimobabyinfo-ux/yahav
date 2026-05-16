-- ─────────────────────────────────────────────────────────────────────────
-- feeding_details: add structured L/R breast durations (Phase 2)
-- ─────────────────────────────────────────────────────────────────────────
-- The new dedicated Breastfeeding action page lets a mother run a per-side
-- timer (e.g. 7 minutes left, then 4 minutes right). Until now we only had
-- one `duration_minutes` total + a `breast_side` enum, so the L/R split
-- could only be stored in free-text notes. These two columns store the
-- raw per-side time in seconds; `duration_minutes` stays as the legacy
-- aggregate (left+right rounded) for backward compatibility with
-- timeline rendering / legacy entries.
--
-- Both columns are nullable — they're only populated for breast feedings
-- saved via the new BreastfeedingPage. Bottle / solid / legacy breast
-- entries leave them NULL.
--
-- Idempotent: ALTER TABLE uses IF NOT EXISTS.

ALTER TABLE feeding_details
  ADD COLUMN IF NOT EXISTS left_duration_seconds integer
  CHECK (left_duration_seconds IS NULL OR left_duration_seconds >= 0);

ALTER TABLE feeding_details
  ADD COLUMN IF NOT EXISTS right_duration_seconds integer
  CHECK (right_duration_seconds IS NULL OR right_duration_seconds >= 0);
