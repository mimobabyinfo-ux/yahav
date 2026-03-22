/*
  # Add Video Storage Bucket

  1. Changes
    - Create a Supabase Storage bucket for video uploads
    - Bucket: 'videos' - public read, authenticated write
    - Bucket: 'images' - public read, authenticated write (for thumbnails and logos)

  2. Security
    - Public read for media delivery
    - Authenticated users can upload
    - Admin-only write enforced at application level

  3. Notes
    - Supabase storage buckets are created via the dashboard or this migration
    - File size limit will be set in next migration
*/

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('videos', 'videos', true),
  ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read from buckets
CREATE POLICY "Public read videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "Public read images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Authenticated upload images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'images');
