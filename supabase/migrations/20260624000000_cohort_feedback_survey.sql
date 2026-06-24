-- End-of-workshop feedback survey.
--
-- DISTINCT from workshops.linked_form_id (the OPENING / developmental
-- form shown in the customer card when a cohort starts). This adds a
-- SEPARATE feedback survey that is emailed to a cohort's registrants a
-- couple of days AFTER the cohort ends.
--
-- Pieces:
--   workshops.feedback_form_id        -- which form to send (FK forms)
--   workshop_cohorts.end_date         -- when the cohort ends (editable;
--                                        app auto-suggests start + 4w)
--   workshop_cohorts.survey_sent_at   -- guard so we never email twice
--   global_settings.survey_email_delay_days -- days after end_date to send
--
-- All date comparisons in the sender run in Asia/Jerusalem.

-- 1) Feedback form on the workshop. Nullable so existing workshops stay
--    valid; ON DELETE SET NULL so deleting a form just unlinks it.
--    Independent from linked_form_id (opening form).
ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS feedback_form_id uuid
    REFERENCES forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshops_feedback_form
  ON workshops (feedback_form_id)
  WHERE feedback_form_id IS NOT NULL;

-- 2) Cohort end date. Nullable. The admin UI auto-suggests
--    start_date + 4 weeks when start_date is set, but it is stored as a
--    real, per-cohort editable column so it can be overridden.
ALTER TABLE workshop_cohorts
  ADD COLUMN IF NOT EXISTS end_date date;

-- 3) Marks that the feedback email was already sent for this cohort, so
--    the daily job never sends twice. NULL = not yet sent.
ALTER TABLE workshop_cohorts
  ADD COLUMN IF NOT EXISTS survey_sent_at timestamptz;

-- 4) How many days after end_date to send the survey. Default 2.
--    UNIQUE(setting_key) already exists on global_settings (used for
--    upserts elsewhere), so ON CONFLICT keeps this idempotent and does
--    NOT clobber an admin-edited value on re-run.
INSERT INTO global_settings (setting_key, setting_value, setting_type, category, description)
VALUES (
  'survey_email_delay_days', '2', 'number', 'surveys',
  'מספר הימים אחרי תאריך סיום המחזור שבו נשלח מייל שאלון המשוב'
)
ON CONFLICT (setting_key) DO NOTHING;
