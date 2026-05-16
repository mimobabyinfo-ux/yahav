-- ─────────────────────────────────────────────────────────────────────────
-- feeding_details: add milk_type for bottle feedings (Phase 2 / C3)
-- ─────────────────────────────────────────────────────────────────────────
-- Bottle feeding tracking distinguishes pumped breast milk from formula.
-- Until now that distinction lived (loosely) in the notes free-text field;
-- the dedicated BottlePage stores it structurally so future analytics can
-- count "% bottles that were pumped vs formula" cleanly.
--
-- Nullable: every existing row (breast / solid / pre-Phase-2 bottle) leaves
-- this column NULL. Only bottle feedings saved via the new BottlePage
-- populate it.
--
-- Idempotent: ALTER TABLE uses IF NOT EXISTS.

ALTER TABLE feeding_details
  ADD COLUMN IF NOT EXISTS milk_type text
  CHECK (milk_type IS NULL OR milk_type IN ('pumped', 'formula'));
