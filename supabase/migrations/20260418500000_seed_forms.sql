-- Seed Mimo forms with real content
-- Upsert so re-running is safe

INSERT INTO forms (id, title, description, fields_json, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'טופס הרשמה',
  'ברוכה הבאה! נשמח לדעת קצת עליך לפני שנתחיל 🌿',
  '[
    {"id":"f1","type":"text",     "label":"שם פרטי",                         "required":true},
    {"id":"f2","type":"text",     "label":"שם משפחה",                        "required":true},
    {"id":"f3","type":"text",     "label":"מספר טלפון",                      "required":true},
    {"id":"f4","type":"text",     "label":"כתובת מייל",                      "required":true},
    {"id":"f5","type":"select",   "label":"באיזה סדנה את מעוניינת?",        "required":true,
      "options":["סדנאות ליווי התפתחותי - עטופים","סדנאות עיסוי תינוקות"]}
  ]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
  SET title       = EXCLUDED.title,
      description = EXCLUDED.description,
      fields_json = EXCLUDED.fields_json,
      is_active   = EXCLUDED.is_active;
