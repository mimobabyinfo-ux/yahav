-- Service partners directory
CREATE TABLE IF NOT EXISTS service_partners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  category      text NOT NULL CHECK (category IN ('pregnancy','motherhood')),
  subcategory   text,
  whatsapp_number text,
  logo_url      text,
  display_order int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE service_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read service_partners"
  ON service_partners FOR SELECT USING (true);

CREATE POLICY "Admin write service_partners"
  ON service_partners FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Partner leads (WhatsApp clicks + callback form submissions)
CREATE TABLE IF NOT EXISTS partner_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  partner_id    uuid REFERENCES service_partners(id) ON DELETE SET NULL,
  action_type   text NOT NULL CHECK (action_type IN ('whatsapp','callback')),
  contact_name  text,
  contact_phone text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE partner_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own leads"
  ON partner_leads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin read all leads"
  ON partner_leads FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed sample partners
INSERT INTO service_partners (title, description, category, subcategory, whatsapp_number, display_order) VALUES
  ('שירה לוי — דולה',          'ליווי אישי בלידה ואחריה, תמיכה רגשית ומקצועית לאמא ולבן הזוג', 'pregnancy', 'doula',       '972501234501', 1),
  ('מרכז שורשים — רצפת אגן',   'פיזיותרפיה של רצפת האגן — לפני ואחרי לידה, טיפול בכאבי גב ואגן', 'pregnancy', 'pelvic_floor','972501234502', 2),
  ('סטודיו לוטוס',              'שיעורי יוגה ופילאטיס מותאמים להריון, בקבוצות קטנות',            'pregnancy', 'studio',      '972501234503', 3),
  ('ד"ר מיכל כהן — יועצת הנקה','ייעוץ הנקה מוסמך, ביקורי בית והנחיית אמהות חדשות',             'motherhood','lactation',   '972501234504', 1),
  ('קליניקת תנועה — אוסטאופתיה','טיפול אוסטאופתי לתינוקות ואמהות — כאבי גוף לאחר לידה',        'motherhood','osteopath',   '972501234505', 2),
  ('פיזיו-לייף',                'שיקום רצפת האגן לאחר לידה, ייעוץ ריצה וחזרה לפעילות גופנית',   'motherhood','physio',      '972501234506', 3)
ON CONFLICT DO NOTHING;
