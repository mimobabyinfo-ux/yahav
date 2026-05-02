-- Private storage bucket for milestone photos and videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'milestone-media',
  'milestone-media',
  false,
  52428800,  -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload their own milestone media
CREATE POLICY "milestone_media_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'milestone-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can read milestone media they own or from family members
CREATE POLICY "milestone_media_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'milestone-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM user_profiles me
        JOIN user_profiles them ON them.family_id = me.family_id
        WHERE me.id = auth.uid()
          AND them.id::text = (storage.foldername(name))[1]
          AND me.family_id IS NOT NULL
      )
    )
  );

-- Authenticated users can delete their own milestone media
CREATE POLICY "milestone_media_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'milestone-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
