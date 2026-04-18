-- Birth Gift form (מתנת לידה)
INSERT INTO forms (id, title, description, fields_json, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000002',
  'מתנת לידה MIMO',
  'שלחי מתנת לידה לחברה שלך מ-Mimo 🎁',
  '[
    {"id":"f1","type":"text","label":"שם פרטי שלך",               "required":true},
    {"id":"f2","type":"text","label":"שם משפחה שלך",              "required":true},
    {"id":"f3","type":"text","label":"מספר טלפון שלך",            "required":true},
    {"id":"f4","type":"text","label":"שם פרטי של היולדת",         "required":true},
    {"id":"f5","type":"text","label":"שם משפחה של היולדת",        "required":true},
    {"id":"f6","type":"text","label":"מספר טלפון של היולדת",      "required":true},
    {"id":"f7","type":"text","label":"כתובת מייל של היולדת",      "required":true}
  ]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
  SET title       = EXCLUDED.title,
      description = EXCLUDED.description,
      fields_json = EXCLUDED.fields_json,
      is_active   = EXCLUDED.is_active;

-- Post-birth follow-up / developmental form (ליווי אחרי לידה)
-- First page is date field; full content pending user confirmation of all pages
INSERT INTO forms (id, title, description, fields_json, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000003',
  'ליווי אחרי לידה - MIMO',
  'שאלון מעקב לאחר לידה — יש למלא בתיאום עם ברנדה',
  '[
    {"id":"f1","type":"text","label":"תאריך מילוי השאלון","required":true},
    {"id":"f2","type":"text","label":"שם פרטי ומשפחה",    "required":true},
    {"id":"f3","type":"text","label":"מספר טלפון",         "required":true},
    {"id":"f4","type":"text","label":"תאריך לידה",         "required":true},
    {"id":"f5","type":"select","label":"סוג לידה","required":true,
      "options":["לידה רגילה","ניתוח קיסרי","לידה מכשירנית (ואקום / מלקחיים)"]},
    {"id":"f6","type":"text","label":"שבוע לידה","required":false},
    {"id":"f7","type":"textarea","label":"האם היו התערבויות בלידה? פרטי","required":false},
    {"id":"f8","type":"select","label":"תנוחת התינוק בלידה","required":false,
      "options":["ראש למטה","עכוז","רוחבי","אחר"]},
    {"id":"f9","type":"textarea","label":"האם יש מידע נוסף שחשוב לשתף?","required":false}
  ]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
  SET title       = EXCLUDED.title,
      description = EXCLUDED.description,
      fields_json = EXCLUDED.fields_json,
      is_active   = EXCLUDED.is_active;
