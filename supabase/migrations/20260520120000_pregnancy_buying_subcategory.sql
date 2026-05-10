-- ─────────────────────────────────────────────────────────────────────────
-- Pregnancy buying-list subcategorization
-- ─────────────────────────────────────────────────────────────────────────
-- Adds a `subcategory` column to both pregnancy item tables (master template
-- + personal). The existing `category` column stays as 'medical' | 'buying';
-- subcategory adds a second axis used only by the buying tab UI to render
-- collapsible groups (ריהוט / בטיחות / האכלה / היגיינה / ביגוד / אבזרים /
-- שונות).
--
-- Backfills the 16 buying seed rows in pregnancy_checklist_items by exact
-- text match. user_pregnancy_items legacy rows stay NULL — surfaced under
-- "📋 שונות" via the app's `subcategory ?? 'other'` fallback.
--
-- Idempotent: ALTER TABLE uses IF NOT EXISTS, UPDATE matches by text so
-- re-runs are no-ops on already-migrated rows.

ALTER TABLE pregnancy_checklist_items
  ADD COLUMN IF NOT EXISTS subcategory text
  CHECK (subcategory IS NULL OR subcategory IN
    ('furniture','safety','feeding','hygiene','clothing','accessories','other'));

ALTER TABLE user_pregnancy_items
  ADD COLUMN IF NOT EXISTS subcategory text
  CHECK (subcategory IS NULL OR subcategory IN
    ('furniture','safety','feeding','hygiene','clothing','accessories','other'));

-- ── Backfill the 16 master buying items ──────────────────────────────────
-- Strings here must match the seed in 20260418000000_pregnancy_checklist_items.sql
-- character-for-character. Admin-renamed rows fall through to NULL and show
-- under "📋 שונות" — acceptable.

-- 🛏️ ריהוט (4 items)
UPDATE pregnancy_checklist_items SET subcategory = 'furniture'
  WHERE category = 'buying' AND text IN (
    'עריסה / מיטת תינוק',
    'מזרן ומצעים',
    'עגלת תינוק',
    'מנשא / עגלת טיול'
  );

-- 🛡️ בטיחות (2 items)
UPDATE pregnancy_checklist_items SET subcategory = 'safety'
  WHERE category = 'buying' AND text IN (
    'כיסא בטיחות לרכב',
    'בייבי מוניטור'
  );

-- 🍼 האכלה (2 items)
UPDATE pregnancy_checklist_items SET subcategory = 'feeding'
  WHERE category = 'buying' AND text IN (
    'שאבת חלב',
    'בקבוקי האכלה ופטמות'
  );

-- 🧼 היגיינה (3 items)
UPDATE pregnancy_checklist_items SET subcategory = 'hygiene'
  WHERE category = 'buying' AND text IN (
    'חיתולים ומגבונים',
    'אמבטיה לתינוק',
    'שינוי חיתולים + רפד'
  );

-- 👕 ביגוד (1 item)
UPDATE pregnancy_checklist_items SET subcategory = 'clothing'
  WHERE category = 'buying' AND text = 'בגדים (גודל 50 / 56 / 62)';

-- 🧸 אבזרים (2 items)
UPDATE pregnancy_checklist_items SET subcategory = 'accessories'
  WHERE category = 'buying' AND text IN (
    'מוצץ',
    'מנורת לילה'
  );

-- 📋 שונות (2 items — hospital prep, not baby gear)
UPDATE pregnancy_checklist_items SET subcategory = 'other'
  WHERE category = 'buying' AND text IN (
    'מטען לטלפון לבית חולים',
    'בגדים נוחים לאמא לאחר לידה'
  );
