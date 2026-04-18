-- Weekly pregnancy guide content (CMS-driven)
CREATE TABLE pregnancy_weekly_guide (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week         int UNIQUE NOT NULL CHECK (week >= 1 AND week <= 42),
  symptoms     text,
  baby_size    text,
  baby_size_emoji text DEFAULT '🍊',
  development  text,
  image_url    text,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE pregnancy_weekly_guide ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read active weekly guide"
  ON pregnancy_weekly_guide FOR SELECT
  TO authenticated USING (is_active = true);

CREATE POLICY "Admins manage weekly guide"
  ON pregnancy_weekly_guide FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Personal pregnancy checklist items per user
CREATE TABLE user_pregnancy_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  category     text NOT NULL CHECK (category IN ('medical', 'buying')),
  text         text NOT NULL,
  week_from    int,
  week_to      int,
  is_completed boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE user_pregnancy_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pregnancy items"
  ON user_pregnancy_items FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reminder + feeding settings in user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS reminder_water_enabled    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_water_hours      int     DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_vitamins_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_vitamins_time    text    DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS reminder_exercise_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_exercise_time    text    DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS feeding_interval_hours    numeric DEFAULT 3;

-- Seed weekly guide for key weeks
INSERT INTO pregnancy_weekly_guide (week, symptoms, baby_size, baby_size_emoji, development) VALUES
  ( 6, 'בחילות, עייפות, רגישות בחזה, תכיפות במתן שתן', 'כגודל אפון', '🫛', 'הלב מתחיל לפעום. מתפתחים עיניים ואוזניים'),
  ( 8, 'בחילות בוקר חזקות, עייפות, ריח-רגישות', 'כגודל פטל', '🍇', 'אצבעות כפות הידיים מופיעות. המוח מתפתח במהירות'),
  (10, 'עייפות, בחילות, כאבי ראש', 'כגודל תות שדה', '🍓', 'כל האיברים החיוניים נוצרו. העובר הופך לעם ישמעאל'),
  (12, 'הבחילות מתחילות לחלוף. אנרגיה חוזרת', 'כגודל ליים', '🍋', 'הרפלקסים הראשונים מופיעים. הציפורניים מתחילות לגדול'),
  (14, 'תחושה טובה יותר, תיאבון חוזר', 'כגודל לימון', '🍋', 'יכול להניע פניו. נוצרת שכבת לנוגו על הגוף'),
  (16, 'תיתכן תחושת תנועות ראשונות', 'כגודל אבוקדו', '🥑', 'יכול לשמוע קולות. מרגיש כאב ומגיב לאור'),
  (18, 'כאבי גב, סחרחורות', 'כגודל בטטה', '🍠', 'השמיעה מפותחת — יכולה לדבר אליו. עצמות מתאמצות'),
  (20, 'כאבי גב, צרבת קלה', 'כגודל בננה', '🍌', 'חצי הדרך! האולטרסאונד מגלה את המין. הריסים גדלים'),
  (22, 'נפיחות ברגליים, ורידים בולטים', 'כגודל פפאיה', '🫒', 'שמיעה מפותחת. השפתיים מחייכות בשנתו'),
  (24, 'נפיחות, צרבת, קשיי שינה', 'כגודל תירס', '🌽', 'הריאות מתחילות להתפתח. הוא עוצם ופוקח עיניים'),
  (26, 'כאבי גב, קוצר נשימה קל', 'כגודל צנון לבן', '🥕', 'שכבת שומן נוצרת. מחזורי שינה-ערות מוגדרים'),
  (28, 'גלי חום, קשיי שינה, תנועות חזקות', 'כגודל חצילים', '🍆', 'פוקח עיניים לראשונה! הוא יכול לחלום'),
  (30, 'תנועות ברורות, כאב בגרון', 'כגודל כרוב', '🥦', 'המוח מתפתח מהר. ראייתו מתחדדת'),
  (32, 'לחץ על שלפוחית, עייפות חמורה', 'כגודל קוקוס', '🥥', 'העצמות מתקשות. השומן ממלא את גופו'),
  (34, 'ידיים ורגליים נפוחות, צירי לידה מקדימים', 'כגודל דלעת קטנה', '🎃', 'ציפורניים מלאות. שיער ראש יכול להיות'),
  (36, 'ירידת ראש לאגן, קשיי נשימה משתפרים', 'כגודל ראש חסה', '🥬', 'כמעט מוכן ללידה! הריאות בשלות לנשימה'),
  (38, 'צירי לידה, לחץ חזק, עייפות', 'כגודל כרישה', '🌿', 'גופו מכוסה ורניקס. מוכן כמעט לצאת לעולם'),
  (40, 'צירי לידה, ציפייה, לחץ', 'כגודל אבטיח', '🍉', 'מוכן לצאת לעולם! כל האיברים מפותחים לחלוטין');
