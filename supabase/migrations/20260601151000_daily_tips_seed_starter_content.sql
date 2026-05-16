-- ─────────────────────────────────────────────────────────────────────────
-- daily_tips: 50 starter tips covering ages 0–24 months (Phase 3 / C2)
-- ─────────────────────────────────────────────────────────────────────────
-- Brenda + Claude collaboration. Tone: warm + scientific. Hebrew, RTL.
-- All tips are tip_for='mom'. Brenda can edit/delete/add freely via the
-- Admin → טיפים section after launch.
--
-- Depends on the schema migration 20260601150000_daily_tips_age_targeting.sql
-- (which adds title + age_range_*_days + tip_for columns).
--
-- Each INSERT is guarded by a title-uniqueness check so re-running this
-- migration on a DB that already has the seeds is a no-op. If Brenda
-- edits a tip's title in admin, subsequent migration runs will treat it
-- as a "new" tip and re-insert — acceptable since we only run migrations
-- once in normal operation.
--
-- Age range coverage (days):
--   0–7      = first week
--   8–30     = first month
--   31–60    = month 2
--   61–90    = month 3
--   91–120   = month 4
--   121–180  = months 5–6
--   181–270  = months 6–9
--   271–365  = months 9–12
--   366–540  = months 12–18
--   541–730  = months 18–24

-- ═══════════════════════════════════════════════════════════════════════
-- SHAVUA RISHON (0–7 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הימים הראשונים - שלך גם',
'הימים הראשונים הם של התינוק שלך, אבל גם שלך. הגוף שלך עובר שינויים עצומים אחרי הלידה. תני לעצמך לנוח כשהתינוק ישן, ותזכרי - הבית יכול לחכות, את לא חייבת להיות שלמה היום.',
0, 7, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הימים הראשונים - שלך גם');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'צבע הקקי הראשון',
'אל תיבהלי - הקקי הראשון של התינוק שלך יהיה שחור-ירוק וצמיגי. זה נקרא מקוניום וזה לגמרי תקין. תוך כמה ימים הצבע יהפוך לחום-חרדל אם את מניקה, או לחום-ירוק אם את מאכילה בתמ"ל.',
0, 7, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'צבע הקקי הראשון');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הירידה במשקל - נורמלית',
'תינוקות מאבדים בין 5-10% ממשקל הלידה בימים הראשונים. זה לגמרי תקין. הם חוזרים למשקל הלידה תוך 10-14 ימים. אם רופא הילדים בודק וכל בסדר - אל תדאגי.',
0, 7, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הירידה במשקל - נורמלית');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הנקה - דרישה ולא שעון',
'בשבוע הראשון התינוק שלך יבקש לאכול כל 1.5-3 שעות, גם בלילה. זה נורמלי. הנקה לפי דרישה (ולא לפי שעון) בונה את אספקת החלב שלך. אל תנסי להחזיק אותו "להמתין".',
0, 14, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הנקה - דרישה ולא שעון');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESH RISHON (8–30 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הראייה שלו עדיין מעורפלת',
'התינוק שלך רואה כרגע רק בטווח של 20-30 ס"מ - בדיוק המרחק בין הפנים שלך לפניו כשאת מניקה. הוא לא רואה צבעים בבירור עדיין, אבל מזהה אותך בעיקר לפי הריח והקול.',
8, 60, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הראייה שלו עדיין מעורפלת');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הבכי הוא תקשורת',
'בחודש הראשון הבכי הוא הדרך היחידה של התינוק לתקשר. רעב, אי-נוחות, עייפות, או פשוט הצורך בקירבה - הכל יוצא כבכי. עם הזמן תלמדי לזהות את ההבדלים. אל תפחדי "להרגיל אותו" - תינוקות בני חודש לא מתפנקים.',
8, 45, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הבכי הוא תקשורת');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שינה בחודש הראשון - מקוטעת',
'התינוק שלך יישן בערך 16-18 שעות ביממה, אבל במנות של 2-3 שעות בלבד. אין עדיין הבדל אצלו בין יום ללילה. זה ישתפר בהדרגה החל מגיל 6-8 שבועות.',
8, 45, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שינה בחודש הראשון - מקוטעת');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שעת הקסם - 20:00-23:00',
'הרבה תינוקות בכים יותר בשעות הערב, גם אם הכל בסדר. זה נקרא "שעת קסם" (קצת באירוניה) וזה תופעה מוכרת. תחזיקי אותו קרוב, תנסי שיטות הרגעה שונות, וזכרי - זה יחלוף בערך בגיל 3 חודשים.',
14, 90, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שעת הקסם - 20:00-23:00');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הנקה - הראש שלך בעננים?',
'הורמוני ההנקה (אוקסיטוצין ופרולקטין) יכולים לגרום לתחושת "ערפל מוחי". זה נורמלי. אם את מרגישה דכאון, חרדה עמוקה, או מחשבות שמפחידות אותך - תפני לרופא או ליועצת. דיכאון אחרי לידה הוא רפואי, לא חולשה.',
8, 90, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הנקה - הראש שלך בעננים?');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'חיוך ראשון - כבר בקרוב',
'החיוך החברתי הראשון (חיוך אמיתי, לא רפלקס) מופיע בדרך כלל בין 6-8 שבועות. תכיני את הטלפון - את הולכת להזיל דמעות.',
30, 60, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'חיוך ראשון - כבר בקרוב');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESH 2 (31–60 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'זמן בטן - חשוב כבר עכשיו',
'זמן בטן (Tummy Time) חיוני להתפתחות שרירי הצוואר, הגב והכתפיים. התחילי ב-2-3 דקות פעמיים ביום, כשהוא ערני ולא רעב. תינוקות בדרך כלל לא אוהבים את זה בהתחלה - זה בסדר, זה ישתפר.',
30, 180, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'זמן בטן - חשוב כבר עכשיו');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הקול שלך - הצעצוע הכי טוב',
'דברי איתו, שירי לו, ספרי לו על היום שלך. גם אם הוא עוד לא מבין מילים, השפה שלך בונה את המוח שלו. תינוקות שמדברים אליהם הרבה מפתחים אוצר מילים גדול יותר.',
30, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הקול שלך - הצעצוע הכי טוב');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הקיא? זה בסדר ברוב המקרים',
'תינוקות מקיאים. הרבה. הקרדיה (השריר שסוגר את הקיבה) שלהם עדיין רפויה. אם הוא גודל יפה ולא נראה במצוקה - הקיא הוא רק עניין של כביסה. אם הוא מאבד משקל או הקיא הוא בקשת חזקה (לא רק "זרימה") - תפני לרופא.',
14, 180, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הקיא? זה בסדר ברוב המקרים');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'אספקת החלב - גוף חכם',
'אם את מניקה, גופך מייצר בדיוק כמה שהתינוק שלך צריך. אם נדמה לך שיש פחות - בדוק רק את החיתולים (5-6 רטובים ביום = הכל בסדר). שאיבה אחרי הנקה לא תמיד מראה אמת על הכמות שהוא קיבל.',
8, 120, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'אספקת החלב - גוף חכם');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESH 3 (61–90 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'המהפכה של 3 חודשים',
'בערך עכשיו הוא יתחיל לישון בלוקים ארוכים יותר בלילה (4-6 שעות). הוא גם יתחיל להבחין בבירור בין יום ללילה. אבל - שינויים בשינה הם תקינים גם בגיל הזה ("רגרסיית 4 חודשים" מתקרבת).',
60, 100, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'המהפכה של 3 חודשים');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'צחוק ראשון - מתי?',
'הצחוק הראשון הקולי מופיע בדרך כלל בין 3-4 חודשים. הוא יצחק כשתעשי משהו מצחיק (לפחות בעיניו) - פרצוף מצחיק, רעש פתאומי, או דגדוג עדין.',
60, 120, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'צחוק ראשון - מתי?');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'היד שלו מצאה את הפה',
'בגיל 2-3 חודשים תינוקות מגלים את הידיים שלהם ומכניסים הכל לפה. זה לא רעב - זה גילוי עולם דרך הפה. ודאי שמה שהוא מגיע אליו נקי ובטוח.',
60, 240, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'היד שלו מצאה את הפה');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESH 4 (91–120 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'רגרסיית 4 חודשים - אמיתית',
'בערך עכשיו השינה שלו עשויה להתקלקל. הוא יתעורר יותר, ישן פחות. זה לא בעיה - זה דווקא התקדמות. המוח שלו עובר ארגון מחדש בדפוסי השינה. זה עובר תוך 2-6 שבועות. תחזיקי מעמד.',
100, 140, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'רגרסיית 4 חודשים - אמיתית');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'התהפכות בדרך',
'בערך עכשיו התינוק שלך יתחיל להתהפך - בדרך כלל מבטן לגב קודם (בערך 4 חודשים), ואחר כך מגב לבטן (5-6 חודשים). תוודאי שהוא לא על משטח גבוה בלי השגחה.',
90, 180, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'התהפכות בדרך');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'עוד לא מוצקים',
'הארגון הבריאות העולמי ממליץ להמתין עד גיל 6 חודשים (180 ימים) לפני הכנסת מוצקים. עד אז - חלב אם או תמ"ל מספקים את כל הצרכים. אל תאמיני לסבתות שאומרות "תני לו טעימה של בננה".',
90, 180, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'עוד לא מוצקים');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESHIM 5–6 (121–180 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'ישיבה - בדרך',
'בערך עכשיו הוא יתחיל לשבת בעזרה (4-5 חודשים), ואחר כך לבד (6-7 חודשים). אל תנסי "ללמד אותו לשבת" - השרירים שלו יודעים את העבודה. תני לו זמן.',
120, 210, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'ישיבה - בדרך');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'סימני מוכנות למוצקים',
'איך תדעי שהוא מוכן? הוא יושב יציב בעזרה, הוא מסתכל על האוכל שלך בעניין, הוא מאבד את "רפלקס דחיפת הלשון", הוא מנסה להושיט יד לאוכל. בלי הסימנים האלה - חכי קצת.',
150, 210, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'סימני מוכנות למוצקים');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שיניים - מתי?',
'השן הראשונה מופיעה בדרך כלל בין 4-7 חודשים, אבל יש תינוקות שמחכים עד שנה. סימני בקיעה: ריור מוגבר, רצון ללעוס, חוסר מנוחה, חום קל. תני צעצועי נשיכה קרים.',
120, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שיניים - מתי?');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESHIM 6–9 (181–270 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'מוצקים - איפה מתחילים?',
'דרך טובה להתחיל: ירק או פרי מבושל וטחון (אבוקדו, בטטה, בננה). מנה אחת ביום, כפית-שתיים בהתחלה. אל תכריחי. החלב נשאר עיקרי עד גיל שנה.',
180, 270, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'מוצקים - איפה מתחילים?');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'אלרגנים - להכניס מוקדם',
'מחקרים עכשוויים ממליצים להכניס אלרגנים נפוצים (בוטנים, ביצה, גלוטן, חלב) מוקדם, החל מגיל 6 חודשים, כדי להפחית סיכון לאלרגיות. תהליכי את זה ברגיעה - מעט כל פעם.',
180, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'אלרגנים - להכניס מוקדם');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'זחילה - לכל אחד הקצב שלו',
'יש תינוקות שזוחלים על הברכיים (6-9 חודשים), יש שזוחלים על הבטן, יש שמדלגים על הזחילה ועוברים ישר לעמידה. כל הדרכים בסדר. אל תשווי לתינוקות אחרים.',
180, 330, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'זחילה - לכל אחד הקצב שלו');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'חרדת זרים - מתחילה',
'בגיל 6-9 חודשים הרבה תינוקות מפתחים חרדת זרים - בכי כשמישהו לא מוכר מנסה לקחת אותם. זה לא חוסר חינוך - זה ההתפתחות הקוגניטיבית שלהם. הם מבינים שאת היחידה.',
180, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'חרדת זרים - מתחילה');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESHIM 9–12 (271–365 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'עמידה ראשונה',
'בערך עכשיו (9-12 חודשים) הוא יתחיל לעמוד תוך אחיזה ברהיטים. הוא גם ייפול. הרבה. זה חלק מהלמידה. תהפכי את הסלון לבטוח (פינות, שקעי חשמל).',
240, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'עמידה ראשונה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'מילה ראשונה - איפה היא?',
'המילה הראשונה (עם משמעות) מופיעה בדרך כלל בין 9-14 חודשים. "אמא" או "אבא" הם הראשונים. אבל גם "פה פה", "ביי", או צליל שהוא משתמש בו עקבי לדבר מסוים - נחשבים.',
240, 450, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'מילה ראשונה - איפה היא?');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שינה - אמורה להיות יציבה',
'רוב התינוקות בגיל 9-12 חודשים ישנים 10-12 שעות בלילה (עם או בלי התעוררויות קצרות) ו-1-2 תנומות במהלך היום. אם עדיין מתעורר הרבה - שווה לבדוק שיגרה, סביבה, ולשקול ייעוץ שינה.',
270, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שינה - אמורה להיות יציבה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'סירוב לאוכל - שלב נורמלי',
'אחרי חודשים של אכילה נהדרת, פתאום הוא מסרב? זה נורמלי בגיל הזה. התיאבון שלהם משתנה. הוא לא ירעב. תציעי מגוון, לא תכריחי, ותמשיכי לאכול לידו - הם לומדים מצפייה.',
240, 540, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'סירוב לאוכל - שלב נורמלי');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESHIM 12–18 (366–540 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'צעדים ראשונים',
'הצעדים הראשונים מופיעים בדרך כלל בין 11-15 חודשים, אבל יש תינוקות שמחכים עד 18 חודשים. כל זמן שיש התקדמות (זחילה, עמידה, צעדים בעזרה) - אין מה לדאוג.',
330, 540, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'צעדים ראשונים');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'חלב פרה - מתי?',
'אחרי גיל שנה אפשר לתת חלב פרה (3% שומן) במקום תמ"ל. בין 1-2 שנים ההמלצה היא 350-500 מ"ל ביום. אם את עדיין מניקה - תוכלי להמשיך כמה שתרצי.',
365, 540, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'חלב פרה - מתי?');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'התקפי זעם - מתחילים',
'בערך עכשיו תכירי את התופעה: התינוק שלך רוצה משהו, לא יכול להגיד אותו, ומתפרץ. זה לא חוסר חינוך - זה תסכול מילולי. הישארי רגועה, אל תוותרי בגלל הבכי, ותציעי הזדהות.',
365, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'התקפי זעם - מתחילים');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'מסך - בלי לפני שנתיים',
'ארגון הבריאות העולמי וה-AAP ממליצים בלי מסכים בכלל לפני גיל 18 חודשים (חוץ מ-Video calls עם משפחה). מעל גיל זה - לא יותר משעה ביום, ותמיד עם הורה.',
365, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'מסך - בלי לפני שנתיים');

-- ═══════════════════════════════════════════════════════════════════════
-- CHODESHIM 18–24 (541–730 days)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'פיצוץ אוצר מילים',
'בין 18-24 חודשים יש "פיצוץ מילים" - מ-20-50 מילים ל-200+. אם בגיל שנתיים יש לו פחות מ-50 מילים או הוא לא מחבר שתי מילים - שווה ייעוץ עם רופא ילדים או קלינאי תקשורת.',
540, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'פיצוץ אוצר מילים');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שלב ה"לא"',
'בערך עכשיו "לא" יהפוך למילה האהובה עליו, גם כשהוא מתכוון "כן". זה לא חוצפה - זה גילוי הזהות שלו. הוא לומד שהוא אדם נפרד עם רצונות. תני לו בחירות פשוטות.',
540, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שלב ה"לא"');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שלב הניקיון - לא עכשיו בכוח',
'הילד שלך אולי מראה סימני מוכנות לניקיון בין 18-30 חודשים, אבל אין סיבה למהר. רוב הילדים מוכנים באמת בין 2.5-3. סימנים: הוא מודיע לפני/אחרי, מתעניין בשירותים, יכול לחלוץ מכנסיים.',
540, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שלב הניקיון - לא עכשיו בכוח');

-- ═══════════════════════════════════════════════════════════════════════
-- TIPIM CHOTZIM-GIL (cross-age, general support)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'את לא לבד בזה',
'יש ימים שאת תרגישי שאת לא יודעת מה את עושה. זה לא רק את - כל אמא טרייה מרגישה ככה. את לומדת את התינוק שלך כמו שהוא לומד אותך. תהיי סבלנית עם עצמך.',
0, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'את לא לבד בזה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הילד שלך הוא הסטנדרט שלו',
'תינוקות מתפתחים בקצב משלהם. אם בקבוצת ה-Whatsapp של אמהות מישהי מספרת שתינוקה כבר הולך/מדבר/אוכל מוצקים בגיל מוקדם - זה לא אומר שמשהו לא בסדר אצלך. תסמכי על רופא הילדים שלך.',
60, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הילד שלך הוא הסטנדרט שלו');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'פעולת המעיים שלו - תקינה',
'תינוקות בהנקה יכולים לעשות קקי בין 10 פעמים ביום ל-פעם בשבוע - הכל בסדר. עם תמ"ל זה בדרך כלל 1-2 פעמים ביום. אחרי הכנסת מוצקים זה משתנה שוב. דאגי רק אם יש דם, כאב, או קקי קשה.',
0, 540, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'פעולת המעיים שלו - תקינה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'אמבטיה - אתגר או הנאה',
'אמבטיות 2-3 פעמים בשבוע מספיקות לעור הרך של תינוק. רחצה יומית יכולה לייבש את העור. השתמשי בסבונים עדינים בלי בושם. בחורף, שמן או קרם לחות אחרי האמבטיה.',
14, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'אמבטיה - אתגר או הנאה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'חיסונים - שווה מילה',
'החיסונים בטיפת חלב הם הבטוחים והמומלצים ביותר ע"י כל ארגוני הבריאות. תופעות לוואי קלות (חום, כאב מקומי, ישנוניות) - תקינות, חולפות תוך 24-48 שעות. במקרה של חום גבוה מ-39 או בכי בלתי פוסק - לרופא.',
60, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'חיסונים - שווה מילה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'שמש על עור התינוק - בזהירות',
'תינוקות מתחת לגיל 6 חודשים - לא חשיפה ישירה לשמש. מעל גיל זה - קרם הגנה (לתינוקות), כובע, וצל. אבל גם חשיפה מבוקרת חשובה לוויטמין D. תיוועצי עם רופא הילדים שלך.',
0, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'שמש על עור התינוק - בזהירות');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'סבלנות עם עצמך',
'יום אחד הוא מקסים, יום אחר הוא בלגן מוחלט. את לא אם פחות טובה כשהיום קשה. תינוקות מרגישים את מצבי הרוח שלנו, אבל הם גם אוהבים אותנו אפילו כשאנחנו לא ברמה הטובה ביותר.',
30, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'סבלנות עם עצמך');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'הריון נוסף - שאלה רגישה',
'הרבה אמהות נשאלות "מתי תינוק שני?" כבר חודש אחרי הלידה. אין תשובה נכונה. הגוף שלך זקוק לפחות 12 חודשים להתאוששות, ההמלצה הרפואית היא 18-24 חודשים. אבל זו ההחלטה שלך.',
180, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'הריון נוסף - שאלה רגישה');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'זמן לעצמך - לא מותרות',
'אם את יכולה - 30 דקות ביום רק לעצמך (גם בלי לעשות כלום). זה לא אנוכיות. אמא שמטפלת בעצמה היא אמא בריאה יותר. תני לבן/בת זוג או לסבתא לקחת לזמן קצר.',
14, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'זמן לעצמך - לא מותרות');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'זוגיות אחרי תינוק - מאתגרת',
'הזוגיות שלך עם בן/בת הזוג תעבור שינוי. זה נורמלי. תקשורת פתוחה על מה כל אחד צריך, חלוקת עומס הוגנת, וזמן יחד (גם רק 20 דקות בערב בלי טלפונים) - יעזרו לכם להישאר חיבורים.',
60, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'זוגיות אחרי תינוק - מאתגרת');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'מתי לפנות לרופא דחוף',
'תפני לרופא מיד אם: התינוק לא רגיש לגרוי (לא מגיב), קושי בנשימה, חום מעל 38°C בגיל מתחת לחודשיים (גם 37.8 מתחת לחודש), פריחה שלא נעלמת בלחיצה (סגולה), בכי בלתי פוסק שאינו פוסק. במקרה ספק - תתקשרי לטיפת חלב או מד"א.',
0, 730, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'מתי לפנות לרופא דחוף');

INSERT INTO daily_tips (title, tip_text, age_range_start_days, age_range_end_days, tip_for, is_active)
SELECT 'תזכרי לאכול ולשתות',
'אם את מניקה - 500 קלוריות נוספות ביום ו-3 ליטר מים. גם אם לא מניקה - הגוף שלך מתאושש מלידה ועובד שעות נוספות. אל תדלגי על ארוחות. אוכלים מוכן/מוקפא זה נהדר עכשיו.',
0, 365, 'mom', true
WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE title = 'תזכרי לאכול ולשתות');
