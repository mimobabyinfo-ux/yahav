-- Create private diaper-photos storage bucket
-- Diaper photos contain images of babies in undressed states — must NOT be public.
-- Signed URLs (1h TTL) generated client-side on every read.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diaper-photos',
  'diaper-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Path structure: {user_id}/{child_id_or_user_id}/{timestamp}.{ext}
-- Only the uploading user can insert / read / delete their own photos.

CREATE POLICY "diaper_photos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'diaper-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "diaper_photos_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'diaper-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "diaper_photos_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'diaper-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
