/*
  # Add Payment Link to Workshops

  1. Changes
    - Add `payment_link` column to workshops table
      - text, nullable
      - External URL for purchasing the workshop

  2. Notes
    - Existing workshops will have NULL payment_link
*/

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS payment_link text;
