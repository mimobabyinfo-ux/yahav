-- Add tasks_json column to workshop_content for homework checklists
ALTER TABLE workshop_content ADD COLUMN IF NOT EXISTS tasks_json jsonb;

-- User homework progress (persisted per task per content item)
CREATE TABLE IF NOT EXISTS user_homework_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id   uuid NOT NULL REFERENCES workshop_content(id) ON DELETE CASCADE,
  task_index   integer NOT NULL,
  completed    boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  UNIQUE(user_id, content_id, task_index)
);

ALTER TABLE user_homework_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_homework"
  ON user_homework_progress FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Storage bucket for workshop videos & PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('workshop-content', 'workshop-content', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "admin_upload_workshop_content" ON storage.objects;
CREATE POLICY "admin_upload_workshop_content"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workshop-content'
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_workshop_content" ON storage.objects;
CREATE POLICY "admin_delete_workshop_content"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workshop-content'
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "public_read_workshop_content" ON storage.objects;
CREATE POLICY "public_read_workshop_content"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'workshop-content');

-- Migrate existing videos → סדנת עיסוי תינוקות workshop
DO $$
DECLARE
  v_workshop_id uuid;
BEGIN
  SELECT id INTO v_workshop_id
  FROM workshops
  WHERE title ILIKE '%עיסוי%'
  LIMIT 1;

  IF v_workshop_id IS NOT NULL THEN
    INSERT INTO workshop_content (workshop_id, type, title, description, url, display_order)
    SELECT
      v_workshop_id,
      'video',
      v.title,
      v.description,
      v.video_url,
      v.display_order
    FROM videos v
    WHERE v.is_active = true
      AND v.video_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM workshop_content wc
        WHERE wc.workshop_id = v_workshop_id AND wc.title = v.title
      );
  END IF;
END $$;
