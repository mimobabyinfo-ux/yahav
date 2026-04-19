-- Workshop content items (videos, homework, PDFs) per workshop
CREATE TABLE IF NOT EXISTS workshop_content (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('video', 'homework', 'pdf')),
  title         text NOT NULL,
  description   text,
  url           text,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE workshop_content ENABLE ROW LEVEL SECURITY;

-- Users see content only for workshops they have active access to
CREATE POLICY "users_read_accessible_content"
  ON workshop_content FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM purchased_workshops pw
      WHERE pw.workshop_id = workshop_content.workshop_id
        AND pw.user_id = auth.uid()
        AND pw.access_start_date <= CURRENT_DATE
        AND pw.access_end_date >= CURRENT_DATE
    )
  );

-- Admins manage everything
CREATE POLICY "admins_manage_workshop_content"
  ON workshop_content FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true));
