-- Add optional metadata columns to form_assignments
-- Required by the assignment modal: custom task title, description, and due date
ALTER TABLE form_assignments ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE form_assignments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE form_assignments ADD COLUMN IF NOT EXISTS due_date date;
