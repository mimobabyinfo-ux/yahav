/*
  # Add Video URL to Workshops

  1. Changes
    - Add `video_url` column to workshops table
      - text, nullable
      - URL to a preview or workshop video

  2. Notes
    - Complements image_url for richer workshop presentation
    - Existing workshops will have NULL video_url
*/

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS video_url text;
