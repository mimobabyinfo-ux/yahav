/*
  # Add Feeding Timers Support

  1. Changes
    - Ensure additional_data jsonb column supports feeding timer data
    - Structure: { "feeding_type": "breast", "breast_side": "right" }

  2. Notes
    - No schema changes required - jsonb is already flexible
    - This migration documents the expected additional_data structure for feeding timers
*/

-- Document feeding timer additional_data structure via comment
COMMENT ON COLUMN active_timers.additional_data IS
  'Feeding: {"feeding_type": "breast|bottle|solid", "breast_side": "left|right|both"}
   Sleep: {"sleep_type": "nap|night"}
   Pumping: {}';
