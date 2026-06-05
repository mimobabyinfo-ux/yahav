-- Phase 5 / A2 Part 3: cross-table person matching via canonical IL
-- phone form + case-insensitive email. Makes "find everything for
-- this person" a deterministic indexed lookup instead of a fuzzy
-- string scan.
--
-- Canonicalization rule:
--   1. Strip non-digits.
--   2. If result is 12 chars long and starts with "972" (country
--      code), drop the "972" and prepend "0" (local form).
--   3. Otherwise keep the digit-stripped value as-is.
-- Examples:
--   "050-1234567"      → "0501234567"
--   "+972 50 1234567"  → "0501234567"
--   "972501234567"     → "0501234567"
--   "0501234567"       → "0501234567"
--   NULL / ""          → NULL
--
-- IMMUTABLE + PARALLEL SAFE so PostgreSQL can use it inside a
-- GENERATED ALWAYS AS … STORED column.

CREATE OR REPLACE FUNCTION normalize_il_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN NULL
    WHEN length(regexp_replace(p, '\D', '', 'g')) = 12
         AND regexp_replace(p, '\D', '', 'g') LIKE '972%'
      THEN '0' || substring(regexp_replace(p, '\D', '', 'g'), 4)
    ELSE regexp_replace(p, '\D', '', 'g')
  END
$$;

-- Generated columns. Existing rows backfill automatically; future
-- rows compute on insert. Match the source column name on each
-- table.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS normalized_phone text
    GENERATED ALWAYS AS (normalize_il_phone(phone_number)) STORED;

ALTER TABLE registration_leads
  ADD COLUMN IF NOT EXISTS normalized_phone text
    GENERATED ALWAYS AS (normalize_il_phone(phone)) STORED;

-- Lookup indexes — partial on non-NULL so guest rows / data-entry
-- gaps don't bloat them.
CREATE INDEX IF NOT EXISTS idx_user_profiles_normalized_phone
  ON user_profiles (normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_leads_normalized_phone
  ON registration_leads (normalized_phone)
  WHERE normalized_phone IS NOT NULL;

-- Case-insensitive email matching. Functional indexes so
-- `lower(email) = $1` is index-served.
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_lower
  ON user_profiles (lower(email));

CREATE INDEX IF NOT EXISTS idx_registration_leads_email_lower
  ON registration_leads (lower(email));
