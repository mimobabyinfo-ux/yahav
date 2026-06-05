-- Phase 5 / A2 Part 2: one questionnaire per workshop. Admin sets
-- this from the workshop editor (the "שאלון משויך" dropdown). The
-- linked form drives:
--   - the customer card's "did this mother fill the questionnaire"
--     indicator (Part 3)
--   - the cohort-side gap report (Part 4): "5 מתוך 7 מילאו"
--
-- Nullable so existing workshops stay valid; ON DELETE SET NULL so
-- deleting a form simply unlinks it from any workshops that pointed
-- at it (the workshops themselves keep working).
--
-- Single form per workshop is enough for v1 — if you ever need
-- multiple, swap this for a workshop_forms join table.

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS linked_form_id uuid
    REFERENCES forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshops_linked_form
  ON workshops (linked_form_id)
  WHERE linked_form_id IS NOT NULL;
