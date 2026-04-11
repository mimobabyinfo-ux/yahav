-- Form assignments: admin assigns a specific form to a specific user
CREATE TABLE IF NOT EXISTS form_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES user_profiles(id),
  is_completed boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, user_id)
);

ALTER TABLE form_assignments ENABLE ROW LEVEL SECURITY;

-- Users can read their own assignments
CREATE POLICY "Users see own assignments"
  ON form_assignments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can manage all assignments (uses existing is_admin() function)
CREATE POLICY "Admins manage assignments"
  ON form_assignments FOR ALL
  USING (is_admin());

-- Add stock_quantity to workshops table (for product management)
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS stock_quantity integer;

-- Add phone_whatsapp to workshops (optional per-product WhatsApp override)
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS whatsapp_number text;
