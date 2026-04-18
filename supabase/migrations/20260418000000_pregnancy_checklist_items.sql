-- Pregnancy checklist items managed by admin
CREATE TABLE pregnancy_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL CHECK (category IN ('medical', 'buying')),
  text         text NOT NULL,
  week_from    int,
  week_to      int,
  display_order int DEFAULT 0,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE pregnancy_checklist_items ENABLE ROW LEVEL SECURITY;

-- Everyone (authenticated) can read active items
CREATE POLICY "Read active pregnancy items"
  ON pregnancy_checklist_items FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can manage all items
CREATE POLICY "Admins manage pregnancy items"
  ON pregnancy_checklist_items FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed medical missions
INSERT INTO pregnancy_checklist_items (category, text, week_from, week_to, display_order) VALUES
  ('medical', 'בדיקת אולטרסאונד שבוע 12',            11, 13,  1),
  ('medical', 'בדיקת שקיפות עורפית',                  11, 14,  2),
  ('medical', 'בדיקת אולטרסאונד שבוע 22',            20, 24,  3),
  ('medical', 'בדיקת סוכר הריון (Glucose Test)',       26, 28,  4),
  ('medical', 'בדיקת GBS (סטרפטוקוק קבוצה B)',       35, 37,  5),
  ('medical', 'כיתת לידה',                             28, 36,  6),
  ('medical', 'פגישה עם מיילדת / רופא ילדים',         30, 40,  7),
  ('medical', 'ייעוץ הנקה',                            32, 40,  8),
  ('medical', 'תיק לבית חולים מוכן',                  36, 40,  9),
  ('medical', 'תעודת זהות וכרטיס קופת חולים בתיק',   36, 40, 10);

-- Seed buying list
INSERT INTO pregnancy_checklist_items (category, text, display_order) VALUES
  ('buying', 'עריסה / מיטת תינוק',           1),
  ('buying', 'מזרן ומצעים',                   2),
  ('buying', 'עגלת תינוק',                    3),
  ('buying', 'כיסא בטיחות לרכב',              4),
  ('buying', 'מנשא / עגלת טיול',              5),
  ('buying', 'שאבת חלב',                      6),
  ('buying', 'בקבוקי האכלה ופטמות',           7),
  ('buying', 'מוצץ',                           8),
  ('buying', 'בגדים (גודל 50 / 56 / 62)',      9),
  ('buying', 'חיתולים ומגבונים',              10),
  ('buying', 'שינוי חיתולים + רפד',           11),
  ('buying', 'אמבטיה לתינוק',                 12),
  ('buying', 'מנורת לילה',                    13),
  ('buying', 'בייבי מוניטור',                 14),
  ('buying', 'מטען לטלפון לבית חולים',        15),
  ('buying', 'בגדים נוחים לאמא לאחר לידה',   16);
