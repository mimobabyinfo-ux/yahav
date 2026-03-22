/*
  # Change Feeding Duration to Decimal

  1. Changes
    - Change `feeding_details.duration_minutes` from integer to numeric(5,2)
    - Allows sub-minute precision for timer-based feeding logs

  2. Notes
    - Existing integer data will be cast automatically
    - numeric(5,2) supports up to 999.99 minutes
*/

ALTER TABLE feeding_details
  ALTER COLUMN duration_minutes TYPE numeric(5, 2)
  USING duration_minutes::numeric(5, 2);
