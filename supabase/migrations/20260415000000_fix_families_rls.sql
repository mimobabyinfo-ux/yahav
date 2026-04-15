-- Fix: allow authenticated users to read families table (needed for invite code lookup)
-- Without this, joinFamily() silently fails because RLS blocks the SELECT

-- Drop existing policies on families if any (safe to re-run)
DROP POLICY IF EXISTS "families_read_own" ON families;
DROP POLICY IF EXISTS "families_authenticated_read" ON families;

-- Allow any authenticated user to read families (needed to look up by invite_code)
CREATE POLICY "families_authenticated_read" ON families
  FOR SELECT TO authenticated
  USING (true);

-- Allow authenticated users to insert their own family
DROP POLICY IF EXISTS "families_insert_own" ON families;
CREATE POLICY "families_insert_own" ON families
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allow family creator to update their family
DROP POLICY IF EXISTS "families_update_own" ON families;
CREATE POLICY "families_update_own" ON families
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());
