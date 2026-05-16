-- ─────────────────────────────────────────────────────────────────────────
-- daily_tips: age + pregnancy-week targeting (Phase 3 / C2)
-- ─────────────────────────────────────────────────────────────────────────
-- Adds the columns that let admins author tips for specific baby ages or
-- pregnancy weeks, plus optional title + article link. The dashboard's
-- DailyTipCard queries against these columns and picks deterministically
-- per day so the same tip appears for the same child all day long.
--
-- Existing rows get defaults: tip_for='mom', age_range 0–730 days (i.e.
-- the entire 0-24 month window). They remain visible to every mom user.
-- The columns are nullable / additive, so the existing CRUD-by-tip_text
-- path keeps working until the admin UI rewrite lands.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS for every column.

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS article_link text;

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS age_range_start_days integer DEFAULT 0
    CHECK (age_range_start_days IS NULL OR age_range_start_days >= 0);

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS age_range_end_days integer DEFAULT 730
    CHECK (age_range_end_days IS NULL OR age_range_end_days >= 0);

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS tip_for text DEFAULT 'mom'
    CHECK (tip_for IS NULL OR tip_for IN ('mom', 'pregnancy'));

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS pregnancy_week_start integer
    CHECK (pregnancy_week_start IS NULL OR (pregnancy_week_start BETWEEN 1 AND 42));

ALTER TABLE daily_tips
  ADD COLUMN IF NOT EXISTS pregnancy_week_end integer
    CHECK (pregnancy_week_end IS NULL OR (pregnancy_week_end BETWEEN 1 AND 42));
