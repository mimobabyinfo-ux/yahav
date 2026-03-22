/*
  # Update Video Bucket Size Limit

  1. Changes
    - Update 'videos' bucket to allow files up to 500MB
    - Update 'images' bucket to allow files up to 10MB
    - Set allowed MIME types for each bucket

  2. Notes
    - 500MB supports HD video files
    - MIME type restriction improves security
*/

UPDATE storage.buckets
SET
  file_size_limit = 524288000, -- 500MB in bytes
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
WHERE id = 'videos';

UPDATE storage.buckets
SET
  file_size_limit = 10485760, -- 10MB in bytes
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
WHERE id = 'images';
